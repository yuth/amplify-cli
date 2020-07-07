import { DynamoDBModelTransformer } from 'graphql-dynamodb-transformer';
import { GraphQLTransform } from 'graphql-transformer-core';
import { GraphQLClient } from './utils/graphql-client';
import { deploy, launchDDBLocal, terminateDDB, logDebug } from './utils/index';
import AWSAppSyncClient, { AUTH_TYPE } from 'aws-appsync';
import gql from 'graphql-tag';
import * as WebSocket from 'ws';
import 'isomorphic-fetch';

(global as any).fetch = require('node-fetch');
(global as any).WebSocket = WebSocket;

let GRAPHQL_ENDPOINT = undefined;
let GRAPHQL_CLIENT: AWSAppSyncClient<any>;
let ddbEmulator = null;
let dbPath = null;
let server;
jest.setTimeout(200000);
const SUBSCRIPTION_DELAY = 6000;
beforeAll(async () => {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  const validSchema = /* GraphQL */ `
    type Post @model {
      id: ID!
      title: String!
      createdAt: AWSDateTime
      updatedAt: AWSDateTime
    }

    type Subscription {
      onCreatePostFiltered(title: String!): Post @aws_subscribe(mutations: ["createPost"])
    }
  `;

  try {
    const transformer = new GraphQLTransform({
      transformers: [new DynamoDBModelTransformer()],
    });
    const out = await transformer.transform(validSchema);
    let ddbClient;
    ({ dbPath, emulator: ddbEmulator, client: ddbClient } = await launchDDBLocal());
    const result = await deploy(out, ddbClient);
    server = result.simulator;

    GRAPHQL_ENDPOINT = server.url + '/graphql';
    logDebug(`Using graphql url: ${GRAPHQL_ENDPOINT}`);

    const apiKey = result.config.appSync.apiKey;
    logDebug(apiKey);
    GRAPHQL_CLIENT = new AWSAppSyncClient({
      url: GRAPHQL_ENDPOINT,
      region: 'my-local-2',
      disableOffline: true,
      offlineConfig: {
        keyPrefix: 'subscriptions',
      },
      auth: {
        type: AUTH_TYPE.API_KEY,
        apiKey: apiKey,
      },
    });
  } catch (e) {
    logDebug('failed to setup');
    logDebug(e);
    expect(true).toBe(false);
  }
});

afterAll(async () => {
  if (server) {
    await server.stop();
  }
  await terminateDDB(ddbEmulator, dbPath);
});

test('it shoud do subscription filtering', async done => {
  const observer = GRAPHQL_CLIENT.subscribe({
    query: gql`
      subscription onCreatePostFiltered {
        onCreatePostFiltered(title: "Filtered Subscription") {
          id
          title
          createdAt
          updatedAt
        }
      }
    `,
    // variables: { title: 'Filtered Subscription' },
  });

  let subscription = await observer.subscribe(async (event: any) => {
    const post = event.data.onCreatePostFiltered;
    subscription.unsubscribe();
    expect(post.title).not.toEqual('Post1');

    expect(post.title).toEqual('Filtered Subscription');
    expect(post.id).toBeDefined();
    expect(post.createdAt).toBeDefined();
    expect(post.updatedAt).toBeDefined();
    done();
  });

  await new Promise(res => setTimeout(() => res(), SUBSCRIPTION_DELAY));
  await createPost(GRAPHQL_CLIENT, { title: 'Post1' });
  await createPost(GRAPHQL_CLIENT, { title: 'Filtered Subscription' });
});

test('it should fire subscription message when a Post is created', async done => {
  const observer = GRAPHQL_CLIENT.subscribe({
    query: gql`
      subscription OnCreatePost {
        onCreatePost {
          id
          title
          createdAt
          updatedAt
        }
      }
    `,
  });

  let subscription = observer.subscribe(async (event: any) => {
    const post = event.data.onCreatePost;
    subscription.unsubscribe();
    expect(post.title).toEqual('Post1');
    expect(post.id).toBeDefined();
    expect(post.createdAt).toBeDefined();
    expect(post.updatedAt).toBeDefined();
    done();
  });

  await new Promise(res => setTimeout(() => res(), SUBSCRIPTION_DELAY));
  await createPost(GRAPHQL_CLIENT, { title: 'Post1' });
});

type CreatePostInput = {
  id?: String;
  title?: String;
  createdAt?: String;
  updatedAt?: String;
};

async function createPost(client: AWSAppSyncClient<any>, input: CreatePostInput) {
  const request = gql`
    mutation createPost($input: CreatePostInput!) {
      createPost(input: $input) {
        id
        title
        createdAt
        updatedAt
      }
    }
  `;
  return client.mutate({ mutation: request, variables: { input } });
}
