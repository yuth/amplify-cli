import { Transformer, TransformerContext, InvalidDirectiveError, gql, getDirectiveArguments } from 'graphql-transformer-core';
import {
  DirectiveNode,
  ObjectTypeDefinitionNode,
  Kind,
  FieldDefinitionNode,
  InterfaceTypeDefinitionNode,
  InputObjectTypeDefinitionNode,
  EnumTypeDefinitionNode,
} from 'graphql';
import { ResourceFactory } from './resources';
import {
  makeModelConnectionType,
  makeModelConnectionField,
  makeScalarFilterInputs,
  makeModelXFilterInputObject,
  makeModelSortDirectionEnumObject,
  SortKeyFieldInfoTypeName,
  CONDITIONS_MINIMUM_VERSION,
  makeAttributeTypeEnum,
  makeEnumFilterInputObjects,
} from 'graphql-dynamodb-transformer';
import {
  getBaseType,
  isListType,
  getDirectiveArgument,
  blankObject,
  isScalar,
  isScalarOrEnum,
  STANDARD_SCALARS,
  toCamelCase,
  isNonNullType,
  attributeTypeFromScalar,
  makeScalarKeyConditionForType,
  makeNamedType,
} from 'graphql-transformer-common';
import { ResolverResourceIDs, ModelResourceIDs } from 'graphql-transformer-common';
import { updateCreateInputWithConnectionField, updateUpdateInputWithConnectionField } from './definitions';
import { KeyTransformer, KeyArguments } from 'graphql-key-transformer';
import Table, { KeySchema, GlobalSecondaryIndex, LocalSecondaryIndex } from 'cloudform-types/types/dynamoDb/table';

const CONNECTION_STACK_NAME = 'ConnectionStack';

interface RelationArguments {
  keyName?: string;
  fields: string[];
  limit?: number;
}

export type ConnectionDirectiveArgs = {
  name?: string;
  keyField?: string;
  sortField?: string;
  keyName?: string;
  limit?: number;
  fields?: string[];
};

function makeConnectionAttributeName(type: string, field?: string) {
  // The same logic is used in amplify-codegen-appsync-model-plugin package to generate association field
  // Make sure the logic gets update in that package
  return field ? toCamelCase([type, field, 'id']) : toCamelCase([type, 'id']);
}

function validateKeyField(field: FieldDefinitionNode): void {
  if (!field) {
    return;
  }
  const baseType = getBaseType(field.type);
  const isAList = isListType(field.type);
  // The only valid key fields are single String and ID fields.
  if ((baseType === 'ID' || baseType === 'String') && !isAList) {
    return;
  }
  throw new InvalidDirectiveError(`If you define a field and specify it as a 'keyField', it must be of type 'ID' or 'String'.`);
}

/**
 * Ensure that the field passed in is compatible to be a key field
 * (Not a list and of type ID or String)
 * @param field: the field to be checked.
 */
function validateKeyFieldConnectionWithKey(field: FieldDefinitionNode, ctx: TransformerContext): void {
  const isNonNull = isNonNullType(field.type);
  const isAList = isListType(field.type);
  const isAScalarOrEnum = isScalarOrEnum(field.type, ctx.getTypeDefinitionsOfKind(Kind.ENUM_TYPE_DEFINITION) as EnumTypeDefinitionNode[]);

  // The only valid key fields are single non-null fields.
  if (!isAList && isNonNull && isAScalarOrEnum) {
    return;
  }
  throw new InvalidDirectiveError(`All fields provided to an @connection must be non-null scalar or enum fields.`);
}

/**
 * Returns the type of the field with the field name specified by finding it from the array of fields
 * and returning its type.
 * @param fields Array of FieldDefinitionNodes to search within.
 * @param fieldName Name of the field whose type is to be fetched.
 */
function getFieldType(relatedType: ObjectTypeDefinitionNode | InterfaceTypeDefinitionNode, fieldName: string) {
  const foundField = relatedType.fields.find(f => f.name.value === fieldName);
  if (!foundField) {
    throw new InvalidDirectiveError(`${fieldName} is not defined in ${relatedType.name.value}.`);
  }
  return foundField.type;
}

/**
 * Checks that the fields being used to query match the expected key types for the index being used.
 * @param parent: All fields of the parent object.
 * @param relatedTypeFields: All fields of the related object.
 * @param inputFieldNames: The fields passed in to the @connection directive.
 * @param keySchema: The key schema for the index being used.
 */
