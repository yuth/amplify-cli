import { $TSContext } from 'amplify-cli-core';
import { StateMachinePage } from './utils/amplify-resource-state-utils';
import { GraphQLResourceManager } from './graphql-transformer/amplify-graphql-resource-mananger';
/** call the graphql resource manager then pass the existing checks into the state machine */


export async function run(context: $TSContext): Promise<StateMachinePage[]> {
  /**
   * TODO: Merge stateMachine resources by category
   */
  const backEndDir = context.amplify.pathManager.getBackendDirPath();
  const cloudBackendRootDir = context.amplify.pathManager.getCurrentCloudBackendDirPath();
  const resourceStatus = await context.amplify.getResourceStatus(GraphQLResourceManager.categoryName);
  // const gqlManager = new GraphQLResourceManager(resourceStatus, backEndDir, cloudBackendRootDir);
  return null;
}