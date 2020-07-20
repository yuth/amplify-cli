import { DeletionPolicy, AppSync } from 'cloudform-types';
import {
  DirectiveNode,
  ObjectTypeDefinitionNode,
  InputObjectTypeDefinitionNode,
  FieldDefinitionNode,
  InterfaceTypeDefinitionNode,
  GraphQLObjectType,
} from 'graphql';
import {
  blankObject,
  makeConnectionField,
  makeField,
  makeInputValueDefinition,
  wrapNonNull,
  makeNamedType,
  makeNonNullType,
  ModelResourceIDs,
  ResolverResourceIDs,
  getBaseType,
  graphqlName,
  toUpper,
  plurality,
} from 'graphql-transformer-common';
import {
  getDirectiveArguments,
  gql,
  Transformer,
  TransformerContext,
  SyncConfig,
  TransformerModelProvider,
} from 'graphql-transformer-core';
import {
  getNonModelObjectArray,
  makeCreateInputObject,
  makeDeleteInputObject,
  makeEnumFilterInputObjects,
  makeModelConnectionType,
  makeModelSortDirectionEnumObject,
  makeModelXFilterInputObject,
  makeNonModelInputObject,
  makeScalarFilterInputs,
  makeSubscriptionField,
  makeUpdateInputObject,
  makeModelXConditionInputObject,
  makeAttributeTypeEnum,
} from './definitions';
import { ModelDirectiveArgs, getCreatedAtFieldName, getUpdatedAtFieldName } from './ModelDirectiveArgs';
import { ResourceFactory } from './resources';
import { doesNotReject } from 'assert';
import { ModelCapabilities, QueryFieldType, MutationFieldType, SubscriptionFieldType } from 'graphql-transformer-core/lib/ITransformer';
import { BaseResolver } from 'graphql-transformer-core/lib/util/BaseResolver';

const METADATA_KEY = 'DynamoDBTransformerMetadata';

// export type ModelObject = {
//   name: string;
//   stackName: string;

// }
// export type NonModelObject = {
//   name: string
// }
export interface DynamoDBModelTransformerOptions {
  EnableDeletionProtection?: boolean;
  SyncConfig?: SyncConfig;
}

// Transform config version constants
// We have constants instead of magic number all around, later these should be moved to feature
// flags and transformers should be feature and not version dependent.

// To support generation of conditions and new naming, version 5 was introduced
export const CONDITIONS_MINIMUM_VERSION = 5;

/**
 * The @model transformer.
 *
 * This transform creates a single DynamoDB table for all of your application's
 * data. It uses a standard key structure and nested map to store object values.
 * A relationKey field
 *
 * {
 *  type (HASH),
 *  id (SORT),
 *  value (MAP),
 *  createdAt, (LSI w/ type)
 *  updatedAt (LSI w/ type)
 * }
 */

export const directiveDefinition = gql`
  directive @model(
    queries: ModelQueryMap
    mutations: ModelMutationMap
    subscriptions: ModelSubscriptionMap
    timestamps: TimestampConfiguration
  ) on OBJECT
  input ModelMutationMap {
    create: String
    update: String
    delete: String
  }
  input ModelQueryMap {
    get: String
    list: String
  }
  input ModelSubscriptionMap {
    onCreate: [String]
    onUpdate: [String]
    onDelete: [String]
    level: ModelSubscriptionLevel
  }
  enum ModelSubscriptionLevel {
    off
    public
    on
  }
  input TimestampConfiguration {
    createdAt: String
    updatedAt: String
  }
`;

export class DynamoDBModelTransformer extends Transformer implements TransformerModelProvider {
  readonly transformerName = 'DynamoDBModelTransformer';
  readonly capabilities = [ModelCapabilities.SUPPORT_AUTH];
  resources: ResourceFactory;
  opts: DynamoDBModelTransformerOptions;
  private modelTypes: string[] = [];

  constructor(opts: DynamoDBModelTransformerOptions = {}) {
    super('DynamoDBModelTransformer', directiveDefinition);
    this.opts = this.getOpts(opts);
    this.resources = new ResourceFactory();
  }

  public before = (ctx: TransformerContext): void => {
    const template = this.resources.initTemplate();
    ctx.mergeResources(template.Resources);
    ctx.mergeParameters(template.Parameters);
    ctx.mergeOutputs(template.Outputs);
    ctx.mergeConditions(template.Conditions);
  };

  public after = (ctx: TransformerContext): void => {
    // append hoisted initalization code to the top of request mapping template
    const ddbMetata = ctx.metadata.get(METADATA_KEY);
    if (ddbMetata) {
      Object.entries(ddbMetata.hoistedRequestMappingContent || {}).forEach(([resourceId, hoistedContent]) => {
        const resource: AppSync.Resolver = ctx.getResource(resourceId) as any;
        resource.Properties.RequestMappingTemplate = [hoistedContent, resource.Properties.RequestMappingTemplate].join('\n');
        ctx.setResource(resourceId, resource);
      });
    }
  };