function checkFieldsAgainstIndex(
  parent: ObjectTypeDefinitionNode | InterfaceTypeDefinitionNode,
  relatedType: ObjectTypeDefinitionNode,
  inputFieldNames: string[],
  keySchema: KeySchema[],
  field: Readonly<FieldDefinitionNode>,
): void {
  const hashAttributeName = keySchema[0].AttributeName;
  const tablePKType = getFieldType(relatedType, String(hashAttributeName));
  const queryPKType = getFieldType(parent, inputFieldNames[0]);
  const numFields = inputFieldNames.length;

  if (getBaseType(tablePKType) !== getBaseType(queryPKType)) {
    throw new InvalidDirectiveError(`${inputFieldNames[0]} field is not of type ${getBaseType(tablePKType)}`);
  }
  if (numFields > keySchema.length && keySchema.length !== 2) {
    throw new InvalidDirectiveError('Too many fields passed in to @connection directive.');
  }
  // when sort key is passed, ensure that the length of composite sort key matches the length of the fields passed
  if (numFields > 1) {
    const querySortFields = inputFieldNames.slice(1);
    const tableSortFields = String(keySchema[1].AttributeName).split(ModelResourceIDs.ModelCompositeKeySeparator());
    if (querySortFields.length !== tableSortFields.length) {
      throw new InvalidDirectiveError(`Invalid @connection directive  ${field.name.value}. fields does not accept partial sort key`);
    }
  }
  if (numFields === 2) {
    const sortAttributeName = String(keySchema[1].AttributeName).split(ModelResourceIDs.ModelCompositeKeySeparator())[0];
    const tableSKType = getFieldType(relatedType, String(sortAttributeName));
    const querySKType = getFieldType(parent, inputFieldNames[1]);

    if (getBaseType(tableSKType) !== getBaseType(querySKType)) {
      throw new InvalidDirectiveError(`${inputFieldNames[1]} field is not of type ${getBaseType(tableSKType)}`);
    }
  } else if (numFields > 2) {
    const tableSortFields = String(keySchema[1].AttributeName).split(ModelResourceIDs.ModelCompositeKeySeparator());
    const tableSortKeyTypes = tableSortFields.map(name => getFieldType(relatedType, name));
    const querySortFields = inputFieldNames.slice(1);
    const querySortKeyTypes = querySortFields.map(name => getFieldType(parent, name));

    // Check that types of each attribute match types of the fields that make up the composite sort key for the
    // table or index being queried.
    querySortKeyTypes.forEach((fieldType, index) => {
      if (getBaseType(fieldType) !== getBaseType(tableSortKeyTypes[index])) {
        throw new InvalidDirectiveError(
          `${querySortFields[index]} field is not of type ${getBaseType(tableSortKeyTypes[index])} arguments`,
        );
      }
    });
  }
}

/**
 * The @connection transform.
 *
 * This transform configures the GSIs and resolvers needed to implement
 * relationships at the GraphQL level.
 */
type ConnectionInfo = {
  parent: ObjectTypeDefinitionNode | InterfaceTypeDefinitionNode;
  field: FieldDefinitionNode;
  directive: DirectiveNode;
  parentModelDirective?: DirectiveNode;
  relatedType?: ObjectTypeDefinitionNode | InterfaceTypeDefinitionNode;
  relatedTypeModelDirective?: DirectiveNode;
  connectionName?: string;
  associatedConnectionField?: FieldDefinitionNode;
  associatedSortField?: FieldDefinitionNode;
  limit?: string;
  connectionAttributeName?: string;
  foreignAssociatedSortField?: FieldDefinitionNode;
  sortKeyInfo?: {
    fieldName: string;
    attributeType: 'S' | 'N';
    typeName: string;
  };
};
export class ModelConnectionTransformer extends Transformer {
  resources: ResourceFactory;

  private connectedFields: { typeName: string; fieldName: string }[] = [];
  private connectedFieldInfo: Record<string, ConnectionInfo> = {};
  constructor() {
    super(
      'ModelConnectionTransformer',
      gql`
        directive @connection(
          name: String
          keyField: String
          sortField: String
          keyName: String
          limit: Int
          fields: [String!]
        ) on FIELD_DEFINITION
      `,
    );
    this.resources = new ResourceFactory();
  }

  public before = (ctx: TransformerContext): void => {
    const template = this.resources.initTemplate();
    ctx.mergeResources(template.Resources);
    ctx.mergeParameters(template.Parameters);
    ctx.mergeOutputs(template.Outputs);
  };

  /**
   * Create a 1-1, 1-M, or M-1 connection between two model types.
   * Throws an error if the related type is not an object type annotated with @model.
   */
  public field = (
    parent: ObjectTypeDefinitionNode | InterfaceTypeDefinitionNode,
    field: FieldDefinitionNode,
    directive: DirectiveNode,
    ctx: TransformerContext,
  ): void => {
    const parentTypeName = parent.name.value;
    const fieldName = field.name.value;
    this.connectedFields.push({ typeName: parentTypeName, fieldName });
    this.populate(parent, field, directive, ctx);
  };

