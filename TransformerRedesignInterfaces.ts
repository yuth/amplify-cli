import {
  DirectiveDefinitionNode,
  DirectiveNode,
  DocumentNode,
  EnumTypeDefinitionNode,
  EnumTypeExtensionNode,
  EnumValueDefinitionNode,
  FieldDefinitionNode,
  InputObjectTypeDefinitionNode,
  InputObjectTypeExtensionNode,
  InputValueDefinitionNode,
  InterfaceTypeDefinitionNode,
  InterfaceTypeExtensionNode,
  ObjectTypeDefinitionNode,
  ObjectTypeExtensionNode,
  ScalarTypeDefinitionNode,
  SchemaDefinitionNode,
  TypeDefinitionNode,
  TypeSystemDefinitionNode,
  UnionTypeDefinitionNode,
  UnionTypeExtensionNode,
} from 'graphql';

export interface ResourceProvider {
  synthesize(): SynthesizedResource[];
  ref(): IntrinsicFunction;
}

export interface IntrinsicFunction {
  synthesize(): { [name: string]: any };
}

export interface SynthesizedResource {
  Type: string;
  Properties: Record<string, any>;
  Conditions: string[];
  DependsOn: string | IntrinsicFunction[];
}

export interface ResourceParameterProvider extends ResourceProvider {}

export interface CloudFormationResourceProvider extends ResourceProvider {
  type: string;
  properties: Record<string, any>;
}

export enum QueryFieldType {
  GET = 'GET',
  LIST = 'LIST',
  SYNC = 'SYNC',
}

export enum MutationFieldType {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
}

export enum SubscriptionFieldType {
  ON_CREATE = 'ON_CREATE',
  ON_DELETE = 'ON_DELETE',
  ON_UPDATE = 'ON_UPDATE',
}

export interface ITransformer {
  name: string;

  directive: DirectiveDefinitionNode;

  typeDefinitions: TypeDefinitionNode[];

  /**
   * An initializer that is called once at the beginning of a transformation.
   * Initializers are called in the order they are declared.
   */
  before?: (acc: TransformerContext) => void;

  /**
   * A transformer implements a single function per location that its directive can be applied.
   * This method handles transforming directives on objects type definitions. This includes type
   * extensions.
   */
  object?: (definition: ObjectTypeDefinitionNode, directive: DirectiveNode, acc: TransformerContext) => void;

  /**
   * A transformer implements a single function per location that its directive can be applied.
   * This method handles transforming directives on objects type definitions. This includes type
   * extensions.
   */
  interface?: (definition: InterfaceTypeDefinitionNode, directive: DirectiveNode, acc: TransformerContext) => void;

  /**
   * A transformer implements a single function per location that its directive can be applied.
   * This method handles transforming directives on object for field definitions.
   */
  field?: (
    parent: ObjectTypeDefinitionNode | InterfaceTypeDefinitionNode,
    definition: FieldDefinitionNode,
    directive: DirectiveNode,
    acc: TransformerContext,
  ) => void;

  /**
   * A transformer implements a single function per location that its directive can be applied.
   * This method handles transforming directives on object or input argument definitions.
   */
  argument?: (definition: InputValueDefinitionNode, directive: DirectiveNode, acc: TransformerContext) => void;

  /**
   * A transformer implements a single function per location that its directive can be applied.
   * This method handles transforming directives on union definitions.
   */
  union?: (definition: UnionTypeDefinitionNode, directive: DirectiveNode, acc: TransformerContext) => void;

  /**
   * A transformer implements a single function per location that its directive can be applied.
   * This method handles transforming directives on enum definitions.
   */
  enum?: (definition: EnumTypeDefinitionNode, directive: DirectiveNode, acc: TransformerContext) => void;

  /**
   * A transformer implements a single function per location that its directive can be applied.
   * This method handles transforming directives on enum value definitions.
   */
  enumValue?: (definition: EnumValueDefinitionNode, directive: DirectiveNode, acc: TransformerContext) => void;

  /**
   * A transformer implements a single function per location that its directive can be applied.
   * This method handles transforming directives on scalar definitions.
   */
  scalar?: (definition: ScalarTypeDefinitionNode, directive: DirectiveNode, acc: TransformerContext) => void;

  /**
   * A transformer implements a single function per location that its directive can be applied.
   * This method handles transforming directives on input definitions.
   */
  input?: (definition: InputObjectTypeDefinitionNode, directive: DirectiveNode, acc: TransformerContext) => void;