  /**
   * Given the initial input and context manipulate the context to handle this object directive.
   * @param initial The input passed to the transform.
   * @param ctx The accumulated context for the transform.
   */
  public object = (def: ObjectTypeDefinitionNode, directive: DirectiveNode, ctx: TransformerContext): void => {
    // Add a stack mapping so that all model resources are pulled
    // into their own stack at the end of the transformation.
    const typeName = def.name.value;
    this.modelTypes.push(typeName);
  };

  public transformSchema = (ctx: TransformerContext) => {
    this.modelTypes.forEach(modelName => {
      const model = ctx.getObject(modelName);
      const directive = model.directives?.find(d => d.name.value === 'model');
      const nonModelArray: ObjectTypeDefinitionNode[] = getNonModelObjectArray(model, ctx, new Map<string, ObjectTypeDefinitionNode>());

      nonModelArray.forEach((value: ObjectTypeDefinitionNode) => {
        const nonModelObject = makeNonModelInputObject(value, nonModelArray, ctx);
        if (!this.typeExist(nonModelObject.name.value, ctx)) {
          ctx.addInput(nonModelObject);
        }
      });

      this.createQueries(model, directive, ctx);
      this.createMutations(model, directive, ctx, nonModelArray);
      this.createSubscriptions(model, directive, ctx);
      // Update ModelXConditionInput type
      this.updateMutationConditionInput(ctx, model);

      // change type to include sync related fields if sync is enabled
      const isSyncEnabled = this.opts.SyncConfig ? true : false;
      if (isSyncEnabled) {
        const obj = ctx.getObject(model.name.value);
        const newFields = [
          ...obj.fields,
          makeField('_version', [], wrapNonNull(makeNamedType('Int'))),
          makeField('_deleted', [], makeNamedType('Boolean')),
          makeField('_lastChangedAt', [], wrapNonNull(makeNamedType('AWSTimestamp'))),
        ];

        const newObj = {
          ...obj,
          fields: newFields,
        };

        ctx.updateObject(newObj);
      }
      this.addTimestampFields(model, directive, ctx);
    });
  };

  public generateResolvers = (ctx: TransformerContext) => {
    this.modelTypes.forEach(modelName => {
      const model = ctx.getObject(modelName);
      // Create the dynamodb table to hold the @model type
      // TODO: Handle types with more than a single "id" hash key
      this.setSyncConfig(ctx, modelName);
      const isSyncEnabled = this.opts.SyncConfig ? true : false;
      const tableLogicalID = ModelResourceIDs.ModelTableResourceID(modelName);
      const iamRoleLogicalID = ModelResourceIDs.ModelTableIAMRoleID(modelName);
      const dataSourceRoleLogicalID = ModelResourceIDs.ModelTableDataSourceID(modelName);
      const deletionPolicy = this.opts.EnableDeletionProtection ? DeletionPolicy.Retain : DeletionPolicy.Delete;
      ctx.setResource(tableLogicalID, this.resources.makeModelTable(modelName, undefined, undefined, deletionPolicy, isSyncEnabled));
      ctx.mapResourceToStack(modelName, tableLogicalID);
      ctx.setResource(iamRoleLogicalID, this.resources.makeIAMRole(modelName, this.opts.SyncConfig));
      ctx.mapResourceToStack(modelName, iamRoleLogicalID);
      ctx.setResource(
        dataSourceRoleLogicalID,
        this.resources.makeDynamoDBDataSource(tableLogicalID, iamRoleLogicalID, modelName, isSyncEnabled),
      );
      ctx.mapResourceToStack(modelName, dataSourceRoleLogicalID);

      const streamArnOutputId = `GetAtt${ModelResourceIDs.ModelTableStreamArn(modelName)}`;
      ctx.setOutput(
        // "GetAtt" is a backward compatibility addition to prevent breaking current deploys.
        streamArnOutputId,
        this.resources.makeTableStreamArnOutput(tableLogicalID),
      );
      ctx.mapResourceToStack(modelName, streamArnOutputId);

      const datasourceOutputId = `GetAtt${dataSourceRoleLogicalID}Name`;
      ctx.setOutput(datasourceOutputId, this.resources.makeDataSourceOutput(dataSourceRoleLogicalID));
      ctx.mapResourceToStack(modelName, datasourceOutputId);

      const tableNameOutputId = `GetAtt${tableLogicalID}Name`;
      ctx.setOutput(tableNameOutputId, this.resources.makeTableNameOutput(tableLogicalID));
      ctx.mapResourceToStack(modelName, tableNameOutputId);
    });
  };