  public populate = (
    parent: ObjectTypeDefinitionNode | InterfaceTypeDefinitionNode,
    field: FieldDefinitionNode,
    directive: DirectiveNode,
    ctx: TransformerContext,
  ) => {
    for (const { fieldName, typeName } of this.connectedFields) {
      const parentModelDirective = this.getDirective(parent, 'model');
      const relatedTypeName = getBaseType(field.type);
      const relatedType = ctx.inputDocument.definitions.find(
        d => d.kind === Kind.OBJECT_TYPE_DEFINITION && d.name.value === relatedTypeName,
      ) as ObjectTypeDefinitionNode | undefined;
      const relatedTypeModelDirective = this.getDirective(relatedType, 'model');

      let connectionName = getDirectiveArgument(directive, 'name');

      const associatedConnectionField = this.getRelatedField(field, relatedType, connectionName);
      const associatedSortFieldName = this.getLegacySortFieldName(field);
      const associatedSortField = associatedSortFieldName && this.getField(parent, associatedSortFieldName);

      const limit = getDirectiveArgument(directive, 'limit');

      let connectionAttributeName = getDirectiveArgument(directive, 'keyField');
      const foreignAssociatedSortField = associatedSortFieldName && this.getField(relatedType, associatedSortFieldName);

      const sortKeyInfo = foreignAssociatedSortField
        ? {
            fieldName: foreignAssociatedSortField.name.value,
            attributeType: attributeTypeFromScalar(foreignAssociatedSortField.type),
            typeName: getBaseType(foreignAssociatedSortField.type),
          }
        : undefined;

      this.connectedFieldInfo[`${typeName}.${fieldName}`] = {
        parent,
        field,
        directive,
        parentModelDirective,
        relatedType,
        relatedTypeModelDirective,
        connectionName,
        associatedConnectionField,
        associatedSortField,
        limit,
        connectionAttributeName,
        foreignAssociatedSortField,
        sortKeyInfo,
      };
    }
  };

  public validate = (ctx: TransformerContext): void => {
    for (let { typeName: parentTypeName, fieldName } of this.connectedFields) {
      const connectionInfo = this.connectedFieldInfo[`${parentTypeName}.${fieldName}`];
      const fields = getDirectiveArgument(connectionInfo.directive, 'fields');
      if (fields) {
        this.validateConnectionWithKey(connectionInfo, ctx);
      } else {
        this.validateLegacyConnection(connectionInfo, ctx);
      }
    }
  };

