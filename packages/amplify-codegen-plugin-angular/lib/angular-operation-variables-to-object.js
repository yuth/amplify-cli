"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const typescript_1 = require("@graphql-codegen/typescript");
const visitor_plugin_common_1 = require("@graphql-codegen/visitor-plugin-common");
class AngularOperationVariablesHelper extends typescript_1.TypeScriptOperationVariablesToObject {
    formatTypeString(fieldType, isNonNullType, hasDefaultValue) {
        return fieldType;
    }
    transform(variablesNode) {
        if (!variablesNode || variablesNode.length === 0) {
            return null;
        }
        return variablesNode.map(variable => visitor_plugin_common_1.indent(this.transformVariable(variable))).join(',');
    }
    transformVariableNames(variablesNode) {
        if (!variablesNode || variablesNode.length === 0) {
            return null;
        }
        return variablesNode.map(variable => this.getName(variable));
    }
}
exports.AngularOperationVariablesHelper = AngularOperationVariablesHelper;
//# sourceMappingURL=angular-operation-variables-to-object.js.map