  private addTimestampFields(def: ObjectTypeDefinitionNode, directive: DirectiveNode, ctx: TransformerContext): void {
    const createdAtField = getCreatedAtFieldName(directive);
    const updatedAtField = getUpdatedAtFieldName(directive);
    const existingCreatedAtField = def.fields.find(f => f.name.value === createdAtField);
    const existingUpdatedAtField = def.fields.find(f => f.name.value === updatedAtField);
    // Todo: Consolidate how warnings are shown. Instead of printing them here, the invoker of transformer should get
    // all the warnings together and decide how to render those warning
    if (!DynamoDBModelTransformer.isTimestampCompatibleField(existingCreatedAtField)) {
      console.log(
        `${def.name.value}.${existingCreatedAtField.name.value} is of type ${getBaseType(
          existingCreatedAtField.type,
        )}. To support auto population change the type to AWSDateTime or String`,
      );
    }
    if (!DynamoDBModelTransformer.isTimestampCompatibleField(existingUpdatedAtField)) {
      console.log(
        `${def.name.value}.${existingUpdatedAtField.name.value} is of type ${getBaseType(
          existingUpdatedAtField.type,
        )}. To support auto population change the type to AWSDateTime or String`,
      );
    }
    const obj = ctx.getObject(def.name.value);
    const newObj: ObjectTypeDefinitionNode = {
      ...obj,
      fields: [
        ...obj.fields,
        ...(createdAtField && !existingCreatedAtField ? [makeField(createdAtField, [], wrapNonNull(makeNamedType('AWSDateTime')))] : []), // createdAt field
        ...(updatedAtField && !existingUpdatedAtField ? [makeField(updatedAtField, [], wrapNonNull(makeNamedType('AWSDateTime')))] : []), // updated field
      ],
    };
    ctx.updateObject(newObj);
  }

  private createMutations = (
    def: ObjectTypeDefinitionNode,
    directive: DirectiveNode,
    ctx: TransformerContext,
    nonModelArray: ObjectTypeDefinitionNode[],
  ) => {
    const typeName = def.name.value;
    const isSyncEnabled = this.opts.SyncConfig ? true : false;

    const mutationFields = [];
    // Get any name overrides provided by the user. If an empty map it provided
    // then we do not generate those fields.
    const directiveArguments: ModelDirectiveArgs = getDirectiveArguments(directive);

    // Configure mutations based on *mutations* argument
    let shouldMakeCreate = true;
    let shouldMakeUpdate = true;
    let shouldMakeDelete = true;
    let createFieldNameOverride = undefined;
    let updateFieldNameOverride = undefined;
    let deleteFieldNameOverride = undefined;

    // timestamp fields
    const createdAtField = getCreatedAtFieldName(directive);
    const updatedAtField = getUpdatedAtFieldName(directive);

    const existingCreatedAtField = def.fields.find(f => f.name.value === createdAtField);
    const existingUpdatedAtField = def.fields.find(f => f.name.value === updatedAtField);

    // auto populate the timestamp field only if they are of AWSDateTime type
    const timestampFields = {
      createdAtField: DynamoDBModelTransformer.isTimestampCompatibleField(existingCreatedAtField) ? createdAtField : undefined,
      updatedAtField: DynamoDBModelTransformer.isTimestampCompatibleField(existingUpdatedAtField) ? updatedAtField : undefined,
    };

    // Figure out which mutations to make and if they have name overrides
    if (directiveArguments.mutations === null) {
      shouldMakeCreate = false;
      shouldMakeUpdate = false;
      shouldMakeDelete = false;
    } else if (directiveArguments.mutations) {
      if (!directiveArguments.mutations.create) {
        shouldMakeCreate = false;
      } else {
        createFieldNameOverride = directiveArguments.mutations.create;
      }
      if (!directiveArguments.mutations.update) {
        shouldMakeUpdate = false;
      } else {
        updateFieldNameOverride = directiveArguments.mutations.update;
      }
      if (!directiveArguments.mutations.delete) {
        shouldMakeDelete = false;
      } else {
        deleteFieldNameOverride = directiveArguments.mutations.delete;
      }
    }

    const conditionInputName = ModelResourceIDs.ModelConditionInputTypeName(typeName);

    // Create the mutations.
    if (shouldMakeCreate) {
      const createInput = makeCreateInputObject(def, directive, nonModelArray, ctx, isSyncEnabled);
      if (!ctx.getType(createInput.name.value)) {
        ctx.addInput(createInput);
      }
      const createResolver = this.resources.makeCreateResolver({
        type: def.name.value,
        nameOverride: createFieldNameOverride,
        syncConfig: this.opts.SyncConfig,
      });
      const resolver = ctx.resolvers.addMutationResolver(
        createResolver.typeName,
        createResolver.fieldName,
        createResolver.dataSourceName,
        createResolver.requestMappingTemplate,
        createResolver.responseMappingTemplate,
      );

      const hositedInitalization = this.resources.initalizeDefaultInputForCreateMutation(createInput, timestampFields);
      resolver.addSlot('init', hositedInitalization);
      const resourceId = ResolverResourceIDs.DynamoDBCreateResolverResourceID(typeName);
      resolver.mapResourceToStack(typeName);
      ctx.mapResourceToStack(typeName, resourceId);
      const args = [makeInputValueDefinition('input', makeNonNullType(makeNamedType(createInput.name.value)))];
      if (this.supportsConditions(ctx)) {
        args.push(makeInputValueDefinition('condition', makeNamedType(conditionInputName)));
      }
      mutationFields.push(makeField(createResolver.fieldName, args, makeNamedType(def.name.value)));
    }

    if (shouldMakeUpdate) {
      const updateInput = makeUpdateInputObject(def, nonModelArray, ctx, isSyncEnabled);
      if (!ctx.getType(updateInput.name.value)) {
        ctx.addInput(updateInput);
      }
      const updateResolver = this.resources.makeUpdateResolver({
        type: def.name.value,
        nameOverride: updateFieldNameOverride,
        syncConfig: this.opts.SyncConfig,
        timestamps: timestampFields,
      });
      const resourceId = ResolverResourceIDs.DynamoDBUpdateResolverResourceID(typeName);
      const resolver = ctx.resolvers.addMutationResolver(
        updateResolver.typeName,
        updateResolver.fieldName,
        updateResolver.dataSourceName,
        updateResolver.requestMappingTemplate,
        updateResolver.responseMappingTemplate,
      );
      resolver.mapResourceToStack(typeName);
      ctx.mapResourceToStack(typeName, resourceId);
      const args = [makeInputValueDefinition('input', makeNonNullType(makeNamedType(updateInput.name.value)))];
      if (this.supportsConditions(ctx)) {
        args.push(makeInputValueDefinition('condition', makeNamedType(conditionInputName)));
      }
      mutationFields.push(makeField(updateResolver.fieldName.toString(), args, makeNamedType(def.name.value)));
    }

    if (shouldMakeDelete) {
      const deleteInput = makeDeleteInputObject(def, isSyncEnabled);
      if (!ctx.getType(deleteInput.name.value)) {
        ctx.addInput(deleteInput);
      }
      const deleteResolver = this.resources.makeDeleteResolver({
        type: def.name.value,
        nameOverride: deleteFieldNameOverride,
        syncConfig: this.opts.SyncConfig,
      });
      const resolver = ctx.resolvers.addMutationResolver(
        deleteResolver.typeName,
        deleteResolver.fieldName,
        deleteResolver.dataSourceName,
        deleteResolver.requestMappingTemplate,
        deleteResolver.responseMappingTemplate,
      );
      resolver.mapResourceToStack(typeName);
      const args = [makeInputValueDefinition('input', makeNonNullType(makeNamedType(deleteInput.name.value)))];
      if (this.supportsConditions(ctx)) {
        args.push(makeInputValueDefinition('condition', makeNamedType(conditionInputName)));
      }
      mutationFields.push(makeField(deleteResolver.fieldName.toString(), args, makeNamedType(def.name.value)));
    }
    ctx.addMutationFields(mutationFields);

    if (shouldMakeCreate || shouldMakeUpdate || shouldMakeDelete) {
      this.generateConditionInputs(ctx, def);
    }
  };