  private validateLegacyConnection = (connectionInfo: ConnectionInfo, ctx: TransformerContext): void => {
    const parentTypeName = connectionInfo.parent.name.value;
    const fieldName = connectionInfo.field.name.value;
    if (!connectionInfo.parentModelDirective) {
      throw new InvalidDirectiveError(`@connection must be on an @model object type field.`);
    }

    if (!connectionInfo.relatedType) {
      throw new InvalidDirectiveError(`Could not find an object type named ${connectionInfo.relatedType.name.value}.`);
    }

    if (!connectionInfo.parentModelDirective) {
      throw new InvalidDirectiveError(`Object type ${connectionInfo.relatedType.name.value} must be annotated with @model.`);
    }

    if (connectionInfo.connectionName && !connectionInfo.associatedConnectionField) {
      throw new InvalidDirectiveError(
        `Found one half of connection "${connectionInfo.connectionName}" at ${parentTypeName}.${fieldName} but no related field on type ${connectionInfo.relatedType.name.value}`,
      );
    }

    const connectionName = connectionInfo.connectionName || `${parentTypeName}.${fieldName}`;

    if (connectionInfo.associatedSortField) {
      if (isListType(connectionInfo.associatedSortField.type)) {
        throw new InvalidDirectiveError(`sortField "${connectionInfo.associatedSortField.name.value}" is a list. It should be a scalar.`);
      }
      const sortType = getBaseType(connectionInfo.associatedSortField.type);
      if (!isScalar(connectionInfo.associatedSortField.type) || sortType === STANDARD_SCALARS.Boolean) {
        throw new InvalidDirectiveError(
          `sortField "${connectionInfo.associatedSortField.name.value}" is of type "${sortType}". ` +
            `It should be a scalar that maps to a DynamoDB "String", "Number", or "Binary"`,
        );
      }
    }

    const leftConnectionIsList = isListType(connectionInfo.field.type);
    const leftConnectionIsNonNull = isNonNullType(connectionInfo.field.type);
    const rightConnectionIsList = connectionInfo.associatedConnectionField
      ? isListType(connectionInfo.associatedConnectionField.type)
      : undefined;
    const rightConnectionIsNonNull = connectionInfo.associatedConnectionField
      ? isNonNullType(connectionInfo.associatedConnectionField.type)
      : undefined;

    // Relationship Cardinalities:
    // 1. [] to []
    // 2. [] to {}
    // 3. {} to []
    // 4. [] to ?
    // 5. {} to ?

    if (leftConnectionIsList && rightConnectionIsList) {
      // 1. TODO.
      // Use an intermediary table or other strategy like embedded string sets for many to many.
      throw new InvalidDirectiveError(`Invalid Connection (${connectionName}): Many to Many connections are not yet supported.`);
    } else if (leftConnectionIsList && rightConnectionIsList === false) {
      // 2. [] to {} when the association exists. Note: false and undefined are not equal.
      // Store a foreign key on the related table and wire up a Query resolver.
      // This is the inverse of 3.

      // Validate the provided key field is legit.
      const existingKeyField = this.getField(connectionInfo.relatedType, connectionInfo.connectionAttributeName);
      validateKeyField(existingKeyField);
    } else if (!leftConnectionIsList && rightConnectionIsList) {
      // 3. {} to [] when the association exists.
      // Store foreign key on this table and wire up a GetItem resolver.
      // This is the inverse of 2.

      // if the sortField is not defined as a field, throw an error
      // Cannot assume the required type of the field
      if (connectionInfo.associatedSortField?.name.value && !connectionInfo.associatedSortField) {
        throw new InvalidDirectiveError(
          `sortField "${connectionInfo.associatedSortField}" not found on type "${parentTypeName}", other half of connection "${connectionName}".`,
        );
      }

      const connectionAttributeName = connectionInfo.connectionAttributeName || makeConnectionAttributeName(parentTypeName, fieldName);
      // Validate the provided key field is legit.
      const existingKeyField = this.getField(connectionInfo.parent, connectionAttributeName);
      validateKeyField(existingKeyField);

      const tableLogicalId = ModelResourceIDs.ModelTableResourceID(parentTypeName);
      const table = ctx.getResource(tableLogicalId) as Table;
    } else if (leftConnectionIsList) {
      // 4. [] to ?
      // Store foreign key on the related table and wire up a Query resolver.
      // This has no inverse and has limited knowlege of the connection.
      // Validate the provided key field is legit.
      const existingKeyField = this.getField(connectionInfo.relatedType, connectionInfo.connectionAttributeName);
      validateKeyField(existingKeyField);
    } else {
      // 5. {} to ?
      // Store foreign key on this table and wire up a GetItem resolver.
      // This has no inverse and has limited knowlege of the connection.
      const connectionAttributeName = connectionInfo.connectionAttributeName || makeConnectionAttributeName(parentTypeName, fieldName);

      // Issue #2100 - in a 1:1 mapping that's based on sortField, we need to validate both sides
      // and getItemResolver has to be aware of the soft field.
      const sortFieldName = getDirectiveArgument(connectionInfo.directive, 'sortField');
      if (sortFieldName) {
        // Related type has to have a primary key directive and has to have a soft key
        // defined
        const relatedSortField = this.getSortField(connectionInfo.relatedType);

        if (!relatedSortField) {
          throw new InvalidDirectiveError(
            `sortField "${sortFieldName}" requires a primary @key on type "${connectionInfo.relatedType.name.value}" with a sort key that was not found.`,
          );
        }

        const sortField = this.getField(connectionInfo.parent, sortFieldName);

        if (!sortField) {
          throw new InvalidDirectiveError(
            `sortField with name "${sortFieldName} cannot be found on type: ${connectionInfo.parent.name.value}`,
          );
        }

        const relatedSortFieldType = getBaseType(relatedSortField.type);
        const sortFieldType = getBaseType(sortField.type);

        if (relatedSortFieldType !== sortFieldType) {
          throw new InvalidDirectiveError(
            `sortField "${relatedSortField.name.value}" on type "${connectionInfo.relatedType.name.value}" is not matching the ` +
              `type of field "${sortFieldName}" on type "${parentTypeName}"`,
          );
        }
      }

      // Validate the provided key field is legit.
      const existingKeyField = connectionInfo.parent.fields.find(f => f.name.value === connectionAttributeName);
      validateKeyField(existingKeyField);
    }
  };

