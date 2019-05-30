import * as path from 'path';
import * as fs from 'fs-extra';
import * as dynamoEmulator from '@conduitvc/dynamodb-emulator';
import { processResources } from "./CFNParser/resource-processor";
import { createServerWithConfig } from 'amplify-graphql-test-server';


export async function testGraphQLAPI(context: any) {
  const ddbClient = await launchDDBLocal(context);
  const transformerResult = await runTransformer(context);
  console.log(JSON.stringify(transformerResult, null, 4));
  try {
    await createServerWithConfig(ddbClient, transformerResult);
  } catch(e) {
    console.log(e);
    process.exit(-1);
  }

}

async function launchDDBLocal(context: any) {
  const { projectPath } = context.amplify.getEnvInfo();
  const dbPath = path.join(projectPath, 'amplify', 'test', '.dynamodb');
  fs.ensureDirSync(dbPath);
  const emulator = await dynamoEmulator.launch({
    dbPath,
    port: null,
  });
  process.on('SIGINT', () => {
    // _ensure_ we do not leave java processes lying around.
    emulator.terminate().then(() => {
      process.exit(0);
    });
  });
  return  await dynamoEmulator.getClient(emulator);
}

async function runTransformer(context: any) {
  const transformerResult = await context.amplify.executeProviderUtils(context, 'awscloudformation', 'compileSchema', { noConfig: true, forceCompile: true, dryRun: true });
   const allResources =Object.values(transformerResult.stacks).reduce((prev, stack: any) => {
    return {...prev, ...stack.Resources };
  }, { ...transformerResult.rootStack.Resources });
  return processResources(allResources, transformerResult);
}