  /**
   * A transformer implements a single function per location that its directive can be applied.
   * This method handles transforming directives on input value definitions.
   */
  inputValue?: (definition: InputValueDefinitionNode, directive: DirectiveNode, acc: TransformerContext) => void;

  /**
   *  Validate the schema after individual transformers finishes parsing the AST
   */
  validate?: (acc: TransformerContext) => void;

  /**
   * Create additional  resources after validation before updating schema or generating resolvers
   */
  prepare?: (acc: TransformerContext) => void;

  /**
   * Update the schema with additional queries and input types
   */
  transformSchema?: (acc: TransformerContext) => void;

  /**
   * generate resolvers
   */
  generateResolvers?: (acc: TransformerContext) => void;

  /**
   * A finalizer that is called once after a transformation.
   * Finalizers are called in reverse order as they are declared.
   */
  after?: (acc: TransformerContext) => void;
}

export interface TransformerResolverSlotProvider extends ResourceProvider {
  addSlot(slotName: string, TransformerResolverSlot): void;
}

export enum AppSyncDataSourceType {
  AMAZON_DYNAMODB = 'AMAZON_DYNAMODB',
  AMAZON_ELASTICSEARCH = 'AMAZON_ELASTICSEARCH',
  AWS_LAMBDA = 'AWS_LAMBDA',
  RELATIONAL_DATABASE = 'RELATIONAL_DATABASE',
  HTTP = 'HTTP',
  NONE = 'NONE',
}

export interface TransformerModelProvider extends ITransformer {
  getDataSourceType: () => AppSyncDataSourceType;
  generateGetResolver: (
    ctx: TransformerContext,
    type: ObjectTypeDefinitionNode,
    typeName: string,
    fieldName: string,
    directive?: DirectiveDefinitionNode,
  ) => TransformerResolverProvider;
  generateListResolver: (
    ctx: TransformerContext,
    type: ObjectTypeDefinitionNode,
    typeName: string,
    fieldName: string,
    directive?: DirectiveDefinitionNode,
  ) => TransformerResolverProvider;
  generateUpdateResolver: (
    ctx: TransformerContext,
    type: ObjectTypeDefinitionNode,
    typeName: string,
    fieldName: string,
    directive?: DirectiveDefinitionNode,
  ) => TransformerResolverProvider;
  generateDeleteResolver: (
    ctx: TransformerContext,
    type: ObjectTypeDefinitionNode,
    typeName: string,
    fieldName: string,
    directive?: DirectiveDefinitionNode,
  ) => TransformerResolverProvider;
  generateOnCreateResolver?: (
    ctx: TransformerContext,
    type: ObjectTypeDefinitionNode,
    typeName: string,
    fieldName: string,
    directive?: DirectiveDefinitionNode,
  ) => TransformerResolverProvider;
  generateOnUpdateResolver?: (
    ctx: TransformerContext,
    type: ObjectTypeDefinitionNode,
    typeName: string,
    fieldName: string,
    directive?: DirectiveDefinitionNode,
  ) => TransformerResolverProvider;
  generateOnDeleteResolver?: (
    ctx: TransformerContext,
    type: ObjectTypeDefinitionNode,
    typeName: string,
    fieldName: string,
    directive?: DirectiveDefinitionNode,
  ) => TransformerResolverProvider;
  generateSyncResolver?: (
    ctx: TransformerContext,
    type: ObjectTypeDefinitionNode,
    typeName: string,
    fieldName: string,
    directive?: DirectiveDefinitionNode,
  ) => TransformerResolverProvider;

  getQueryFieldNames: (
    ctx: TransformerContext,
    type: ObjectTypeDefinitionNode,
    directive?: DirectiveDefinitionNode,
  ) => Set<{ fieldName: string; typeName: string; type: QueryFieldType }>;
  getMutationFieldNames: (
    ctx: TransformerContext,
    type: ObjectTypeDefinitionNode,
    directive?: DirectiveDefinitionNode,
  ) => Set<{ fieldName: string; typeName: string; type: MutationFieldType }>;
  getSubscriptionFieldNames: (
    ctx: TransformerContext,
    type: ObjectTypeDefinitionNode,
    directive?: DirectiveDefinitionNode,
  ) => Set<{ fieldName: string; typeName: string; type: SubscriptionFieldType }>;

  // Get instance of the CFN resource to augment the table (like adding additional indexes)
  getDataSourceResource: (ctx: TransformerContext, type: ObjectTypeDefinitionNode) => ResourceProvider;

