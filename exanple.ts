import { MutationFieldType } from './TransformerRedesignInterfaces';

export class DynamoDBModelTransformer extends Transformer implements TransformerModelProvider {
  modelTypes: Set<string> = new Set();
  modelDataSourceMap: Map<string, any> = new Map();
  constructor() {
    super(
      'DynamoDBModelTransformer',
      gql`
    directive @model(
      queries: ModelQueryMap
      mutations: ModelMutationMap
      subscriptions: ModelSubscriptionMap
      timestamps: TimestampConfiguration
    ) on OBJECT
    ....
  `,
    );
  }

  public object = (def: ObjectTypeDefinitionNode, directive: DirectiveNode, ctx: TransformerContext): void => {
    // Add a stack mapping so that all model resources are pulled
    // into their own stack at the end of the transformation.
    const typeName = def.name.value;
    this.modelTypes.add(typeName);
  };

  public prepare = (ctx: TransformerContext) => {
    for (let typeName of this.modelTypes.values()) {
      const objectDefinition = ctx.output.getObject(typeName);
      ctx.providerRegistry.registerDataSourceProvider(objectDefinition, this);
    }
  };

  public validate = (ctx: TransformerContext): void => {
    // do the validation of the directive arguments
  };

  transformSchema = (ctx: TransformerContext) => {
    for (let typeName of this.modelTypes.values()) {
      const objectDefinition = ctx.output.getObject(typeName);

      const newFields = [
        ...this.getQueryFieldNames(ctx, objectDefinition),
        ...this.getMutationFields(ctx, objectDefinition),
        ...this.getSubscriptionFields(ctx, objectDefinition),
      ];

      for (let op of newFields) {
        const opType = ctx.getObject(op.typeName);
        const inputs = this.getInputs(ctx, objectDefinition, op);
        // add the input if its missing in the output
        for (let input of inputs) {
          if (!ctx.output.getType(input)) {
            ctx.output.addInput(input);
          }
        }
        const field = makeField(op.fieldName, [inputs]);
        const extension = objectExtension(opType, field);
        this.output.addObjectExtension(extension);
      }
    }
  };

  generateResolvers = (ctx: TransformerContext) => {
    for (let typeName of this.modelTypes.values()) {
      const objectDefinition = ctx.output.getObject(typeName);

      const table = makeModelTable(typeName);
      ctx.resources.add(table);
      const role = makeIAMRole(typeName);
      ctx.resources.add(role);

      const datasource = makeDynamoDBDataSource(table, role, typeName, syncEnabled);
      ctx.datasources.add(objectDefinition, datasource);

      for (let query of this.getQueryFieldNames(ctx, objectDefinition)) {
        switch (query.type) {
          case MutationFieldType.CREATE:
            this.generateGetResolver(ctx, objectDefinition, query.typeName, query.fieldName);
            break;
          case QueryFieldType.LIST:
            this.generateListResolver(ctx, objectDefinition, query.typeName, query.fieldName);
            break;
          case QueryFieldType.SYNC:
            this.generateSyncResolver(ctx, objectDefinition, query.typeName, query.fieldName);
            break;
        }
      }

      for (let mutation of this.getMutationFieldName(ctx, objectDefinition)) {
        switch (mutation.type) {
          case MutationFieldType.CREATE:
            this.generateCreateResolver(ctx, objectDefinition, mutation.typeName, mutation.fieldName);
            break;
          case MutationFieldType.UPDATE:
            this.generateUpdateResolver(ctx, objectDefinition, mutation.typeName, mutation.fieldName);
            break;
          case MutationFieldType.DELETE:
            this.generateDeleteResolver(ctx, objectDefinition, mutation.typeName, mutation.fieldName);
            break;
        }
      }

      // Same step for subscriptions
    }
  };
}

// Key Directive

export class KeyTransformer extends Transformer implements TransformerModelEnhancementProvider {
  modelWithKey: Set<string> = new Set();
  modelDataSourceMap: Map<string, any> = new Map();
  constructor() {
    super(
      'DynamoDBModelTransformer',
      gql`
    directive @model(
      queries: ModelQueryMap
      mutations: ModelMutationMap
      subscriptions: ModelSubscriptionMap
      timestamps: TimestampConfiguration
    ) on OBJECT
    ....
  `,
    );
  }

