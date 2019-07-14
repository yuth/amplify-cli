import * as dynamoEmulator from '@conduitvc/dynamodb-emulator';
import { AmplifyAppSyncSimulator } from 'amplify-appsync-simulator';
import { add, generate, isCodegenConfigured } from 'amplify-codegen';
import * as chokidar from 'chokidar';
import * as fs from 'fs-extra';
import * as path from 'path';
import { processResources } from '../CFNParser/resource-processor';
import { runTransformer } from './run-graphql-transformer';
import { ResolverOverrides } from './resolver-overrides';

const cleanupQueue = [];

export async function testGraphQLAPI(context: any) {
    let server;

    registerCleanup(context);
    const ddbClient = await launchDDBLocal(context);
    const resolverDirectory = await getResolverTemplateDirectory(context);
    const resolverOverrideManager = new ResolverOverrides(resolverDirectory);
    const watcher = await registerWatcher(context);
    addCleanupTask(async context => {
        await generateFrontendExports(context);
        watcher.close();
        resolverOverrideManager.stop();
    });
    try {
        server = await startAppSyncServer(context, ddbClient, resolverOverrideManager);
        console.log('AppSync test server Endpoint:', server.url);

        watcher
            .on('add', path => {
                console.log(`File ${path} has been added`);
                reloadFn(context, path, ddbClient, server, resolverOverrideManager, 'add');
            })
            .on('change', path => {
                console.log(`File ${path} has been changed`);
                reloadFn(context, path, ddbClient, server, resolverOverrideManager, 'change');
            })
            .on('unlink', path => {
                console.log(`File ${path} has been removed`);
                reloadFn(context, path, ddbClient, server, resolverOverrideManager, 'unlink');
            });
    } catch (e) {
        console.log(e);
        // Sending term signal so we clean up after ourself
        process.kill(process.pid, 'SIGTERM');
    }
}

async function reloadFn(
    context,
    filePath: string,
    ddbClient,
    appSyncServer,
    overrideManager: ResolverOverrides,
    action
) {
    try {
        let config;
        let result;
        console.log('reloading....');
        if (filePath.includes(overrideManager.resolverTemplateRoot)) {
            switch (action) {
                case 'add':
                    result = overrideManager.onAdd(filePath);
                    break;
                case 'change':
                    result = overrideManager.onChange(filePath);
                    break;
                case 'unlink':
                    result = overrideManager.onUnlink(filePath);
                    break;
            }

            if (result) {
                config = appSyncServer.config;
                config.mappingTemplates = overrideManager.sync(config.mappingTemplates);
                await appSyncServer.reload(config);
            }
        } else {
            const { transformerOutput, stack } = await runTransformer(context);
            config = processResources(stack, transformerOutput);
            config.mappingTemplates = await overrideManager.sync(config.mappingTemplates);
            await ensureDynamoDBTables(ddbClient, config);
            config = configureDDBDataSource(config, ddbClient.config);
            await appSyncServer.reload(config);
            await generateCode(context, transformerOutput);
        }
    } catch (e) {
        console.log('Reloading failed', e);
    }
}

async function startAppSyncServer(context, ddbClient, overrideManager, port = 8899, wsPort = 8810) {
    const { name, api } = await getAppSyncAPI(context);
    const { transformerOutput, stack } = await runTransformer(context);
    let config: any = processResources(stack, transformerOutput);
    await ensureDynamoDBTables(ddbClient, config);
    config = configureDDBDataSource(config, ddbClient.config);
    config.mappingTemplates = await overrideManager.sync(config.mappingTemplates);
    const appsyncSimulator = await runAppSyncSimulator(config, port, wsPort);
    await generateFrontendExports(context, {
        endpoint: appsyncSimulator.url,
        name,
        GraphQLAPIKeyOutput: config.appSync.apiKey,
        region: 'local',
        additionalAuthenticationProviders: [],
        securityType: config.appSync.authenticationType
    });
    await generateCode(context, transformerOutput);
    return appsyncSimulator;
}

export function configureDDBDataSource(config, ddbConfig) {
    config.dataSources
        .filter(d => d.type === 'AMAZON_DYNAMODB')
        .forEach(d => {
            d.config.endpoint = ddbConfig.endpoint;
            d.config.region = ddbConfig.region;
            d.config.accessKeyId = ddbConfig.accessKeyId;
            d.config.secretAccessKey = ddbConfig.secretAccessKey;
        });
    return config;
}

export async function runAppSyncSimulator(
    config,
    port?: number,
    wsPort?: number
): AmplifyAppSyncSimulator {
    const appsyncSimulator = new AmplifyAppSyncSimulator(config, { port, wsPort });
    await appsyncSimulator.start();
    return appsyncSimulator;
}

export async function reloadAppSyncSimulator(
    config,
    simulator: AmplifyAppSyncSimulator
): AmplifyAppSyncSimulator {
    await simulator.reload(config);
    return simulator;
}

async function registerWatcher(context: any) {
    const watchDir = await getAPIBackendDirectory(context);
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

export async function ensureDynamoDBTables(dynamodb, config) {
    const tables = config.tables.map(t => t.Properties);
    await Promise.all(
        tables.map(async resource => {
            try {
                console.info('creating table', resource.TableName);
                await dynamodb.createTable(resource).promise();
            } catch (err) {
                if (err.code !== 'ResourceInUseException') throw err;
            }
        })
    );
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

async function generateCode(context, transformerOutput) {
    console.log('Running codegen');
    const { projectPath } = context.amplify.getEnvInfo();
    const { name: apiName } = await getAppSyncAPI(context);
    const schemaPath = path.join(
        projectPath,
        'amplify',
        'backend',
        'api',
        apiName,
        'build',
        'schema.graphql'
    );
    fs.writeFileSync(schemaPath, transformerOutput.schema);
    if (!isCodegenConfigured(context)) {
        await add(context);
    } else {
        await generate(context);
    }
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

export function addCleanupTask(task: Function) {
    cleanupQueue.push(task);
}

export function registerCleanup(context) {
    // do all the cleanup
    //  1. Update the Frontend exports to original version
    process.on('SIGINT', async () => {
        console.log('restoring the export file');
        const promises = cleanupQueue.map(fn => fn(context));
        await Promise.all(promises);
        process.exit(0);
    });
}

export async function getAPIBackendDirectory(context) {
    const { projectPath } = context.amplify.getEnvInfo();
    const { name: apiName } = await getAppSyncAPI(context);
    return path.join(projectPath, 'amplify', 'backend', 'api', apiName);
}

export async function getResolverTemplateDirectory(context) {
    const apiDirectory = await getAPIBackendDirectory(context);
    return path.join(apiDirectory, 'resolvers');
}
