import * as path from 'path';
import * as fs from 'fs-extra';
import * as chokidar from 'chokidar';
import * as dynamoEmulator from '@conduitvc/dynamodb-emulator';
import { processResources } from './CFNParser/resource-processor';
import { createServerWithConfig } from 'amplify-graphql-test-server';
const cleanupQueue = [];

export async function testGraphQLAPI(context: any) {
  let server;

  registerCleanup(context);
  const ddbClient = await launchDDBLocal(context);

  addCleanupTask(async context => {
    await generateFrontendExports(context);
  });
  try {
    server = await startAppSyncServer(context, ddbClient);
    console.log('AppSync test server Endpoint:', server.url);
  } catch (e) {
    console.log(e);
    // Sending term signal so we clean up after ourself
    process.kill(process.pid, 'SIGTERM');
  }

  const watcher = await registerWatcher(context);
  const reloadFn = async () => {
    try {
      console.log('reloading....');
      if (server) {
        server.server.close();
      }
      server = await startAppSyncServer(context, ddbClient);
    } catch (e) {
      console.log('could not start the server', e);
    }
  };
  watcher
    .on('add', path => {
      console.log(`File ${path} has been added`);
      reloadFn();
    })
    .on('change', path => {
      console.log(`File ${path} has been changed`);
      reloadFn();
    })
    .on('unlink', path => {
      console.log(`File ${path} has been removed`);
      reloadFn();
    });
}

async function startAppSyncServer(context, ddbClient, port = 8899, wsPort = 8810) {
  const { name, api } = await getAppSyncAPI(context);
  const { transformerOutput, stack } = await runTransformer(context);
  const config = processResources(stack, transformerOutput);
  const server = await createServerWithConfig(ddbClient, config, port, wsPort);
  await generateFrontendExports(context, {
    endpoint: server.url,
    name,
    GraphQLAPIKeyOutput: config.custom.appSync.apiKey,
    region: 'local',
    additionalAuthenticationProviders: [],
    securityType: config.custom.appSync.authenticationType
  });
  return server;
}

async function registerWatcher(context: any) {
  const { projectPath } = context.amplify.getEnvInfo();
  const { name: apiName } = await getAppSyncAPI(context);
  const watchDir = path.join(projectPath, 'amplify', 'backend', 'api', apiName);
  return chokidar.watch(watchDir, {
    interval: 100,
    ignoreInitial: true,
    followSymlinks: false,
    ignored: '**/build/**',
    awaitWriteFinish: true
  });
}

async function launchDDBLocal(context: any) {
  const { projectPath } = context.amplify.getEnvInfo();
  const dbPath = path.join(projectPath, 'amplify', 'test', '.dynamodb');
  fs.ensureDirSync(dbPath);
  const emulator = await dynamoEmulator.launch({
    dbPath,
    port: null
  });

  addCleanupTask(async context => {
    console.log('Terminating DDB Local');
    await emulator.terminate();
    console.log('DDB local terminated');
  });
  return await dynamoEmulator.getClient(emulator);
}

async function runTransformer(context: any) {
  const transformerOutput = await context.amplify.executeProviderUtils(
    context,
    'awscloudformation',
    'compileSchema',
    { noConfig: true, forceCompile: true, dryRun: true }
  );
  const stack = Object.values(transformerOutput.stacks).reduce(
    (prev, stack: any) => {
      return { ...prev, ...stack.Resources };
    },
    { ...transformerOutput.rootStack.Resources }
  );
  return { transformerOutput, stack };
}

async function generateFrontendExports(
  context: any,
  localAppSyncDetails?: {
    name: string;
    endpoint: string;
    securityType: string;
    additionalAuthenticationProviders: string[];
    GraphQLAPIKeyOutput?: string;
    region?: string;
  }
) {
  const currentMeta = await getAmplifyMeta(context);
  if (localAppSyncDetails) {
    currentMeta.api = currentMeta.api || {};
    const appSyncApi = currentMeta.api[localAppSyncDetails.name] || { output: {} };
    currentMeta.api[localAppSyncDetails.name] = {
      service: 'AppSync',
      ...appSyncApi,
      output: {
        ...appSyncApi.output,
        GraphQLAPIEndpointOutput: localAppSyncDetails.endpoint,
        projectRegion: localAppSyncDetails.region,
        aws_appsync_authenticationType: localAppSyncDetails.securityType,
        GraphQLAPIKeyOutput: localAppSyncDetails.GraphQLAPIKeyOutput
      },
      lastPushTimeStamp: new Date()
    };
  }

  await context.amplify.onCategoryOutputsChange(context, null, currentMeta);
}

async function getAmplifyMeta(context: any) {
  const amplifyMetaFilePath = context.amplify.pathManager.getAmplifyMetaFilePath();
  return context.amplify.readJsonFile(amplifyMetaFilePath);
}
async function getAppSyncAPI(context) {
  const currentMeta = await getAmplifyMeta(context);
  const { api: apis = {} } = currentMeta;
  let appSyncApi = null;
  let name = null;
  Object.entries(apis).some((entry: any) => {
    if (entry[1].service === 'AppSync') {
      appSyncApi = entry[1];
      name = entry[0];
      return true;
    }
  });
  return { name, api: appSyncApi };
}

function addCleanupTask(task: Function) {
  cleanupQueue.push(task);
}

function registerCleanup(context) {
  // do all the cleanup
  //  1. Update the Frontend exports to original version
  process.on('SIGINT', async () => {
    console.log('restoring the export file');
    const promises = cleanupQueue.map(fn => fn(context));
    await Promise.all(promises);
    process.exit(0);
  });
}