  private createQueries = (def: ObjectTypeDefinitionNode, directive: DirectiveNode, ctx: TransformerContext) => {
    const typeName = def.name.value;
    const queryFields = [];
    const directiveArguments: ModelDirectiveArgs = getDirectiveArguments(directive);

    // Configure queries based on *queries* argument
    let shouldMakeGet = true;
    let shouldMakeList = true;
    let getFieldNameOverride = undefined;
    let listFieldNameOverride = undefined;
    const isSyncEnabled = this.opts.SyncConfig ? true : false;

    // Figure out which queries to make and if they have name overrides.
    // If queries is undefined (default), create all queries
    // If queries is explicetly set to null, do not create any
    // else if queries is defined, check overrides
    if (directiveArguments.queries === null) {
      shouldMakeGet = false;
      shouldMakeList = false;
    } else if (directiveArguments.queries) {
      if (!directiveArguments.queries.get) {
        shouldMakeGet = false;
      } else {
        getFieldNameOverride = directiveArguments.queries.get;
      }
      if (!directiveArguments.queries.list) {
        shouldMakeList = false;
      } else {
        listFieldNameOverride = directiveArguments.queries.list;
      }
    }

    if (shouldMakeList) {
      if (!this.typeExist('ModelSortDirection', ctx)) {
        const tableSortDirection = makeModelSortDirectionEnumObject();
        ctx.addEnum(tableSortDirection);
      }
    }

    // Create sync query
    if (isSyncEnabled) {
      const syncResolver = this.resources.makeSyncResolver(typeName);
      const syncResourceID = ResolverResourceIDs.SyncResolverResourceID(typeName);
      ctx.setResource(syncResourceID, syncResolver);
      ctx.mapResourceToStack(typeName, syncResourceID);
      this.generateModelXConnectionType(ctx, def, isSyncEnabled);
      this.generateFilterInputs(ctx, def);
      queryFields.push(
        makeField(
          syncResolver.Properties.FieldName.toString(),
          [
            makeInputValueDefinition('filter', makeNamedType(ModelResourceIDs.ModelFilterInputTypeName(def.name.value))),
            makeInputValueDefinition('limit', makeNamedType('Int')),
            makeInputValueDefinition('nextToken', makeNamedType('String')),
            makeInputValueDefinition('lastSync', makeNamedType('AWSTimestamp')),
          ],
          makeNamedType(ModelResourceIDs.ModelConnectionTypeName(def.name.value)),
        ),
      );
    }

    // Create get queries
    if (shouldMakeGet) {
      const getResolver = this.resources.makeGetResolver(def.name.value, getFieldNameOverride, isSyncEnabled, ctx.getQueryTypeName());
      const resolver = ctx.resolvers.addQueryResolver(
        getResolver.typeName,
        getResolver.fieldName,
        getResolver.dataSourceName,
        getResolver.requestMappingTemplate,
        getResolver.responseMappingTemplate,
      );
      resolver.mapResourceToStack(typeName);
      const resourceId = ResolverResourceIDs.DynamoDBGetResolverResourceID(typeName);
      ctx.mapResourceToStack(typeName, resourceId);

      queryFields.push(
        makeField(
          getResolver.fieldName.toString(),
          [makeInputValueDefinition('id', makeNonNullType(makeNamedType('ID')))],
          makeNamedType(def.name.value),
        ),
      );
    }

    if (shouldMakeList) {
      this.generateModelXConnectionType(ctx, def);

      // Create the list resolver
      const listResolver = this.resources.makeListResolver(def.name.value, listFieldNameOverride, isSyncEnabled, ctx.getQueryTypeName());
      const resourceId = ResolverResourceIDs.DynamoDBListResolverResourceID(typeName);
      const resolver = ctx.resolvers.addQueryResolver(
        listResolver.typeName,
        listResolver.fieldName,
        listResolver.dataSourceName,
        listResolver.requestMappingTemplate,
        listResolver.responseMappingTemplate,
      );
      resolver.mapResourceToStack(typeName);
      ctx.mapResourceToStack(typeName, resourceId);

      queryFields.push(makeConnectionField(listResolver.fieldName.toString(), def.name.value));
      this.generateFilterInputs(ctx, def);
    }

    ctx.addQueryFields(queryFields);
  };

