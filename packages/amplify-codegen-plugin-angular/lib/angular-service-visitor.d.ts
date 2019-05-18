import { ClientSideBaseVisitor, ClientSideBasePluginConfig } from '@graphql-codegen/visitor-plugin-common';
import { FragmentDefinitionNode, OperationDefinitionNode } from 'graphql';
import { AmplifyCodegenPluginAngularConfig } from './index';
import { AngularOperationVariablesHelper } from './angular-operation-variables-to-object';
export interface AwsAmplifyAngularPluginConfig extends ClientSideBasePluginConfig {
}
export declare class AwsAmplifyAngularServiceVisitor extends ClientSideBaseVisitor<AmplifyCodegenPluginAngularConfig, AwsAmplifyAngularPluginConfig> {
    private _allOperations;
    generatedAPIs: string[];
    variableToObjectConverter: AngularOperationVariablesHelper;
    constructor(fragments: FragmentDefinitionNode[], _allOperations: OperationDefinitionNode[], rawConfig: AmplifyCodegenPluginAngularConfig);
    getImports(): string;
    buildService(): string;
    OperationDefinition(node: OperationDefinitionNode): string;
    protected buildOperation(node: OperationDefinitionNode, documentVariableName: string, operationType: string, operationResultType: string, operationVariablesTypes: string): string;
}
