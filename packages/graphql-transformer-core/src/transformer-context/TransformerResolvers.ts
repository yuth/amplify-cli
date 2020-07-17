import { IntrinsicFunction } from 'cloudform-types/types/dataTypes';
import { BaseResolver } from '../util/BaseResolver';

export class TransformerResolvers {
  private resolverMap: Map<string, BaseResolver> = new Map();
  public addQueryResolver = (
    typeName: string,
    fieldName: string,
    dataSourceName: string | IntrinsicFunction,
    requestMappingTemplate: string,
    responseMappingTemplate: string,
  ): BaseResolver => {
    return this.addResolver(
      typeName,
      fieldName,
      dataSourceName,
      requestMappingTemplate,
      responseMappingTemplate,
      ['init', 'preauth', 'auth', 'postAuth', 'predataLoad'],
      ['postDataLoad', 'finish'],
    );
  };

  public addMutationResolver = (
    typeName: string,
    fieldName: string,
    dataSourceName: string | IntrinsicFunction,
    requestMappingTemplate: string,
    responseMappingTemplate: string,
  ): BaseResolver => {
    return this.addResolver(
      typeName,
      fieldName,
      dataSourceName,
      requestMappingTemplate,
      responseMappingTemplate,
      ['init', 'preauth', 'auth', 'postAuth', 'preUpdate'],
      ['postUpdate', 'finish'],
    );
  };

  public addSubscriptionResolver = (
    typeName: string,
    fieldName: string,
    dataSourceName: string | IntrinsicFunction,
    requestMappingTemplate: string,
    responseMappingTemplate: string,
  ): BaseResolver => {
    return this.addResolver(
      typeName,
      fieldName,
      dataSourceName,
      requestMappingTemplate,
      responseMappingTemplate,
      ['init', 'preauth', 'auth', 'postAuth', 'preSubscribe'],
      [],
    );
  };

  public addResolver = (
    typeName: string,
    fieldName: string,
    dataSourceName: string | IntrinsicFunction,
    requestMappingTemplate: string,
    responseMappingTemplate: string,
    requestSlots: string[] = ['init', 'preauth', 'auth', 'postAuth', 'predataLoad'],
    responseSlots: string[] = ['postDataLoad', 'preAuthFilter', 'authFilter', 'postAuthFilter', 'finish'],
  ): BaseResolver => {
    const resolverKey = `${typeName}.${fieldName}`;
    if (this.resolverMap.has(resolverKey)) {
      throw new Error(`Resolver already exists for ${resolverKey}`);
    }
    const resolver = new BaseResolver(
      typeName,
      fieldName,
      dataSourceName,
      requestMappingTemplate,
      responseMappingTemplate,
      requestSlots,
      responseSlots,
    );
    this.resolverMap.set(resolverKey, resolver);
    return resolver;
  };

  public getResolver(typeName: string, fieldName: string) {
    const resolverKey = `${typeName}.${fieldName}`;
    if (!this.resolverMap.has(resolverKey)) {
      throw new Error(`No resolver exists for ${resolverKey}`);
    }
    return this.resolverMap.get(resolverKey);
  }
  public collectResolvers(): [string,BaseResolver][] {
    return [...this.resolverMap.entries()];
  }
}