  /**
   * Creates subscriptions for a @model object type. By default creates a subscription for
   * create, update, and delete mutations.
   *
   * Subscriptions are one to many in that a subscription may subscribe to multiple mutations.
   * You may thus provide multiple names of the subscriptions that will be triggered by each
   * mutation.
   *
   * type Post @model(subscriptions: { onCreate: ["onPostCreated", "onFeedUpdated"] }) {
   *      id: ID!
   *      title: String!
   * }
   *
   * will create two subscription fields:
   *
   * type Subscription {
   *      onPostCreated: Post @aws_subscribe(mutations: ["createPost"])
   *      onFeedUpdated: Post @aws_subscribe(mutations: ["createPost"])
   * }
   *  Subscription Levels
   *   subscriptions.level === OFF || subscriptions === null
   *      Will not create subscription operations
   *   subcriptions.level === PUBLIC
   *      Will continue as is creating subscription operations
   *   subscriptions.level === ON || subscriptions === undefined
   *      If auth is enabled it will enabled protection on subscription operations and resolvers
   */
  private createSubscriptions = (def: ObjectTypeDefinitionNode, directive: DirectiveNode, ctx: TransformerContext) => {
    const typeName = def.name.value;
    const subscriptionFields = [];

    const directiveArguments: ModelDirectiveArgs = getDirectiveArguments(directive);

    const createFieldName = directiveArguments?.mutations?.create || graphqlName('create' + toUpper(typeName));
    const updateFieldName = directiveArguments?.mutations?.update || graphqlName('update' + toUpper(typeName));
    const deleteFieldName = directiveArguments.mutations?.delete || graphqlName('delete' + toUpper(typeName));

    const mutationTypeName = ctx.getMutationTypeName();
    const subscriptionsArgument = directiveArguments.subscriptions;
    const createResolver = ctx.resolvers.getResolver(mutationTypeName, createFieldName);
    const updateResolver = ctx.resolvers.getResolver(mutationTypeName, updateFieldName);
    const deleteResolver = ctx.resolvers.getResolver(mutationTypeName, deleteFieldName);

    if (subscriptionsArgument === null) {
      return;
    }
    if (subscriptionsArgument && subscriptionsArgument.level === 'off') {
      return;
    }
    // Add the custom subscriptions
    const onCreate = subscriptionsArgument?.onCreate || [ModelResourceIDs.ModelOnCreateSubscriptionName(typeName)];
    const onUpdate = subscriptionsArgument?.onUpdate || [ModelResourceIDs.ModelOnUpdateSubscriptionName(typeName)];
    const onDelete = subscriptionsArgument?.onDelete || [ModelResourceIDs.ModelOnDeleteSubscriptionName(typeName)];

    // Add the default subscriptions
    if (createResolver) {
      onCreate.forEach(fieldName => {
        const onCreateField = makeSubscriptionField(fieldName, typeName, [createFieldName]);
        subscriptionFields.push(onCreateField);
      });
    }
    if (updateResolver) {
      onUpdate.forEach(fieldName => {
        const onUpdateField = makeSubscriptionField(fieldName, typeName, [updateFieldName]);
        subscriptionFields.push(onUpdateField);
      });
    }
    if (deleteResolver) {
      onDelete.forEach(fieldName => {
        const onDeleteField = makeSubscriptionField(fieldName, typeName, [deleteFieldName]);
        subscriptionFields.push(onDeleteField);
      });
    }

    ctx.addSubscriptionFields(subscriptionFields);
  };

