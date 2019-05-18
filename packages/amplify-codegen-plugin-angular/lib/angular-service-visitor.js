"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const visitor_plugin_common_1 = require("@graphql-codegen/visitor-plugin-common");
const autoBind = require("auto-bind");
const angular_operation_variables_to_object_1 = require("./angular-operation-variables-to-object");
class AwsAmplifyAngularServiceVisitor extends visitor_plugin_common_1.ClientSideBaseVisitor {
    constructor(fragments, _allOperations, rawConfig) {
        super(fragments, rawConfig, {});
        this._allOperations = _allOperations;
        this.generatedAPIs = [];
        autoBind(this);
        this.variableToObjectConverter = new angular_operation_variables_to_object_1.AngularOperationVariablesHelper(this.scalars, this.convertName, false, false);
    }
    getImports() {
        const baseImports = super.getImports();
        const imports = [
            `import { Injectable } from '@angular/core';`,
            `import API, { graphqlOperation } from '@aws-amplify/api';`,
            `import { GraphQLResult } from "@aws-amplify/api/lib/types";`,
            `import * as Observable from 'zen-observable';`
        ];
        return [baseImports, ...imports].join('\n');
    }
    buildService() {
        const apis = this.generatedAPIs.map(name => `${name.replace(/API$/i, '')} = ${name};`);
        return `
      @Injectable({
        providedIn: 'root'
      })
      export class APIService {
        ${apis.join('\n')}
      }
    `;
    }
    OperationDefinition(node) {
        return super.OperationDefinition(node);
    }
    buildOperation(node, documentVariableName, operationType, operationResultType, operationVariablesTypes) {
        const isSubscription = operationType === 'Subscription';
        const hasVariables = node.variableDefinitions.length > 0;
        const name = this.convertName(node, {
            suffix: isSubscription ? 'ListenerAPI' : 'API'
        });
        this.generatedAPIs.push(name);
        const field = node.selectionSet.selections[0];
        const fieldName = field.alias ? field.alias.value : field.name.value;
        const variables = hasVariables
            ? this.variableToObjectConverter.transform(node.variableDefinitions)
            : '';
        const variableDecl = hasVariables
            ? `const variables:any = {
          ${this.variableToObjectConverter
                .transformVariableNames(node.variableDefinitions)
                .join(', ')}
          };`
            : '';
        if (isSubscription) {
            //       const OnCreateBlogListenerApi: Observable<
            //   OnCreateBlogSubscription
            // > = new Observable((observer) => {
            //   (API.graphql(graphqlOperation(OnCreateBlogDocument)) as Observable<Object>).subscribe((result: any) => {
            //     debugger;
            //     observer.next(result.value.data.onCreateBlog)
            //   })
            // });
            return `
      const ${name}: Observable<${operationResultType}> = new Observable((observer) => {
        (API.graphql(graphqlOperation(${documentVariableName})) as Observable<any>)
          .subscribe((result) => {
            observer.next(result.value.data.${fieldName});
          })
      });
      `;
            // return `
            //   const ${name}: Observable<${operationResultType}> = API.graphql(graphqlOperation(${documentVariableName})) as Observable<${operationResultType}>
            // `;
        }
        const graphqlOperation = 'graphqlOperation(' +
            (hasVariables ? `${documentVariableName}, variables` : documentVariableName) +
            ')';
        return `
      async function ${name}(${variables}): Promise<${operationResultType}> {
        ${variableDecl};
        const response = (await API.graphql(${graphqlOperation})) as any;
        return <${operationResultType}>response.data.${fieldName};
      }
    `;
    }
}
exports.AwsAmplifyAngularServiceVisitor = AwsAmplifyAngularServiceVisitor;
//# sourceMappingURL=angular-service-visitor.js.map