  private validateConnectionWithKey = (connectionInfo: ConnectionInfo, ctx: TransformerContext): void => {
    const keyTransformer = ctx.getTransformerPluginInstance('KeyTransformer') as KeyTransformer;
    const args = getDirectiveArguments(connectionInfo.directive) as ConnectionDirectiveArgs;
    if (args.fields?.length === 0) {
      throw new InvalidDirectiveError('No fields passed in to @connection directive.');
    }

    if (!connectionInfo.relatedType) {
      throw new InvalidDirectiveError(`Could not find an object type named ${connectionInfo.relatedType.name.value}.`);
    }
    for (const fieldName of args.fields) {
      const connectedField = this.getField(connectionInfo.parent, fieldName);
      validateKeyFieldConnectionWithKey(connectedField, ctx);
    }

    // Todo: Use key directive info to validate the keys are used in the index

    if (!isListType(connectionInfo.field.type) && args.keyName) {
      throw new InvalidDirectiveError(
        `Connection is to a single object but the keyName ${args.keyName} was provided which does not reference the default table.`,
      );
    } else {
      let keyArg = this.getKeyArg(keyTransformer, connectionInfo, args);
      this.checkFieldsAgainstKeyArguments(connectionInfo.parent, connectionInfo.relatedType, args.fields, keyArg, connectionInfo.field);
    }
  };

  transformSchema = (ctx: TransformerContext): void => {
    const keyTransformer = ctx.getTransformerPluginInstance('KeyTransformer') as KeyTransformer;
    for (let { typeName: parentTypeName, fieldName } of this.connectedFields) {
      const connectionInfo = this.connectedFieldInfo[`${parentTypeName}.${fieldName}`];
      const args = getDirectiveArguments(connectionInfo.directive) as ConnectionDirectiveArgs;
      if (args.fields) {

        if(isListType(connectionInfo.field.type)) {
          let keyArg = this.getKeyArg(keyTransformer, connectionInfo, args);
        }
      } else {

      }
    }
  };


  generateResolvers = (acc: TransformerContext): void => {};

