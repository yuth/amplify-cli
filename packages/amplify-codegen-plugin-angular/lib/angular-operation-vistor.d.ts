import { GraphQLSchema } from 'graphql';
import { ParsedDocumentsConfig, BaseDocumentsVisitor, LoadedFragment } from '@graphql-codegen/visitor-plugin-common';
import { AmplifyCodegenPluginAngularConfig } from './index';
export interface AngularOperationVisitorParsedConfig extends ParsedDocumentsConfig {
    avoidOptionals: boolean;
    immutableTypes: boolean;
}
export declare class AngularOperationsVisitor extends BaseDocumentsVisitor<AmplifyCodegenPluginAngularConfig, AngularOperationVisitorParsedConfig> {
    constructor(schema: GraphQLSchema, config: AmplifyCodegenPluginAngularConfig, allFragments: LoadedFragment[]);
}
