import { CloudFormation } from 'aws-sdk';
import { mocked } from 'ts-jest/utils';
import { GraphQLResourceManager } from '../../graphql-transformer/';
import { $ResourceMeta } from '../../graphql-transformer/amplify-graphql-resource-manager';
import { DiffableProject, getGQLDiff } from '../../graphql-transformer/utils';
import { diff as getDiffs } from 'deep-diff';

jest.mock('../../graphql-transformer/utils', () => ({
  ...jest.requireActual('../../graphql-transformer/utils'),
  getGQLDiff: jest.fn(),
}));
jest.mock('../../utils/amplify-resource-state-utils', () => ({
  ...jest.requireActual('../../utils/amplify-resource-state-utils'),
  getTableARNS: jest.fn().mockImplementation(async (cfnClient: CloudFormation, tables: string[], StackId: string) => {
    const map = new Map();
    for (const table of tables) {
      map.set(table, `${table}-${StackId}-dev`);
    }
    return map;
  }),
  getStackParameters: jest.fn().mockImplementation(async (cfnClient: CloudFormation, StackId: string) => {
    return {
      Bucket: `Name-${StackId}`,
      Root: 'sdasdasdasd',
    };
  }),
}));
jest.mock('fs-extra');
jest.mock('../../upload-appsync-files', () => ({
  hashDirectory: jest.fn().mockImplementation((directory: string) => {
    return 'hashbuild';
  }),
}));
jest.mock('aws-sdk');

describe('graphql resource manager', () => {
  const resourceMeta: $ResourceMeta = {
    category: 'api',
    providerPlugin: 'awscloudformation',
    resourceName: 'bookstore',
    service: 'AppSync',
    output: {},
    providerMetadata: {
      s3TemplateURL: 'https://storage.myservice.com/mybookstore/template.json',
      logicalId: 'apibookstore',
    },
    stackId: 'apibookstoreID',
    DeploymentBucketName: 'mybookstore-deployment-bucket',
  };
  test('test with two key change', async () => {
    //JSON.stringify(current.stacks['Book.json'].Resources.BookTable.Properties, null, 2)
    const current: DiffableProject = {
      stacks: {
        'Book.json': {
          Resources: {
            BookTable: {
              Type: 'AWS::DynamoDB::Table',
              Properties: {
                KeySchema: [{ AttributeName: 'id', KeyType: 'HASH' }],
                AttributeDefinitions: [{ AttributeName: 'id', AttributeType: 'S' }],
              },
            },
          },
        },
      },
      root: {},
    };
    const next: DiffableProject = {
      stacks: {
        'Book.json': {
          Resources: {
            BookTable: {
              Type: 'AWS::DynamoDB::Table',
              Properties: {
                KeySchema: [{ AttributeName: 'id', KeyType: 'HASH' }],
                AttributeDefinitions: [
                  { AttributeName: 'id', AttributeType: 'S' },
                  { AttributeName: 'name', AttributeType: 'S' },
                  { AttributeName: 'author', AttributeType: 'S' },
                ],
                GlobalSecondaryIndexes: [
                  { IndexName: 'byName', KeySchema: [{ AttributeName: 'name', KeyType: 'HASH' }] },
                  { IndexName: 'byAuthor', KeySchema: [{ AttributeName: 'author', KeyType: 'HASH' }] },
                ],
              },
            },
          },
        },
      },
      root: {},
    };
    const gqlManager = new GraphQLResourceManager({
      cfnClient: (jest.fn() as unknown) as CloudFormation,
      resourceMeta: resourceMeta,
      backendDir: 'localDir',
      cloudBackendDir: 'cloudDir',
    });
    mocked(getGQLDiff).mockImplementation((currentBacked: string, cloudBackendDir: string) => {
      return { current, next, diff: getDiffs(current, next) };
    });
    const deploymentSteps = await gqlManager.run();
    expect(deploymentSteps).toBeDefined();
    expect(deploymentSteps).toMatchSnapshot();
  });
});
