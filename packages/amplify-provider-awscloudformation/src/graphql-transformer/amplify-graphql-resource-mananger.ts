import path from 'path';
import fs from 'fs-extra';
import { diff as getDiffs } from 'deep-diff';
import { DiffableProject, loadDiffableProject } from '../utils/amplify-resource-state-utils';

interface Diff {
  kind: 'N' | 'E' | 'D' | 'A';
  path: string[];
  lhs?: any;
  rhs?: any;
  index?: number;
  item?: any;
}
/**
 * Rules
 */
type DiffRule = (diff: Diff, currentBuild: DiffableProject, nextBuild: DiffableProject) => void;
type ProjectRule = (diffs: Diff[], currentBuild: DiffableProject, nextBuild: DiffableProject) => void;

export type GQLResourceManagerProps = {
  resourceStatus: any,
  backendDir: string,
  cloudBackendDir: string,
  iterativeChangeEnabled: boolean,
  rootStackFileName?: string,
}

export class GraphQLResourceManager {
  static serviceName: string = 'AppSync';
  static categoryName: string = 'api';
  resourceName: string;
  rootStackFileName: string;
  cloudBuildDir: string;
  buildDir: string;
  currentState: DiffableProject;
  nextState: DiffableProject;
  gsiChanges: Array<any>;
  // setting to true for now
  needsIterativeDeployments: boolean = true;
  // this.diffRules


  constructor(props: GQLResourceManagerProps) {
    this.resourceName = this.getResourceName(props.resourceStatus);
    if (!this.resourceName) {
      throw Error('No GraphQL API enabled.');
    }
    this.cloudBuildDir = path.join(props.cloudBackendDir, GraphQLResourceManager.categoryName, this.resourceName, 'build');
    this.buildDir = path.join(props.backendDir, GraphQLResourceManager.categoryName, this.resourceName, 'build');
    this.rootStackFileName = props.rootStackFileName || 'cloudformation-template.json';
    // gsi changes
    this.gsiChanges = new Array<any>();
  }

  run() {
    // run sanity checks
    this.sanityCheck();
  }

  sanityCheck() {
    // run sanity checks to determine if iterative changes are required
    const cloudBuildDirExists = fs.existsSync(this.cloudBuildDir);
    const buildDirExists = fs.existsSync(this.buildDir);
    if(cloudBuildDirExists && buildDirExists) {
      this.currentState = loadDiffableProject(this.cloudBuildDir, this.rootStackFileName);
      this.nextState = loadDiffableProject(this.buildDir, this.rootStackFileName);
      const diffs = getDiffs(this.currentState, this.nextState);
      if (diffs) {
        // for(const diff )
      }
    }
  }

  getResourceName(resourceStatus: any): string | null {
    const { resourcesToBeCreated, resourcesToBeUpdated } = resourceStatus;
    let resources = resourcesToBeCreated.concat(resourcesToBeUpdated);
    if (resources.length > 0) {
      const resource = resources[0];
      if (resource.providerPlugin !== 'awscloudformation') {
        return;
      }
      return resource.resourceName;
    } else {
      // No resource to update/add
      return null;
    }
  }
}