  /**
   * The @connection parameterization with "fields" can be used to connect objects by running a query on a table.
   * The directive is given an index to query and a list of fields to query by such that it
   * returns a list objects (or in certain cases a single object) that are connected to the
   * object it is called on.
   * This directive is designed to leverage indices configured using @key to create relationships.
   *
   * Directive Definition:
   * @connection(keyName: String, fields: [String!]!) on FIELD_DEFINITION
   * param @keyName The name of the index configured using @key that should be queried to get
   *      connected objects
   * param @fields The names of the fields on the current object to query by.
   */
  public connectionWithKey = (
    parent: ObjectTypeDefinitionNode | InterfaceTypeDefinitionNode,
    field: FieldDefinitionNode,
    directive: DirectiveNode,
    ctx: TransformerContext,
  ): void => {
    const parentTypeName = parent.name.value;
    const fieldName = field.name.value;
    const args = getDirectiveArguments(directive) as ConnectionDirectiveArgs;

    // Ensure that there is at least one field provided.
    if (args.fields.length === 0) {
      throw new InvalidDirectiveError('No fields passed in to @connection directive.');
    }

    // Check that related type exists and that the connected object is annotated with @model.
    const relatedTypeName = getBaseType(field.type);
    const relatedType = ctx.inputDocument.definitions.find(
      d => d.kind === Kind.OBJECT_TYPE_DEFINITION && d.name.value === relatedTypeName,
    ) as ObjectTypeDefinitionNode | undefined;

    // Get Child object's table.
    const tableLogicalID = ModelResourceIDs.ModelTableResourceID(relatedType.name.value);
    const tableResource = ctx.getResource(tableLogicalID) as Table;

    // Check that each field provided exists in the parent model and that it is a valid key type (single non-null).
    let inputFields: FieldDefinitionNode[] = [];
    args.fields.forEach(item => {
      const fieldsArrayLength = inputFields.length;
      inputFields.push(parent.fields.find(f => f.name.value === item));
      if (!inputFields[fieldsArrayLength]) {
        throw new InvalidDirectiveError(`${item} is not a field in ${parentTypeName}`);
      }

      validateKeyFieldConnectionWithKey(inputFields[fieldsArrayLength], ctx);
    });

    let index: GlobalSecondaryIndex = undefined;
    // If no index is provided use the default index for the related model type and
    // check that the query fields match the PK/SK of the table. Else confirm that index exists.
    if (!args.keyName) {
      checkFieldsAgainstIndex(parent, relatedType, args.fields, <KeySchema[]>tableResource.Properties.KeySchema, field);
    } else {
      index =
        (tableResource.Properties.GlobalSecondaryIndexes
          ? (<GlobalSecondaryIndex[]>tableResource.Properties.GlobalSecondaryIndexes).find(GSI => GSI.IndexName === args.keyName)
          : null) ||
        (tableResource.Properties.LocalSecondaryIndexes
          ? (<LocalSecondaryIndex[]>tableResource.Properties.LocalSecondaryIndexes).find(LSI => LSI.IndexName === args.keyName)
          : null);
      if (!index) {
        throw new InvalidDirectiveError(`Key ${args.keyName} does not exist for model ${relatedTypeName}`);
      }

      // check the arity

      // Confirm that types of query fields match types of PK/SK of the index being queried.
      checkFieldsAgainstIndex(parent, relatedType, args.fields, <KeySchema[]>index.KeySchema, field);
    }

    // If the related type is not a list, the index has to be the default index and the fields provided must match the PK/SK of the index.
    if (!isListType(field.type)) {
      if (args.keyName) {
        // tslint:disable-next-line: max-line-length
        throw new InvalidDirectiveError(
          `Connection is to a single object but the keyName ${args.keyName} was provided which does not reference the default table.`,
        );
      }

      // Start with GetItem resolver for case where the connection is to a single object.
      const getResolver = this.resources.makeGetItemConnectionWithKeyResolver(
        parentTypeName,
        fieldName,
        relatedTypeName,
        args.fields,
        <KeySchema[]>tableResource.Properties.KeySchema,
      );

      ctx.setResource(ResolverResourceIDs.ResolverResourceID(parentTypeName, fieldName), getResolver);
    } else {
      const keySchema: KeySchema[] = index ? <KeySchema[]>index.KeySchema : <KeySchema[]>tableResource.Properties.KeySchema;

      const queryResolver = this.resources.makeQueryConnectionWithKeyResolver(
        parentTypeName,
        fieldName,
        relatedType,
        args.fields,
        keySchema,
        index ? String(index.IndexName) : undefined,
        args.limit,
      );

      ctx.setResource(ResolverResourceIDs.ResolverResourceID(parentTypeName, fieldName), queryResolver);

      let sortKeyInfo: { fieldName: string; typeName: SortKeyFieldInfoTypeName; model: string; keyName: string } = undefined;
      if (args.fields.length > 1) {
        sortKeyInfo = undefined;
      } else {
        const compositeSortKeyType: SortKeyFieldInfoTypeName = 'Composite';
        const compositeSortKeyName = keySchema[1] ? this.resources.makeCompositeSortKeyName(String(keySchema[1].AttributeName)) : undefined;
        const sortKeyField = keySchema[1] ? relatedType.fields.find(f => f.name.value === keySchema[1].AttributeName) : undefined;

        // If a sort key field is found then add a simple sort key, else add a composite sort key.
        if (sortKeyField) {
          sortKeyInfo = keySchema[1]
            ? {
                fieldName: String(keySchema[1].AttributeName),
                typeName: getBaseType(sortKeyField.type),
                model: relatedTypeName,
                keyName: index ? String(index.IndexName) : 'Primary',
              }
            : undefined;
        } else {
          sortKeyInfo = keySchema[1]
            ? {
                fieldName: compositeSortKeyName,
                typeName: compositeSortKeyType,
                model: relatedTypeName,
                keyName: index ? String(index.IndexName) : 'Primary',
              }
            : undefined;
        }
      }

      this.extendTypeWithConnection(ctx, parent, field, relatedType, sortKeyInfo);
    }
  };

  private getKeyArg(keyTransformer: KeyTransformer, connectionInfo: ConnectionInfo, args: ConnectionDirectiveArgs) {
    const keyArgs: KeyArguments[] = keyTransformer.getDirectiveArgs(connectionInfo.relatedType);
    let keyArg;
    if (args.keyName) {
      keyArg = keyArgs.find(arg => arg.name === args.keyName);
      if (!keyArg) {
        throw new InvalidDirectiveError(`Key ${args.keyName} does not exist for model ${connectionInfo.relatedType.name.value}`);
      }
    }
    else {
      keyArg = keyArgs.find(arg => !arg.name) || { name: undefined, fields: ['id'] };
    }
    return keyArg;
  }

  private typeExist(type: string, ctx: TransformerContext): boolean {
    return Boolean(type in ctx.nodeMap);
  }

  private generateModelXConnectionType(ctx: TransformerContext, typeDef: ObjectTypeDefinitionNode | InterfaceTypeDefinitionNode): void {
    const tableXConnectionName = ModelResourceIDs.ModelConnectionTypeName(typeDef.name.value);
    if (this.typeExist(tableXConnectionName, ctx)) {
      return;
    }

    // Create the ModelXConnection
    const connectionType = blankObject(tableXConnectionName);
    ctx.addObject(connectionType);

    ctx.addObjectExtension(makeModelConnectionType(typeDef.name.value));
  }

