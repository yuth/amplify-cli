// This should be moved to its own interface package so that other transformer plugins can have
// a slim dependecy. For now dumping all the interfaces in same file
import {
  DirectiveNode,
  ObjectTypeDefinitionNode,
  InterfaceTypeDefinitionNode,
  FieldDefinitionNode,
  UnionTypeDefinitionNode,
  EnumTypeDefinitionNode,
  ScalarTypeDefinitionNode,
  InputObjectTypeDefinitionNode,
  InputValueDefinitionNode,
  EnumValueDefinitionNode,
  DirectiveDefinitionNode,
  TypeDefinitionNode,
  GraphQLObjectType,
} from 'graphql';
import { TransformerContext } from './transformer-context/TransformerContext';
import { BaseResolver } from './util/BaseResolver';
import Resource from 'cloudform-types/types/apiGateway/resource';

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

export enum ModelCapabilities {
  SUPPORT_AUTH = 'SUPPORT_AUTH',
  // SUPPORT_LIST = 'SUPPORT_LIST',
  // SUPPORT_GET = 'SUPPORT_GET',
  // SUPPORT_CREATE = 'SUPPORT_CREATE',
  // SUPPORT_UPDATE = 'SUPPORT_UPDATE',
  // SUPPORT_DELETE = 'SUPPORT_DELETE',
}

// {
//   transformers: [],
//   formatter: {},
//   policyGenerator: {}
// }

// context {
//   resolvers: [],
//   dataSources: [],
//   iamPolicy: [],
//   getResolver(typeName, fieldName)
// }

export interface TransformerModelProvider extends ITransformer {
  readonly transformerName: string;

  readonly capabilities: ModelCapabilities[];

  generateGetResolver: (ctx: TransformerContext, type: GraphQLObjectType, typeName: string, fieldName: string) => BaseResolver;
  generateListResolver: (ctx: TransformerContext, type: GraphQLObjectType, typeName: string, fieldName: string) => BaseResolver;
  generateUpdateResolver: (ctx: TransformerContext, type: GraphQLObjectType, typeName: string, fieldName: string) => BaseResolver;
  generateDeleteResolver: (ctx: TransformerContext, type: GraphQLObjectType, typeName: string, fieldName: string) => BaseResolver;
  generateOnCreateResolver?: (ctx: TransformerContext, type: GraphQLObjectType, typeName: string, fieldName: string) => BaseResolver;
  generateOnUpdateResolver?: (ctx: TransformerContext, type: GraphQLObjectType, typeName: string, fieldName: string) => BaseResolver;
  generateOnDeleteResolver?: (ctx: TransformerContext, type: GraphQLObjectType, typeName: string, fieldName: string) => BaseResolver;
  generateSyncResolver?: (ctx: TransformerContext, type: GraphQLObjectType, typeName: string, fieldName: string) => BaseResolver;

  getQueryFieldNames: (ctx: TransformerContext, type: GraphQLObjectType) => Record<string, QueryFieldType>;
  getMutationFieldNames: (ctx: TransformerContext, type: GraphQLObjectType) => Record<string, MutationFieldType>;
  getSubscriptionFieldNames: (ctx: TransformerContext, type: GraphQLObjectType) => Record<string, SubscriptionFieldType>;
}

// context.stash = {
//   conditions: {
//     filter: {}
//     mutation: {}
//     subscriptions: {}

//   },
//   defaultValues: {},
//   transformedValues: {
//     email: ""
//   }
// }
// slot initialize {
//   #set($context.stash.defaultValues.id, $ctx.util.autoId())
// }
// merge (defaultValues, input, trnasformedValues)
// condtions = andCondition = { filter}
export interface TransformerAuthProvider {}
