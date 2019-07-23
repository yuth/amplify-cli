import { AmplifyAppSyncSimulator } from 'amplify-appsync-simulator';
import { ensureDynamoDBTables, configureDDBDataSource } from '../../utils/ddb-utils';
import { processResources } from '../../CFNParser/resource-processor';
import * as dynamoEmulator from '@conduitvc/dynamodb-emulator';
import * as fs from 'fs-extra';
import * as path from 'path';

export async function launchDDBLocal() {
    let dbPath
    while(true) {
        dbPath = path.join(
            '/tmp',
            `amplify-cli-emulator-dynamodb-${Math.floor(Math.random() * 100)}`
        );
        if(!fs.existsSync(dbPath))
            break;
    }

    fs.ensureDirSync(dbPath);
    const emulator = await dynamoEmulator.launch({
        dbPath,
        port: null
    });
    const client = await dynamoEmulator.getClient(emulator);
    return { emulator, dbPath, client };
}

export async function deploy(transformerOutput: any, client) {
    const stacks = Object.values(transformerOutput.stacks).reduce(
        (prev, stack: any) => {
            return { ...prev, ...stack.Resources };
        },
        { ...transformerOutput.rootStack.Resources }
    );

    let config = processResources(stacks, transformerOutput);
    await ensureDynamoDBTables(client, config);
    config = configureDDBDataSource(config, client.config);
    const simulator = await runAppSyncSimulator(config);
    return {simulator, config};
}

export async function terminateDDB(emulator, dbPath) {
    try {
        if(emulator && emulator.terminate) {
            await emulator.terminate();
        }
        fs.removeSync(dbPath);
    } catch(e) {
        console.log('Failed to terminate the DDB server', e);
    }

}

export async function runAppSyncSimulator(
    config,
    port?: number,
    wsPort?: number
) {
    const appsyncSimulator = new AmplifyAppSyncSimulator({ port, wsPort });
    await appsyncSimulator.start();
    await appsyncSimulator.init(config);
    return appsyncSimulator;
}

export function logDebug(...msgs) {
    if(process.env.DEBUG || process.env.CI) {
        console.log(...msgs)
    }
}