  public generateGetResolver = (
    ctx: TransformerContext,
    type: ObjectTypeDefinitionNode,
    typeName: string,
    fieldName: string,
  ): BaseResolver => {
    if (!this.isModelType(type)) {
      throw new Error(`type ${type.name} does not use @model directive`);
    }
    const resolverConfig = this.resources.makeGetResolver(type.name.value, fieldName, this.opts.SyncConfig ? true : false, typeName);
    return ctx.resolvers.addQueryResolver(
      resolverConfig.typeName,
      resolverConfig.fieldName,
      resolverConfig.dataSourceName,
      resolverConfig.requestMappingTemplate,
      resolverConfig.responseMappingTemplate,
    );
  };

  public generateListResolver = (
    ctx: TransformerContext,
    type: ObjectTypeDefinitionNode,
    typeName: string,
    fieldName: string,
  ): BaseResolver => {
    if (!this.isModelType(type)) {
      throw new Error(`type ${type.name} does not use @model directive`);
    }
    const resolverConfig = this.resources.makeListResolver(type.name.value, fieldName, this.opts.SyncConfig ? true : false, typeName);
    return ctx.resolvers.addQueryResolver(
      resolverConfig.typeName,
      resolverConfig.fieldName,
      resolverConfig.dataSourceName,
      resolverConfig.requestMappingTemplate,
      resolverConfig.responseMappingTemplate,
    );
  };

  public generteCreateResolver = (
    ctx: TransformerContext,
    type: ObjectTypeDefinitionNode,
    typeName: string,
    fieldName: string,
  ): BaseResolver => {
    if (!this.isModelType(type)) {
      throw new Error(`type ${type.name} does not use @model directive`);
    }
    // Todo: Make the signature consistent with queryTypes. Either pass single object or mulitple arguments
    const resolverConfig = this.resources.makeCreateResolver({
      type: type.name.value,
      nameOverride: fieldName,
      syncConfig: this.opts.SyncConfig,
      mutationTypeName: typeName,
    });
    return ctx.resolvers.addMutationResolver(
      resolverConfig.typeName,
      resolverConfig.fieldName,
      resolverConfig.dataSourceName,
      resolverConfig.requestMappingTemplate,
      resolverConfig.responseMappingTemplate,
    );
  };

  public generateUpdateResolver = (
    ctx: TransformerContext,
    type: ObjectTypeDefinitionNode,
    typeName: string,
    fieldName: string,
  ): BaseResolver => {
    if (!this.isModelType(type)) {
      throw new Error(`type ${type.name} does not use @model directive`);
    }
    const resolverConfig = this.resources.makeUpdateResolver({
      type: type.name.value,
      nameOverride: fieldName,
      syncConfig: this.opts.SyncConfig,
      mutationTypeName: typeName,
    });
    return ctx.resolvers.addMutationResolver(
      resolverConfig.typeName,
      resolverConfig.fieldName,
      resolverConfig.dataSourceName,
      resolverConfig.requestMappingTemplate,
      resolverConfig.responseMappingTemplate,
    );
  };

  public generateDeleteResolver = (
    ctx: TransformerContext,
    type: ObjectTypeDefinitionNode,
    typeName: string,
    fieldName: string,
  ): BaseResolver => {
    if (!this.isModelType(type)) {
      throw new Error(`type ${type.name} does not use @model directive`);
    }
    const resolverConfig = this.resources.makeDeleteResolver({
      type: type.name.value,
      nameOverride: fieldName,
      syncConfig: this.opts.SyncConfig,
      mutationTypeName: typeName,
    });
    return ctx.resolvers.addMutationResolver(
      resolverConfig.typeName,
      resolverConfig.fieldName,
      resolverConfig.dataSourceName,
      resolverConfig.requestMappingTemplate,
      resolverConfig.responseMappingTemplate,
    );
  };

  public getQueryFieldNames = (ctx: TransformerContext, type: ObjectTypeDefinitionNode): Record<QueryFieldType, string[]> => {
    const name = type.name.value;
    if (!this.isModelType(type)) {
      throw new Error(`type ${type.name} does not use @model directive`);
    }
    const directive = type.directives.find(d => d.name.value === 'model');
    const directiveArguments: ModelDirectiveArgs = getDirectiveArguments(directive);

    let shouldMakeGet = true;
    let shouldMakeList = true;
    let getQueryFieldName = graphqlName('get' + toUpper(name));
    let listQueryFieldName = graphqlName('list' + plurality(toUpper(name)));

    if (directiveArguments.queries === null) {
      shouldMakeGet = false;
      shouldMakeList = false;
    } else if (directiveArguments.queries) {
      if (!directiveArguments.queries.get) {
        shouldMakeGet = false;
      } else {
        getQueryFieldName = directiveArguments.queries.get;
      }
      if (!directiveArguments.queries.list) {
        shouldMakeList = false;
      } else {
        listQueryFieldName = directiveArguments.queries.list;
      }
    }
    return {
      [QueryFieldType.GET]: shouldMakeGet ? [getQueryFieldName] : [],
      [QueryFieldType.LIST]: shouldMakeList ? [listQueryFieldName] : [],
      [QueryFieldType.SYNC]: this.opts.SyncConfig ? [graphqlName('sync' + toUpper(name))] : [],
    };
  };

