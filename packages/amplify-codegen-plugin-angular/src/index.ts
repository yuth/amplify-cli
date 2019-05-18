import { Types, PluginValidateFn, PluginFunction } from '@graphql-codegen/plugin-helpers';
import { visit, GraphQLSchema, concatAST, Kind, FragmentDefinitionNode, OperationDefinitionNode } from 'graphql';
import { RawClientSideBasePluginConfig } from '@graphql-codegen/visitor-plugin-common';
import { AwsAmplifyAngularServiceVisitor } from './angular-service-visitor';
import { AngularOperationsVisitor } from './angular-operation-vistor';
import { extname } from 'path';

export interface AmplifyCodegenPluginAngularConfig extends RawClientSideBasePluginConfig {
  avoidOptionals: boolean;
  immutableTypes: boolean;
}

export const plugin: PluginFunction<AmplifyCodegenPluginAngularConfig> = (
  schema: GraphQLSchema,
  documents: Types.DocumentFile[],
  config
) => {
  const allAst = concatAST(
    documents.reduce((prev, v) => {
      return [...prev, v.content];
    }, [])
  );
  const operations = allAst.definitions.filter(d => d.kind === Kind.OPERATION_DEFINITION) as OperationDefinitionNode[];

  if (operations.length === 0) {
    return '';
  }

  const allFragments = allAst.definitions.filter(d => d.kind === Kind.FRAGMENT_DEFINITION) as FragmentDefinitionNode[];
  const loadedFragments = allFragments.map(fragmentDef => ({ name: fragmentDef.name.value, onType: fragmentDef.typeCondition.name.value }));
  const operationVisitorResult = visit(allAst, {
    leave: new AngularOperationsVisitor(schema, config, loadedFragments),
  });

  const visitor = new AwsAmplifyAngularServiceVisitor(allFragments, operations, config);
  const visitorResult = visit(allAst, { leave: visitor });

  return [
    operationVisitorResult.definitions.join('\n'),
    visitor.getImports(),
    visitor.fragments,
    ...visitorResult.definitions.filter(t => typeof t === 'string'),
    visitor.buildService()
  ].join('\n');
};

export const validate: PluginValidateFn<any> = async (
  schema: GraphQLSchema,
  documents: Types.DocumentFile[],
  config,
  outputFile: string
) => {
  if (extname(outputFile) !== '.ts') {
    throw new Error(`Plugin "amplify-codegen-plugin-angular" requires extension to be ".ts"!`);
  }
};
