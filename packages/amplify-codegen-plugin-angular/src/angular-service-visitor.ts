import {
  ClientSideBaseVisitor,
  ClientSideBasePluginConfig
} from '@graphql-codegen/visitor-plugin-common';
import * as autoBind from 'auto-bind';
import { FragmentDefinitionNode, OperationDefinitionNode, FieldNode } from 'graphql';
import { AmplifyCodegenPluginAngularConfig } from './index';
import { AngularOperationVariablesHelper } from './angular-operation-variables-to-object';
export interface AwsAmplifyAngularPluginConfig extends ClientSideBasePluginConfig {}

export class AwsAmplifyAngularServiceVisitor extends ClientSideBaseVisitor<
  AmplifyCodegenPluginAngularConfig,
  AwsAmplifyAngularPluginConfig
> {
  generatedAPIs: string[] = [];
  variableToObjectConverter: AngularOperationVariablesHelper;

  constructor(
    fragments: FragmentDefinitionNode[],
    private _allOperations: OperationDefinitionNode[],
    rawConfig: AmplifyCodegenPluginAngularConfig
  ) {
    super(fragments, rawConfig, {});
    autoBind(this);
    this.variableToObjectConverter = new AngularOperationVariablesHelper(
      this.scalars,
      this.convertName,
      false,
      false
    );
  }

  public getImports(): string {
    const baseImports = super.getImports();
    const imports = [
      `import { Injectable } from '@angular/core';`,
      `import API, { graphqlOperation } from '@aws-amplify/api';`,
      `import { GraphQLResult } from "@aws-amplify/api/lib/types";`,
      `import * as Observable from 'zen-observable';`
    ];

    return [baseImports, ...imports].join('\n');
  }

  public buildService() {
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

  OperationDefinition(node: OperationDefinitionNode): string {
    return super.OperationDefinition(node);
  }

  protected buildOperation(
    node: OperationDefinitionNode,
    documentVariableName: string,
    operationType: string,
    operationResultType: string,
    operationVariablesTypes: string
  ): string {
    const isSubscription = operationType === 'Subscription';
    const hasVariables = node.variableDefinitions.length > 0;

    const name = this.convertName(node, {
      suffix: isSubscription ? 'ListenerAPI' : 'API'
    });

    this.generatedAPIs.push(name);

    const field = node.selectionSet.selections[0] as FieldNode;

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
      if(hasVariables) {
        return `
        async function ${name}(${variables}): Promise<Observable<${operationResultType}>> {
          ${variableDecl};
          const subscription = (await API.graphql(graphqlOperation(${documentVariableName}, variables)) as Observable<any>);
          return new Observable((observer) => {
            subscription
              .subscribe((result) => {
                if(result && result.value && result.value.data && result.value.data.${fieldName} ) {
                  observer.next(result.value.data.${fieldName});
                }
              })
          });
        }
        ` ;
      } else {
        return `
      const ${name}: Observable<${operationResultType}> = new Observable((observer) => {
        (API.graphql(graphqlOperation(${documentVariableName})) as Observable<any>)
          .subscribe((result) => {
            if(result && result.value && result.value.data && result.value.data.${fieldName} ) {
              observer.next(result.value.data.${fieldName});
            }
          })
      });
      `;
      }
    }
    const graphqlOperation =
      'graphqlOperation(' +
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