  public getMutationFieldNames = (ctx: TransformerContext, type: ObjectTypeDefinitionNode): Record<MutationFieldType, string[]> => {
    const name = type.name.value;
    if (!this.isModelType(type)) {
      throw new Error(`type ${type.name} does not use @model directive`);
    }
    const directive = type.directives.find(d => d.name.value === 'model');
    const directiveArguments: ModelDirectiveArgs = getDirectiveArguments(directive);

    let shouldMakeCreate = true;
    let shouldMakeUpdate = true;
    let shouldMakeDelete = true;

    let createMutationsFieldName = graphqlName('create' + toUpper(name));
    let updateMutationFieldName = graphqlName('update' + toUpper(name));
    let deleteMutationFieldName = graphqlName('delete' + toUpper(name));

    if (directiveArguments.mutations === null) {
      shouldMakeCreate = false;
      shouldMakeUpdate = false;
      shouldMakeDelete = false;
    } else if (directiveArguments.mutations) {
      if (!directiveArguments.mutations.create) {
        shouldMakeCreate = false;
      } else {
        createMutationsFieldName = directiveArguments.mutations.create;
      }
      if (!directiveArguments.mutations.update) {
        shouldMakeUpdate = false;
      } else {
        updateMutationFieldName = directiveArguments.mutations.update;
      }
      if (!directiveArguments.mutations.delete) {
        shouldMakeDelete = false;
      } else {
        updateMutationFieldName = directiveArguments.mutations.delete;
      }
    }
    return {
      [MutationFieldType.CREATE]: shouldMakeCreate ? [createMutationsFieldName] : [],
      [MutationFieldType.UPDATE]: shouldMakeUpdate ? [updateMutationFieldName] : [],
      [MutationFieldType.DELETE]: shouldMakeDelete ? [deleteMutationFieldName] : [],
    };
  };

  public getSubscriptionFieldNames = (ctx: TransformerContext, type: ObjectTypeDefinitionNode): Record<SubscriptionFieldType, string[]> => {
    const name = type.name.value;
    if (!this.isModelType(type)) {
      throw new Error(`type ${type.name} does not use @model directive`);
    }
    const directive = type.directives.find(d => d.name.value === 'model');
    const directiveArguments: ModelDirectiveArgs = getDirectiveArguments(directive);

    let shouldMakeOnCreate = true;
    let shouldMakeOnUpdate = true;
    let shouldMakeOnDelete = true;

    let onCreateFieldName = [graphqlName('onCreate' + toUpper(name))];
    let onUpdateFieldName = [graphqlName('onUpdate' + toUpper(name))];
    let onDeleteFieldName = [graphqlName('onDelete' + toUpper(name))];

    if (directiveArguments.subscriptions === null || directiveArguments.subscriptions.level === 'off') {
      shouldMakeOnCreate = false;
      shouldMakeOnUpdate = false;
      shouldMakeOnDelete = false;
    } else if (directiveArguments.subscriptions) {
      if (!directiveArguments.subscriptions.onCreate) {
        shouldMakeOnCreate = false;
      } else {
        onCreateFieldName = directiveArguments.subscriptions.onCreate;
      }
      if (!directiveArguments.subscriptions.onUpdate) {
        shouldMakeOnUpdate = false;
      } else {
        onUpdateFieldName = directiveArguments.subscriptions.onUpdate;
      }
      if (!directiveArguments.subscriptions.onDelete) {
        shouldMakeOnDelete = false;
      } else {
        onUpdateFieldName = directiveArguments.subscriptions.onDelete;
      }
    }
    return {
      [SubscriptionFieldType.ON_CREATE]: shouldMakeOnCreate ? onCreateFieldName : [],
      [SubscriptionFieldType.ON_UPDATE]: shouldMakeOnUpdate ? onUpdateFieldName : [],
      [SubscriptionFieldType.ON_DELETE]: shouldMakeOnDelete ? onDeleteFieldName : [],
    };
  };

  private isModelType = (type: ObjectTypeDefinitionNode): boolean => {
    return this.modelTypes.includes(type.name.value);
  };
  private typeExist(type: string, ctx: TransformerContext): boolean {
    return Boolean(type in ctx.nodeMap);
  }

  private generateModelXConnectionType(ctx: TransformerContext, def: ObjectTypeDefinitionNode, isSync: Boolean = false): void {
    const tableXConnectionName = ModelResourceIDs.ModelConnectionTypeName(def.name.value);
    if (this.typeExist(tableXConnectionName, ctx)) {
      return;
    }

    // Create the ModelXConnection
    const connectionType = blankObject(tableXConnectionName);
    ctx.addObject(connectionType);
    ctx.addObjectExtension(makeModelConnectionType(def.name.value, isSync));
  }