  public object = (def: ObjectTypeDefinitionNode, directive: DirectiveNode, ctx: TransformerContext): void => {
    // Add a stack mapping so that all model resources are pulled
    // into their own stack at the end of the transformation.
    const typeName = def.name.value;
    this.modelWithKey.add(typeName);
  };

  public prepare = (ctx: TransformerContext) => {
    for (let typeName of this.modelWithKey.values()) {
      const objectDefinition = ctx.output.getObject(typeName);
      ctx.providerRegistry.addDataSourceEnhancer(objectDefinition, this);
    }
  };

  public validate = (ctx: TransformerContext): void => {
    // do the validation of the directive arguments
    for (let typeName of this.modelWithKey.values()) {
      const type = ctx.output.getObject(typeName);
      const dataSourceProvider = ctx.providerRegistry.getDataSourceProvider(type);
      if (!dataSourceProvider || dataSourceProvider.name !== 'DynamoDBTransformer') {
        throw new InvalidDirectiveError(`Type ${typeName} should be have @model directive to be used with @key directive`);
      }
    }
  };

  transformSchema = (ctx: TransformerContext) => {
    const objectDefinition = ctx.output.getObject(typeName);

    const directives = objectDefinition.directives?.filter(d => d.name.value === 'key');
    const primaryKeyDirective = directives.find(d => !d.arguments.name);
    const dataSourceProvider = ctx.providerRegistry.getDataSourceProvider(type);

    if (primaryKeyDirective) {
      const queryFieldNames = dataSourceProvider.getQueryFieldNames(ctx, objectDefinition);
      for (let queryField of queryFieldNames) {
        // get the query field
        const queryType = ctx.output.getObject(queryField.typeName);
        const field = queryType.fields.find(f => f.name === queryField.fieldName);

        // augment the arguments for query field

        // repeat same for mutation and subscription field
      }
    }

    const newFields = [...this.getQueryFieldName(ctx, objectDefinition)];

    for (let op of newFields) {
      const opType = ctx.getObject(op.typeName);
      const inputs = this.getInputs(ctx, objectDefinition, op);
      // add the input if its missing in the output
      for (let input of inputs) {
        if (!ctx.output.getType(input)) {
          ctx.output.addInput(input);
        }
      }
      const field = makeField(op.fieldName, [inputs]);
      const extension = objectExtension(opType, field);
      this.output.addObjectExtension(extension);
    }
  };

  generateResolvers = (ctx: TransformerContext) => {
    const objectDefinition = ctx.output.getObject(typeName);

    const directives = model.directives?.filter(d => d.name.value === 'key');
    const primaryKeyDirective = directives.find(d => !d.argument.name);
    const dataSourceProvider = ctx.providerRegistry.getDataSourceProvider(objectDefinition);
    const dataSourceResource = dataSourceProvider.getDataSourceResource(ctx, objectDefinition);

    if (primaryKeyDirective) {
      this.updateTablePrimaryIndexStructure(ctx, directives, dataSourceResource);
      const newFields = [
        ...this.getQueryFieldNames(ctx, objectDefinition),
        ...this.getMutationFields(ctx, objectDefinition),
        ...this.getSubscriptionFields(ctx, objectDefinition),
      ];

      for (let op of newFields) {
        const resolver = ctx.resolvers.getResolver(op.typeName, op.fieldName);
        resolver.addSlot('init', this.addKeyConditionsToResolver(ctx, objectDefinition, primaryKeyDirective));
      }
    }
    for (let directive of directives.filter(d => d !== primaryKeyDirective)) {
      for (let queryField of this.getQueryFieldName(ctx, this.object, directive)) {
        const resolver = dataSourceProvider.generateListResolver(ctx.obj, queryField.typeName, queryFIeld.fieldName);
        resolver.addSlot('init', this.addKeyConditionsToResolver(ctx, objectTypeDefinition, directive));
      }
    }
  };
}