  getInputs: (
    ctx: TransformerContext,
    type: ObjectTypeDefinitionNode,
    operation: { fieldName: string; typeName: string; type: QueryFieldType | MutationFieldType | SubscriptionFieldType },
  ) => InputObjectTypeDefinitionNode;
}

export interface TransformerModelEnhancementProvider extends Partial<TransformerModelProvider> {}

export interface TransformerValidationProvider extends ITransformer {
  addValidation: (ctx: TransformerContext, resolver: TransformerResolverProvider) => void;
}

export interface TransformerDefaultValueProvider extends ITransformer {
  addDefaultValue: (ctx: TransformerContext, resolver: TransformerResolverProvider) => void;
}

export interface TransformerAuthProvider extends ITransformer {
  protectGetQuery: (
    ctx: TransformerContext,
    type: ObjectTypeDefinitionNode | InterfaceTypeDefinitionNode,
    field?: FieldDefinitionNode,
  ) => void;
  protectListQuery: (
    ctx: TransformerContext,
    type: ObjectTypeDefinitionNode | InterfaceTypeDefinitionNode,
    field?: FieldDefinitionNode,
  ) => void;
  protectCreateMutation: (
    ctx: TransformerContext,
    type: ObjectTypeDefinitionNode | InterfaceTypeDefinitionNode,
    field?: FieldDefinitionNode,
  ) => void;
  protectUpdateMutation: (
    ctx: TransformerContext,
    type: ObjectTypeDefinitionNode | InterfaceTypeDefinitionNode,
    field?: FieldDefinitionNode,
  ) => void;
  protectDeleteMutation: (
    ctx: TransformerContext,
    type: ObjectTypeDefinitionNode | InterfaceTypeDefinitionNode,
    field?: FieldDefinitionNode,
  ) => void;

  protectOnCreateSubscription: (
    ctx: TransformerContext,
    type: ObjectTypeDefinitionNode | InterfaceTypeDefinitionNode,
    field?: FieldDefinitionNode,
  ) => void;

  protectOnUpdateSubscription: (
    ctx: TransformerContext,
    type: ObjectTypeDefinitionNode | InterfaceTypeDefinitionNode,
    field?: FieldDefinitionNode,
  ) => void;

  protectOnDeleteSubscription: (
    ctx: TransformerContext,
    type: ObjectTypeDefinitionNode | InterfaceTypeDefinitionNode,
    field?: FieldDefinitionNode,
  ) => void;
}

export interface DataSourceProvider extends ResourceProvider {
  dataSourceType: AppSyncDataSourceType;
}

export interface TransformerResolverProvider {
  generateQueryResolver: (
    typeName: string,
    fieldName: string,
    dataSource: DataSourceProvider,
    requestMappingTemplate: string,
    responseMappingTemplate: string,
  ) => TransformerResolverProvider;

  generateMutationResolver: (
    typeName: string,
    fieldName: string,
    dataSource: DataSourceProvider,
    requestMappingTemplate: string,
    responseMappingTemplate: string,
  ) => TransformerResolverProvider;

  generateSubscriptionResolver: (
    typeName: string,
    fieldName: string,
    dataSource: DataSourceProvider,
    requestMappingTemplate: string,
    responseMappingTemplate: string,
  ) => TransformerResolverProvider;
}

export interface TransformerDataSourcesProvider {
  add(type: ObjectTypeDefinitionNode | InterfaceTypeDefinitionNode, dataSourceInstance: DataSourceProvider): void;
  get(type: ObjectTypeDefinitionNode | InterfaceTypeDefinitionNode): DataSourceProvider;
  collectDataSources: () => Map<string, DataSourceProvider>;
}

export interface TransformerProviderRegistry {
  registerDataSourceProvider(type: ObjectTypeDefinitionNode | InterfaceTypeDefinitionNode, provider: TransformerModelProvider);
  getDataSourceProvider(type: ObjectTypeDefinitionNode | InterfaceTypeDefinitionNode): TransformerModelProvider;

  addDataSourceEnhancer(type: ObjectTypeDefinitionNode | InterfaceTypeDefinitionNode, provider: TransformerModelEnhancementProvider);
  getDataSourceEnhancers(type: ObjectTypeDefinitionNode | InterfaceTypeDefinitionNode): TransformerModelEnhancementProvider[];
}

export interface TransformerContextOutput {
  /**
   * Return a instance of transformer plugin
   * @param name transformer plugin name
   */
  getTransformerPluginInstance: (name: string) => ITransformer;
  /**
   * Scans through the context nodeMap and returns all type definition nodes
   * that are of the given kind.
   * @param kind Kind value of type definition nodes expected.
   */
  getTypeDefinitionsOfKind: (kind: string) => TypeDefinitionNode[];

