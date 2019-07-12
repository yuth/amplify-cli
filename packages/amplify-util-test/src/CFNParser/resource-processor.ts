import { CloudFormationParseContext } from './types';
import { isPlainObject } from 'lodash';
import { parseValue } from './field-parser';

const resourceProcessorMapping = {
  'AWS::AppSync::GraphQLApi': graphQLAPIResourceHandler,
  'AWS::AppSync::ApiKey': graphQLAPIKeyResourceHandler,
  'AWS::AppSync::GraphQLSchema': graphQLSchemaHandler,
  'AWS::DynamoDB::Table': dynamoDBResourceHandler,
  'AWS::AppSync::Resolver': graphQLResolverHandler,
  'AWS::AppSync::DataSource': graphQLDataSource
}
export function dynamoDBResourceHandler(resourceName, resource, cfnContext:CloudFormationParseContext, transformResult: any) {
  const tableName = resourceName;
  // const keySchemaList = resource.Properties.KeySchema.map(s => s.AttributeName);
  // const attributeDefinitions = resource.Properties.AttributeDefinitions.filter(attDef => keySchemaList.includes(attDef.AttributeName))
  const gsis = (resource.Properties.GlobalSecondaryIndexes || []).map(gsi => {
    const p = { ... gsi }
    delete p.ProvisionedThroughput;
    return p;
  });
  const processedResource:any = {
    Type: 'AWS::DynamoDB::Table',
    Properties: {
      TableName: tableName,
      BillingMode: "PAY_PER_REQUEST",
      KeySchema: resource.Properties.KeySchema,
      // AttributeDefinitions: attributeDefinitions,
      AttributeDefinitions: resource.Properties.AttributeDefinitions,
    }
  }
  if(gsis.length) {
    processedResource.Properties.GlobalSecondaryIndexes = gsis;
  }
  return processedResource;
}

export function graphQLDataSource(resourceName, resource, cfnContext:CloudFormationParseContext, transformResult: any) {
  const tableName = resource.Properties.Name;
  const typeName = resource.Properties.Type;
  if(typeName === 'AMAZON_DYNAMODB') {
    return {
      name: resourceName,
      type: 'AMAZON_DYNAMODB',
      config: {
        tableName,
      }
    }
  }
  if(typeName === 'NONE') {
    return {
      name: resource.Properties.Name,
      type: 'NONE',
    }
  }
}

export function graphQLAPIResourceHandler(resourceName, resource, cfnContext:CloudFormationParseContext,  transformResult: any) {
  const apiId = 'amplify-test-api-id' // TODO: Generate
  const processedResource = {
    type: resource.Type,
    name: cfnContext.params.AppSyncApiName || 'AppSyncTransformer',
    authenticationType: resource.Properties.AuthenticationType,
    // authenticationType: parseValue(resource.Properties.AuthenticationType, cfnContext,  transformResult: any),
    ref: `arn:aws:appsync:us-east-1:123456789012:apis/${apiId}`,
  }
  return processedResource;
}

export function graphQLAPIKeyResourceHandler(resourceName, resource, cfnContext:CloudFormationParseContext,  transformResult: any) {
  const value = 'da2-fakeApiId123456' // TODO: Generate
  const processedResource = {
    type: resource.Type,
    // apiId: parseValue(resource.Properties.ApiId, cfnContext),
    value,
    ref: `arn:aws:appsync:us-east-1:123456789012:apis/graphqlapiid/apikey/apikeya1bzhi${value}`
  }
  return processedResource;
}

export function graphQLSchemaHandler(resourceName, resource, cfnContext: CloudFormationParseContext, transformResult: any) {
  return {
    content: transformResult.schema,
    path: 'schema.json' // XXX: handle schema folder
  };
}

export function graphQLResolverHandler(resourceName, resource, cfnContext: CloudFormationParseContext, transformResult: any) {
  const { Properties: properties } = resource;
  const requestMappingTemplate = [properties.TypeName, properties.FieldName, 'req.vtl'].join('.')
  const responseMappingTemplate = [properties.TypeName, properties.FieldName, 'res.vtl'].join('.')
  return {
    dataSourceName: getDataSourceName(properties.DataSourceName),
    typeName: properties.TypeName,
    fieldName: properties.FieldName,
    requestMappingTemplateLocation: requestMappingTemplate,
    responseMappingTemplateLocation: responseMappingTemplate,
  }
}

function getDataSourceName(dataSourceName) {
  // XXX: Util to map data source based on type of intrinsic function
  if(typeof dataSourceName === 'string')
    return dataSourceName;
    if(isPlainObject(dataSourceName) && Object.keys(dataSourceName).length === 1)  {
      const intrinsicFn = Object.keys(dataSourceName)[0];
      if(intrinsicFn === 'Fn::GetAtt') {
        return dataSourceName[intrinsicFn][0]
      }
    }
    else if(dataSourceName.name === 'Fn::ImportValue') {
      return dataSourceName.payload.payload[1][2]
    }


}
export function processResources(resources, transformResult:any, params = {}) {
  const cfnContext:CloudFormationParseContext = {
    conditions: {},
    params: {
      env: 'NONE',
      ...params
    },
    resources: {},
    exports: {}
  }
  const processedResources = {
    schema: {
    },
    resolvers: [],
    functions: [],
    dataSources: [],
    mappingTemplates: [],
    tables: [],
    appSync: {
      name: '',
      authenticationType: '',
      apiKey: null
    }
  };
  Object.entries(resources).forEach((entry) => {
    const [resourceName, resource] = entry;
    const { Type: resourceType } = resource as any;
    if(Object.keys(resourceProcessorMapping).includes(resourceType)) {
      const result = resourceProcessorMapping[resourceType](resourceName, resource, cfnContext, transformResult)
      cfnContext.resources[resourceName] = result;

      switch(resourceType) {
        case 'AWS::AppSync::DataSource':
          processedResources.dataSources.push(result);
          break;
        case 'AWS::AppSync::Resolver':
            processedResources.resolvers.push(result);
            break;
        case 'AWS::DynamoDB::Table':
            processedResources.tables.push(result);
            break;
        case 'AWS::AppSync::GraphQLSchema':
            processedResources.schema = result;
            break;
        case 'AWS::AppSync::GraphQLApi':
            processedResources.appSync.name = result.name;
            processedResources.appSync.authenticationType = result.authenticationType;
            break;
        case 'AWS::AppSync::ApiKey':
            processedResources.appSync.apiKey = result.value;
            break;
      }
    }
  });
  Object.entries(transformResult.resolvers).forEach(([path, content]) => {
    processedResources.mappingTemplates.push({
      path,
      content
    })
  })

  return processedResources;

}
