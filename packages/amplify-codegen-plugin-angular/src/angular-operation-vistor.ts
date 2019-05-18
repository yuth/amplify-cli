import {
  GraphQLSchema,
  VariableDefinitionNode,
  SelectionNode,
  SelectionSetNode,
  GraphQLNamedType,
  FragmentSpreadNode,
  InlineFragmentNode,
  OperationTypeNode,
  OperationDefinitionNode,
  FieldNode
} from 'graphql';
import {
  ParsedDocumentsConfig,
  BaseDocumentsVisitor,
  LoadedFragment,
  getBaseType,
  DeclarationBlock,
  toPascalCase
} from '@graphql-codegen/visitor-plugin-common';

import { AngularSelectionSetToObject } from './angular-selection-set-to-object';
import { AngularOperationVariablesHelper } from './angular-operation-variables-to-object';
import { AmplifyCodegenPluginAngularConfig } from './index';
export interface AngularOperationVisitorParsedConfig extends ParsedDocumentsConfig {
  avoidOptionals: boolean;
  immutableTypes: boolean;
}

function getRootType(operation: OperationTypeNode, schema: GraphQLSchema) {
  switch (operation) {
    case 'query':
      return schema.getQueryType();
    case 'mutation':
      return schema.getMutationType();
    case 'subscription':
      return schema.getSubscriptionType();
  }
}

export class AngularOperationsVisitor extends BaseDocumentsVisitor<
  AmplifyCodegenPluginAngularConfig,
  AngularOperationVisitorParsedConfig
> {
  constructor(
    schema: GraphQLSchema,
    config: AmplifyCodegenPluginAngularConfig,
    allFragments: LoadedFragment[]
  ) {
    super(
      config,
      {
        avoidOptionals: config.avoidOptionals || false,
        immutableTypes: config.immutableTypes || false
      } as any,
      schema
    );

    this.setSelectionSetHandler(
      new AngularSelectionSetToObject(
        this.scalars,
        this.schema,
        this.convertName,
        this.config.addTypename,
        allFragments,
        this.config.immutableTypes
      )
    );
    this.setVariablesTransformer(
      new AngularOperationVariablesHelper(
        this.scalars,
        this.convertName,
        this.config.avoidOptionals,
        this.config.immutableTypes
      )
    );
  }

  OperationDefinition(node: OperationDefinitionNode): string {
    const name = this.handleAnonymousOperation(node);
    let resultType: GraphQLNamedType = getRootType(node.operation, this._schema);
    let resultSelections: SelectionNode | SelectionSetNode = node.selectionSet;
    /*
     If the operation has only one field in the result set, skip the name of the operation from type
     For instance if the an operation is of
     mutation CreatePost($input: CreatePostInput!) {
    createPost(input: $input) {
      __typename
      id
      title
    }
  }

  we want the method to just return CreatePostMutation of shape
  export type CreatePostMutation = { __typename: "Post" } &
    Pick<Post, "id" | "title">;

  and not include the name of the operation createPost
  export type CreatePostMutation = { __typename?: "Mutation" } & {
    createPost: Maybe<
      { __typename: "Post" } & Pick<Post, "id" | "title">
    >;
  };
     */

    if (resultSelections.selections && resultSelections.selections.length === 1) {
      resultSelections = node.selectionSet.selections[0];
      if (resultSelections.kind === 'InlineFragment') {
        resultType = getBaseType(
          resultType.getFields()[(resultSelections as InlineFragmentNode).typeCondition.name.value]
            .type
        );
      } else {
        resultType = getBaseType(
          resultType.getFields()[(resultSelections as FragmentSpreadNode).name.value].type
        );
      }
    }

    if (!resultType) {
      throw new Error(`Unable to find root schema type for operation type "${node.operation}"!`);
    }

    const selectionSet = this._selectionSetToObject.createNext(resultType, (resultSelections as FieldNode).selectionSet);

    const operationResult = new DeclarationBlock(this._declarationBlockConfig)
      .export()
      .asKind('type')
      .withName(
        this.convertName(name, {
          suffix: toPascalCase(node.operation)
        })
      )
      .withContent(selectionSet.string).string;

    return operationResult;
  }

  private handleAnonymousOperation(node: OperationDefinitionNode): string {
    const name = node.name && node.name.value;

    if (name) {
      return this.convertName(node, {
        useTypesPrefix: false
      });
    }

    return this.convertName(this._unnamedCounter++ + '', {
      prefix: 'Unnamed_',
      suffix: '_',
      useTypesPrefix: false
    });
  }
}