  private generateFilterAndKeyConditionInputs(
    ctx: TransformerContext,
    field: ObjectTypeDefinitionNode | InterfaceTypeDefinitionNode,
    sortKeyInfo?: { fieldName: string; typeName: SortKeyFieldInfoTypeName },
  ): void {
    const scalarFilters = makeScalarFilterInputs(this.supportsConditions(ctx));
    for (const filter of scalarFilters) {
      if (!this.typeExist(filter.name.value, ctx)) {
        ctx.addInput(filter);
      }
    }

    // Create the Enum filters
    const enumFilters = makeEnumFilterInputObjects(field, ctx, this.supportsConditions(ctx));
    for (const filter of enumFilters) {
      if (!this.typeExist(filter.name.value, ctx)) {
        ctx.addInput(filter);
      }
    }

    // Create the ModelXFilterInput
    const tableXQueryFilterInput = makeModelXFilterInputObject(field, ctx, this.supportsConditions(ctx));
    if (!this.typeExist(tableXQueryFilterInput.name.value, ctx)) {
      ctx.addInput(tableXQueryFilterInput);
    }

    if (this.supportsConditions(ctx)) {
      const attributeTypeEnum = makeAttributeTypeEnum();
      if (!this.typeExist(attributeTypeEnum.name.value, ctx)) {
        ctx.addType(attributeTypeEnum);
      }
    }

    // Create sort key condition inputs for valid sort key types
    // We only create the KeyConditionInput if it is being used.
    // Don't create a key condition input for composite sort keys since it already done by @key.
    if (sortKeyInfo && sortKeyInfo.typeName !== 'Composite') {
      const sortKeyConditionInput = makeScalarKeyConditionForType(makeNamedType(sortKeyInfo.typeName));
      if (!this.typeExist(sortKeyConditionInput.name.value, ctx)) {
        ctx.addInput(sortKeyConditionInput);
      }
    }
  }

  private supportsConditions(context: TransformerContext) {
    return context.getTransformerVersion() >= CONDITIONS_MINIMUM_VERSION;
  }

  private extendTypeWithConnection(
    ctx: TransformerContext,
    parent: ObjectTypeDefinitionNode | InterfaceTypeDefinitionNode,
    field: FieldDefinitionNode,
    returnType: ObjectTypeDefinitionNode | InterfaceTypeDefinitionNode,
    sortKeyInfo?: { fieldName: string; typeName: SortKeyFieldInfoTypeName; model?: string; keyName?: string },
  ) {
    this.generateModelXConnectionType(ctx, returnType);

    // Extensions are not allowed to redeclare fields so we must replace
    // it in place.
    const type = ctx.getType(parent.name.value) as ObjectTypeDefinitionNode;
    if (type && (type.kind === Kind.OBJECT_TYPE_DEFINITION || type.kind === Kind.INTERFACE_TYPE_DEFINITION)) {
      // Find the field and replace it in place.
      const newFields = type.fields.map((f: FieldDefinitionNode) => {
        if (f.name.value === field.name.value) {
          const updated = makeModelConnectionField(field.name.value, returnType.name.value, sortKeyInfo, [...f.directives]);
          return updated;
        }
        return f;
      });
      const updatedType = {
        ...type,
        fields: newFields,
      };
      ctx.putType(updatedType);

      if (!this.typeExist('ModelSortDirection', ctx)) {
        const modelSortDirection = makeModelSortDirectionEnumObject();
        ctx.addEnum(modelSortDirection);
      }

      this.generateFilterAndKeyConditionInputs(ctx, returnType, sortKeyInfo);
    } else {
      throw new InvalidDirectiveError(`Could not find a object or interface type named ${parent.name.value}.`);
    }
  }

  private getPrimaryKeyField(ctx: TransformerContext, type: ObjectTypeDefinitionNode | InterfaceTypeDefinitionNode): FieldDefinitionNode {
    let field: FieldDefinitionNode;

    for (const keyDirective of type.directives.filter(d => d.name.value === 'key')) {
      if (getDirectiveArgument(keyDirective, 'name') === undefined) {
        const fieldsArg = getDirectiveArgument(keyDirective, 'fields');

        if (fieldsArg && fieldsArg.length && fieldsArg.length >= 1 && fieldsArg.length <= 2) {
          field = type.fields.find(f => f.name.value === fieldsArg[0]);
        }

        // Exit the loop even if field was not set above, @key will throw validation
        // error anyway
        break;
      }
    }

    return field;
  }

  private getSortField(type: ObjectTypeDefinitionNode | InterfaceTypeDefinitionNode) {
    let field: FieldDefinitionNode;

    for (const keyDirective of type.directives.filter(d => d.name.value === 'key')) {
      if (getDirectiveArgument(keyDirective, 'name') === undefined) {
        const fieldsArg = getDirectiveArgument(keyDirective, 'fields');

        if (fieldsArg && fieldsArg.length && fieldsArg.length === 2) {
          field = type.fields.find(f => f.name.value === fieldsArg[1]);
        }

        // Exit the loop even if field was not set above, @key will throw validation
        // error anyway
        break;
      }
    }

    return field;
  }

