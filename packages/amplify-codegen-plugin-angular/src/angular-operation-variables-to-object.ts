import { TypeScriptOperationVariablesToObject as TSOperationVariablesToObject } from '@graphql-codegen/typescript';
import { InterfaceOrVariable, indent } from '@graphql-codegen/visitor-plugin-common';

export class AngularOperationVariablesHelper extends TSOperationVariablesToObject {
  protected formatTypeString(fieldType: string, isNonNullType: boolean, hasDefaultValue: boolean): string {
    return fieldType;
  }
  transform<TDefinitionType extends InterfaceOrVariable>(variablesNode: ReadonlyArray<TDefinitionType>): string {
    if (!variablesNode || variablesNode.length === 0) {
      return null;
    }

    return variablesNode.map(variable => indent(this.transformVariable(variable))).join(',');
  }

  transformVariableNames<TDefinitionType extends InterfaceOrVariable>(variablesNode: ReadonlyArray<TDefinitionType>): string[] {
    if (!variablesNode || variablesNode.length === 0) {
      return null;
    }

    return variablesNode.map(variable => this.getName(variable));
  }
}
