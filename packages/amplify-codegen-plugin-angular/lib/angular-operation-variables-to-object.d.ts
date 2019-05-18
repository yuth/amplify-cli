import { TypeScriptOperationVariablesToObject as TSOperationVariablesToObject } from '@graphql-codegen/typescript';
import { InterfaceOrVariable } from '@graphql-codegen/visitor-plugin-common';
export declare class AngularOperationVariablesHelper extends TSOperationVariablesToObject {
    protected formatTypeString(fieldType: string, isNonNullType: boolean, hasDefaultValue: boolean): string;
    transform<TDefinitionType extends InterfaceOrVariable>(variablesNode: ReadonlyArray<TDefinitionType>): string;
    transformVariableNames<TDefinitionType extends InterfaceOrVariable>(variablesNode: ReadonlyArray<TDefinitionType>): string[];
}
