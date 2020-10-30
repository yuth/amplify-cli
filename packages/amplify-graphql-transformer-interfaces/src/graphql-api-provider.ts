import {
  NoneDataSource,
  HttpDataSource,
  DynamoDbDataSource,
  LambdaDataSource,
  BaseDataSource,
  CfnResolver,
} from '@aws-cdk/aws-appsync';
import { IFunction } from '@aws-cdk/aws-lambda';
import { ITable } from '@aws-cdk/aws-dynamodb';
import { CfnResource, Construct, IConstruct, Stack } from '@aws-cdk/core';
import { Grant, IGrantable } from '@aws-cdk/aws-iam';

export interface AppSyncFunctionConfigurationProvider extends IConstruct {
  readonly arn: string;
  readonly functionId: string;
}
export interface DataSourceOptions {
  /**
   * The name of the data source, overrides the id given by cdk
   *
   * @default - generated by cdk given the id
   */
  readonly name?: string;
  /**
   * The description of the data source
   *
   * @default - No description
   */
  readonly description?: string;
}

export enum TemplateType  {
  INLINE = 'INLINE',
  S3_LOCATION = 'S3_LOCATION'
}
export interface InlineMappingTemplateProvider {
  type: TemplateType.INLINE
  bind(scope: Construct): string;
}
export interface S3MappingTemplateProvider {
  type: TemplateType.S3_LOCATION
  bind(
    scope: Construct,
  ): string;
}

export type MappingTemplateProvider = InlineMappingTemplateProvider | S3MappingTemplateProvider;

export interface GraphQLApiProvider {
  readonly apiId: string;
  addHttpDataSource(name: string, endpoint: string, options?: DataSourceOptions, stack?: Stack): HttpDataSource;
  addDynamoDbDataSource(name: string, table: ITable, options?: DataSourceOptions, stack?: Stack): DynamoDbDataSource;
  addNoneDataSource(name: string, options?: DataSourceOptions, stack?: Stack): NoneDataSource;
  addLambdaDataSource(name: string, lambdaFunction: IFunction, options?: DataSourceOptions, stack?: Stack): LambdaDataSource;

  addAppSyncFunction: (
    name: string,
    requestMappingTemplate: MappingTemplateProvider,
    responseMappingTemplate: MappingTemplateProvider,
    dataSourceName: string,
    stack?: Stack,
  ) => AppSyncFunctionConfigurationProvider;

  addResolver: (
    typeName: string,
    fieldName: string,
    requestMappingTemplate: MappingTemplateProvider,
    responseMappingTemplate: MappingTemplateProvider,
    dataSourceName?: string,
    pipelineConfig?: string[],
    stack?: Stack,
  ) => CfnResolver;

  getDataSource: (name: string) => BaseDataSource | void;
  hasDataSource: (name: string) => boolean;
  // getDefaultAuthorization(): Readonly<AuthorizationMode>;
  // getAdditionalAuthorizationModes(): Readonly<AuthorizationMode[]>;
  addToSchema(addition: string): void;
  addSchemaDependency(construct: CfnResource): boolean;

  grant(grantee: IGrantable, resources: APIIAMResourceProvider, ...actions: string[]): Grant;
  // /**
  //  *  Adds an IAM policy statement for Mutation access to this GraphQLApi to an IAM principal's policy.
  //  *
  //  * @param grantee The principal.
  //  * @param fields The fields to grant access to that are Mutations (leave blank for all).
  //  */
  grantMutation(grantee: IGrantable, ...fields: string[]): Grant;
  // /**
  //  *  Adds an IAM policy statement for Query access to this GraphQLApi to an IAM principal's policy.
  //  *
  //  * @param grantee The principal.
  //  * @param fields The fields to grant access to that are Queries (leave blank for all).
  //  */
  grantQuery(grantee: IGrantable, ...fields: string[]): Grant;
  // /**
  //  *  Adds an IAM policy statement for Subscription access to this GraphQLApi to an IAM principal's policy.
  //  *
  //  * @param grantee The principal.
  //  * @param fields The fields to grant access to that are Subscriptions (leave blank for all).
  //  */
  grantSubscription(grantee: IGrantable, ...fields: string[]): Grant;
}

export interface APIIAMResourceProvider {
  /**
   * Return the Resource ARN
   *
   * @param api The GraphQL API to give permissions
   */
  resourceArns(api: GraphQLApiProvider): string[];
}