  private getField = (obj: ObjectTypeDefinitionNode | InterfaceTypeDefinitionNode, fieldName: string): FieldDefinitionNode | undefined => {
    return obj.fields.find(f => f.name.value == fieldName);
  };

  private getDirective = (
    objOrField: ObjectTypeDefinitionNode | FieldDefinitionNode | InterfaceTypeDefinitionNode,
    directiveName: string,
  ): DirectiveNode | undefined => {
    return objOrField.directives.find(d => d.name.value === directiveName);
  };

  private getRelatedField = (
    field: FieldDefinitionNode,
    relatedType: ObjectTypeDefinitionNode,
    connectionName: string,
  ): FieldDefinitionNode | undefined => {
    return relatedType.fields.find((f: FieldDefinitionNode) => {
      // Make sure we don't associate with the same field in a self connection
      if (f === field) {
        return false;
      }
      const relatedDirective = this.getDirective(f, 'connection');
      if (relatedDirective) {
        const relatedDirectiveName = getDirectiveArgument(relatedDirective, 'name');
        if (connectionName && relatedDirectiveName && relatedDirectiveName === connectionName) {
          return true;
        }
      }
      return false;
    });
  };

  private getLegacySortFieldName = (field: FieldDefinitionNode): string | undefined => {
    const directive = this.getDirective(field, 'connection');
    return getDirectiveArgument(directive, 'sortField');
  };
  private getRelatedType = (field: FieldDefinitionNode, ctx: TransformerContext): ObjectTypeDefinitionNode | undefined => {
    const relatedTypeName = getBaseType(field.type);
    return ctx.inputDocument.definitions.find(d => d.kind === Kind.OBJECT_TYPE_DEFINITION && d.name.value === relatedTypeName) as
      | ObjectTypeDefinitionNode
      | undefined;
  };

  private getConnectedField = (
    connectedField: FieldDefinitionNode,
    relatedType: ObjectTypeDefinitionNode,
  ): FieldDefinitionNode | undefined => {
    const directive = connectedField.directives.find(d => d.name.value === 'connection');
    let connectionName = getDirectiveArgument(directive, 'name');
    let associatedSortFieldName = null;
    return relatedType.fields.find((f: FieldDefinitionNode) => {
      // Make sure we don't associate with the same field in a self connection
      if (f === connectedField) {
        return false;
      }
      const relatedDirective = f.directives.find((dir: DirectiveNode) => dir.name.value === 'connection');
      if (relatedDirective) {
        const relatedDirectiveName = getDirectiveArgument(relatedDirective, 'name');
        if (connectionName && relatedDirectiveName && relatedDirectiveName === connectionName) {
          associatedSortFieldName = getDirectiveArgument(relatedDirective, 'sortField');
          return true;
        }
      }
      return false;
    });
  };

  /**
   * Checks that the fields being used to query match the expected key types for the index being used.
   * @param parent: All fields of the parent object.
   * @param relatedTypeFields: All fields of the related object.
   * @param inputFieldNames: The fields passed in to the @connection directive.
   * @param keyArgs: The key arguments from the related type
   */
  private checkFieldsAgainstKeyArguments = (
    parent: ObjectTypeDefinitionNode | InterfaceTypeDefinitionNode,
    relatedType: ObjectTypeDefinitionNode | InterfaceTypeDefinitionNode,
    inputFieldNames: string[],
    keyArgs: KeyArguments,
    field: FieldDefinitionNode,
  ) => {
    const tablePKType = this.getField(relatedType, keyArgs.fields[0]);
    const queryPKType = this.getField(parent, inputFieldNames[0]);
    const numFields = inputFieldNames.length;
    if (getBaseType(tablePKType.type) !== getBaseType(queryPKType.type)) {
      throw new InvalidDirectiveError(`${inputFieldNames[0]} field is not of type ${getBaseType(tablePKType.type)}`);
    }
    if (numFields > 1) {
      if (numFields !== keyArgs.fields.length) {
        // todo: better error message
        throw new InvalidDirectiveError(`connection needs the same number of fields`);
      }
      for (let i = 1; i < numFields; i++) {
        const field = this.getField(parent, inputFieldNames[i]);
        const relatedField = this.getField(relatedType, keyArgs.fields[i]);
        if (getBaseType(field.type) !== getBaseType(relatedField.type)) {
          throw new InvalidDirectiveError(`${inputFieldNames[i]} field is not of type ${getBaseType(relatedField.type)}`);
        }
      }
    }
  };
}