  private generateFilterInputs(ctx: TransformerContext, def: ObjectTypeDefinitionNode): void {
    const scalarFilters = makeScalarFilterInputs(this.supportsConditions(ctx));
    for (const filter of scalarFilters) {
      if (!this.typeExist(filter.name.value, ctx)) {
        ctx.addInput(filter);
      }
    }

    // Create the Enum filters
    const enumFilters = makeEnumFilterInputObjects(def, ctx, this.supportsConditions(ctx));
    for (const filter of enumFilters) {
      if (!this.typeExist(filter.name.value, ctx)) {
        ctx.addInput(filter);
      }
    }

    // Create the ModelXFilterInput
    const tableXQueryFilterInput = makeModelXFilterInputObject(def, ctx, this.supportsConditions(ctx));
    if (!this.typeExist(tableXQueryFilterInput.name.value, ctx)) {
      ctx.addInput(tableXQueryFilterInput);
    }

    if (this.supportsConditions(ctx)) {
      const attributeTypeEnum = makeAttributeTypeEnum();
      if (!this.typeExist(attributeTypeEnum.name.value, ctx)) {
        ctx.addType(attributeTypeEnum);
      }
    }
  }

  private generateConditionInputs(ctx: TransformerContext, def: ObjectTypeDefinitionNode): void {
    const scalarFilters = makeScalarFilterInputs(this.supportsConditions(ctx));
    for (const filter of scalarFilters) {
      if (!this.typeExist(filter.name.value, ctx)) {
        ctx.addInput(filter);
      }
    }

    // Create the Enum filters
    const enumFilters = makeEnumFilterInputObjects(def, ctx, this.supportsConditions(ctx));
    for (const filter of enumFilters) {
      if (!this.typeExist(filter.name.value, ctx)) {
        ctx.addInput(filter);
      }
    }

    if (this.supportsConditions(ctx)) {
      // Create the ModelXConditionInput
      const tableXMutationConditionInput = makeModelXConditionInputObject(def, ctx, this.supportsConditions(ctx));
      if (!this.typeExist(tableXMutationConditionInput.name.value, ctx)) {
        ctx.addInput(tableXMutationConditionInput);
      }

      const attributeTypeEnum = makeAttributeTypeEnum();
      if (!this.typeExist(attributeTypeEnum.name.value, ctx)) {
        ctx.addType(attributeTypeEnum);
      }
    }
  }

  private getOpts(opts: DynamoDBModelTransformerOptions) {
    const defaultOpts = {
      EnableDeletionProtection: false,
    };
    return {
      ...defaultOpts,
      ...opts,
    };
  }

  private setSyncConfig(ctx: TransformerContext, typeName: string) {
    let syncConfig: SyncConfig;
    const resolverConfig = ctx.getResolverConfig();
    if (resolverConfig && resolverConfig.project) {
      syncConfig = resolverConfig.project;
    }
    if (resolverConfig && resolverConfig.models && resolverConfig.models[typeName]) {
      const typeResolverConfig = resolverConfig.models[typeName];
      if (typeResolverConfig.ConflictDetection && typeResolverConfig.ConflictHandler) {
        syncConfig = typeResolverConfig;
      } else {
        console.warn(`Invalid resolverConfig for type ${typeName}. Using the project resolverConfig instead.`);
      }
    }
    return (this.opts.SyncConfig = syncConfig);
  }

  // Due to the current architecture of Transformers we've to handle the 'id' field removal
  // here, because KeyTranformer will not be invoked if there are no @key directives declared
  // on the type.
  private updateMutationConditionInput(ctx: TransformerContext, type: ObjectTypeDefinitionNode): void {
    if (this.supportsConditions(ctx)) {
      // Get the existing ModelXConditionInput
      const tableXMutationConditionInputName = ModelResourceIDs.ModelConditionInputTypeName(type.name.value);

      if (this.typeExist(tableXMutationConditionInputName, ctx)) {
        const tableXMutationConditionInput = <InputObjectTypeDefinitionNode>ctx.getType(tableXMutationConditionInputName);

        const keyDirectives = type.directives.filter(d => d.name.value === 'key');

        // If there are @key directives defined we've nothing to do, it will handle everything
        if (keyDirectives && keyDirectives.length > 0) {
          return;
        }

        // Remove the field named 'id' from the condition if there is one
        const idField = tableXMutationConditionInput.fields.find(f => f.name.value === 'id');

        if (idField) {
          const reducedFields = tableXMutationConditionInput.fields.filter(f => Boolean(f.name.value !== 'id'));

          const updatedInput = {
            ...tableXMutationConditionInput,
            fields: reducedFields,
          };

          ctx.putType(updatedInput);
        }
      }
    }
  }

  private supportsConditions(context: TransformerContext) {
    return context.getTransformerVersion() >= CONDITIONS_MINIMUM_VERSION;
  }

  private static isTimestampCompatibleField(field?: FieldDefinitionNode): boolean {
    if (field && !(getBaseType(field.type) === 'AWSDateTime' || getBaseType(field.type) === 'String')) {
      return false;
    }
    return true;
  }

  private addInitalizationMetadata(ctx: TransformerContext, resourceId: string, initCode: string): void {
    const ddbMetadata = ctx.metadata.has(METADATA_KEY) ? ctx.metadata.get(METADATA_KEY) : {};
    ddbMetadata.hoistedRequestMappingContent = {
      ...ddbMetadata?.hoistedRequestMappingContent,
      [resourceId]: initCode,
    };
    ctx.metadata.set(METADATA_KEY, ddbMetadata);
  }
}