  /**
   * Add an object type definition node to the context. If the type already
   * exists an error will be thrown.
   * @param obj The object type definition node to add.
   */
  putSchema: (obj: SchemaDefinitionNode) => void;

  /**
   * Returns the schema definition record. If the user provides a schema
   * definition as part of the input document, that node is returned.
   * Otherwise a blank schema definition with default operation types
   * is returned.
   */
  getSchema: () => SchemaDefinitionNode;

  getQueryTypeName: () => string | undefined;

  getQuery(): ObjectTypeDefinitionNode | undefined;

  getMutationTypeName(): string | undefined;

  getMutation(): ObjectTypeDefinitionNode | undefined;

  getSubscriptionTypeName(): string | undefined;

  getSubscription(): ObjectTypeDefinitionNode | undefined;

  /**
   * Add a generic type.
   * @param obj The type to add
   */
  addType(obj: TypeDefinitionNode): void;

  putType(obj: TypeDefinitionNode): void;

  getType(name: string): TypeSystemDefinitionNode | undefined;

  /**
   * Add an object type definition node to the context. If the type already
   * exists an error will be thrown.
   * @param obj The object type definition node to add.
   */
  addObject(obj: ObjectTypeDefinitionNode): void;

  updateObject(obj: ObjectTypeDefinitionNode): void;

  getObject(name: string): ObjectTypeDefinitionNode | undefined;

  /**
   * Extends the context query object with additional fields.
   * If the customer uses a name other than 'Query' this will proxy to the
   * correct type.
   * @param fields The fields to add the query type.
   */
  addQueryFields(fields: FieldDefinitionNode[]): void;

  /**
   * Extends the context mutation object with additional fields.
   * If the customer uses a name other than 'Mutation' this will proxy to the
   * correct type.
   * @param fields The fields to add the mutation type.
   */
  addMutationFields(fields: FieldDefinitionNode[]): void;

  /**
   * Extends the context subscription object with additional fields.
   * If the customer uses a name other than 'Subscription' this will proxy to the
   * correct type.
   * @param fields The fields to add the subscription type.
   */
  addSubscriptionFields(fields: FieldDefinitionNode[]): void;

  /**
   * Add an object type extension definition node to the context. If a type with this
   * name does not already exist, an exception is thrown.
   * @param obj The object type definition node to add.
   */
  addObjectExtension(obj: ObjectTypeExtensionNode): void;

  /**
   * Add an input object type extension definition node to the context. If a type with this
   * name does not already exist, an exception is thrown.
   * @param obj The input object type definition node to add.
   */
  addInputExtension(obj: InputObjectTypeExtensionNode): void;

  /**
   * Add an interface extension definition node to the context. If a type with this
   * name does not already exist, an exception is thrown.
   * @param obj The interface type definition node to add.
   */
  addInterfaceExtension(obj: InterfaceTypeExtensionNode): void;

  /**
   * Add an union extension definition node to the context. If a type with this
   * name does not already exist, an exception is thrown.
   * @param obj The union type definition node to add.
   */
  addUnionExtension(obj: UnionTypeExtensionNode): void;

  /**
   * Add an enum extension definition node to the context. If a type with this
   * name does not already exist, an exception is thrown.
   * @param obj The enum type definition node to add.
   */
  addEnumExtension(obj: EnumTypeExtensionNode): void;

  /**
   * Add an input type definition node to the context.
   * @param inp The input type definition node to add.
   */
  addInput(inp: InputObjectTypeDefinitionNode): void;

  /**
   * Add an enum type definition node to the context.
   * @param en The enum type definition node to add.
   */
  addEnum(en: EnumTypeDefinitionNode): void;
}

export interface TransformerResolvers {
  addResolver: (typeName: string, fieldName: string, resolver: TransformerResolverProvider) => TransformerResolverProvider;

  getResolver: (typeName: string, fieldName: string) => TransformerResolverProvider | void;
  removeResolver: (typeName: string, fieldName: string) => TransformerResolverProvider;
  collectResolvers: () => Map<string, TransformerResolverProvider>;
}

export interface TransformerContext {
  resolvers: TransformerResolvers;
  dataSources: TransformerDataSourcesProvider;
  providerRegistry: TransformerProviderRegistry;

  inputDocument: DocumentNode;
  output: TransformerContextOutput;
  resources: Record<string, ResourceProvider>;
}
