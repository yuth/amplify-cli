import { AppSync, Fn, IntrinsicFunction } from 'cloudform-types';
import Resource from 'cloudform-types/types/resource';
import { compoundExpression, iff, obj, printBlock, qref, raw, ref } from 'graphql-mapping-template';
import { FunctionResourceIDs, ResourceConstants } from 'graphql-transformer-common';
import { TransformerContext } from '..';
import { ResolverSlotManager } from './ResolverSlotManager';
import { pascalCase } from 'change-case';

export class BaseResolver {
  private slotManager: ResolverSlotManager;
  private _stackName: string;
  constructor(
    private typeName: string,
    private fieldName: string,
    private dataSourceName: string | IntrinsicFunction,
    private requestMappingTemplate: string,
    private responseMappingTemplate: string,
    private requestSlots: string[],
    private responseSlots: string[],
  ) {
    this.slotManager = new ResolverSlotManager([...this.requestSlots, ...this.responseSlots]);
  }

  public addDataSource(dataSourceName: string): void {
    this.dataSourceName = dataSourceName;
  }

  public mapResourceToStack(stackName: string) {
    this._stackName = stackName;
  }
  public getStackName(): string {
    return this._stackName;
  }
  public getResourceId(): string {
    return pascalCase(`${this.typeName} ${this.fieldName} Resolver`);
  }

  public setRequestTemplate(template: string): void {
    this.requestMappingTemplate = template;
  }

  public setResponseTemplate(template: string): void {
    this.responseMappingTemplate = template;
  }

  public addSlot(slotName: string, template: string): void {
    this.slotManager.addTo(slotName, template);
  }

  generateSlotFunctions(slotNames: string[]): Resource[] {
    return slotNames.flatMap(slotName => {
      return this.slotManager.get(slotName).reduce((acc, item, index) => {
        const responseMappingTemplate = printBlock(this.generateTemplateComment(slotName, index, 'RESPONSE'))(
          compoundExpression([
            iff(ref('ctx.error'), raw('$util.error($ctx.error.message, $ctx.error.type)')),
            raw('$util.toJson($ctx.result)'),
          ]),
        );
        const requestMappingTemplate = printBlock(this.generateTemplateComment(slotName, index, 'REQUEST'))(
          compoundExpression([raw(item), raw('$util.toJson({})')]),
        );
        return [...acc, this.generateAppSyncFunction(slotName, index, requestMappingTemplate, responseMappingTemplate)];
      }, []);
    });
  }
  private generateTemplateComment(slotName: string, index: number, templateType: 'REQUEST' | 'RESPONSE'): string {
    return `Resolver :  ${this.typeName}.${this.fieldName} Slot: ${slotName} slotIndex: ${index} type: ${templateType}`;
  }

  generateAppSyncFunction(
    slotName: string,
    slotIndex: number,
    requestTemplate: string,
    responseTemplate: string,
    dataSourceName: string | IntrinsicFunction = 'NONE',
  ): Resource {
    return new AppSync.FunctionConfiguration({
      DataSourceName: dataSourceName,
      FunctionVersion: '2018-05-29',
      RequestMappingTemplate: requestTemplate,
      ApiId: this.getAPIId(),
      Name: this.getFunctionName(slotName, slotIndex),
      ResponseMappingTemplate: responseTemplate,
    }).dependsOn(ResourceConstants.RESOURCES.NoneDataSource);
  }
  generateResources(ctx: TransformerContext): Resource[] {
    this.addNoneDataSource(ctx);
    const requestFunctions = this.generateSlotFunctions(this.requestSlots);
    const responseFunctions = this.generateSlotFunctions(this.responseSlots);
    const dataFetcher = this.generateAppSyncFunction(
      'load',
      0,
      this.requestMappingTemplate,
      this.responseMappingTemplate,
      this.dataSourceName,
    );
    const functionNames = [...requestFunctions, dataFetcher, ...responseFunctions].map(fn => fn.Properties.Name);
    const pipelineResolver = this.generatePipelineResolver(functionNames);
    return [...requestFunctions, dataFetcher, ...responseFunctions, pipelineResolver];
  }

  protected getFunctionName(slotName: string, index: number): string {
    return pascalCase(`${this.typeName} ${this.fieldName} ${slotName}${index}`);
  }

  protected generatePipelineResolver(functionNames: string[]) {
    return new AppSync.Resolver({
      ApiId: Fn.Ref(ResourceConstants.PARAMETERS.AppSyncApiId),
      TypeName: this.typeName,
      FieldName: this.fieldName,
      Kind: 'PIPELINE',
      PipelineConfig: {
        Functions: functionNames.map(fnName => Fn.GetAtt(fnName, 'FunctionId')),
      },
      RequestMappingTemplate: printBlock('Stash resolver specific context.')(
        compoundExpression([
          qref(`$ctx.stash.put("typeName", "${this.typeName}")`),
          qref(`$ctx.stash.put("fieldName", "${this.fieldName}")`),
          obj({}),
        ]),
      ),
      ResponseMappingTemplate: '$util.toJson($ctx.prev.result)',
    });
  }

  private addNoneDataSource(ctx: TransformerContext): void {
    // add none ds if that does not exist
    const noneDS = ctx.getResource(ResourceConstants.RESOURCES.NoneDataSource);
    if (!noneDS) {
      ctx.setResource(
        ResourceConstants.RESOURCES.NoneDataSource,
        new AppSync.DataSource({
          ApiId: this.getAPIId(),
          Name: 'NONE',
          Type: 'NONE',
        }),
      );
    }
  }

  protected getAPIId(): string | IntrinsicFunction {
    return Fn.GetAtt(ResourceConstants.RESOURCES.GraphQLAPILogicalID, 'ApiId');
  }
}
