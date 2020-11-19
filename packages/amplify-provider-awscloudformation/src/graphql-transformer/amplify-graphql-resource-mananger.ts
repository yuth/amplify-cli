import path from 'path';
import fs from 'fs-extra';
import _ from 'lodash';
import { diff as getDiffs, Diff } from 'deep-diff';
import { DiffableProject, loadDiffableProject, GSIStatus, GSIRecord, TemplateState } from '../utils/amplify-resource-state-utils';
import { InvalidGSIMigrationError, sanityCheck } from 'graphql-transformer-core';
import { Template, DynamoDB } from 'cloudform-types';
import { GlobalSecondaryIndex, KeySchema, AttributeDefinition } from 'cloudform-types/types/dynamoDb/table';
/**
 * Rules
 */
type DiffChanges<T> = Array<Diff<DiffableProject, DiffableProject>>;

export type GQLResourceManagerProps = {
  resourceStatus: any;
  backendDir: string;
  cloudBackendDir: string;
  iterativeChangeEnabled?: boolean;
  rootStackFileName?: string;
};

export class GraphQLResourceManager {
  static serviceName: string = 'AppSync';
  static categoryName: string = 'api';
  resourceName: string;
  rootStackFileName: string;
  cloudBuildDir: string;
  buildDir: string;
  currentState: DiffableProject;
  nextState: DiffableProject;
  templateState: TemplateState;
  iterativeChangeEnabled: boolean;
  diffs: DiffChanges<DiffableProject>;
  // this.diffRules

  constructor(props: GQLResourceManagerProps) {
    this.resourceName = this.getResourceName(props.resourceStatus);
    if (!this.resourceName) {
      throw Error('No GraphQL API enabled.');
    }
    this.cloudBuildDir = path.join(props.cloudBackendDir, GraphQLResourceManager.categoryName, this.resourceName, 'build');
    this.buildDir = path.join(props.backendDir, GraphQLResourceManager.categoryName, this.resourceName, 'build');
    this.rootStackFileName = props.rootStackFileName || 'cloudformation-template.json';
    this.iterativeChangeEnabled = props.iterativeChangeEnabled;
    // gsi changes
    this.templateState = new TemplateState();
    this.diffs = this.createDiffs();
  }

  async run() {
    // run sanity checks
    let needsIterativeDeployments = false;
    try {
      await sanityCheck(this.cloudBuildDir, this.buildDir);
    } catch (err) {
      if (err instanceof InvalidGSIMigrationError && this.iterativeChangeEnabled) {
        needsIterativeDeployments = true;
      } else {
        throw err;
      }
    }
    if (needsIterativeDeployments) {
      this.gsiStateManagement();
    }
  }
  // save states to build with a copy of build on every deploy
  saveStates() {
    let count = 0;
    const stateFileDir = path.join(process.cwd(), 'states');
    fs.mkdirSync(stateFileDir);
    while (!this.templateState.isEmpty()) {
      fs.copySync(this.buildDir, path.join(stateFileDir, `${count}`));
      this.templateState.getKeys().forEach(key => {
        // cp dir of the build
        const filepath = path.join(stateFileDir, `${count}`, 'stacks', key);
        fs.writeFileSync(filepath, JSON.stringify(this.templateState.pop(key), null, 2));
      });
      count++;
    }
    fs.moveSync(stateFileDir, path.join(this.buildDir, 'states'));
  }

  gsiStateManagement() {
    const gsiChanges = _.filter(this.diffs, diff => {
      return _.includes(diff.path, 'GlobalSecondaryIndexes');
    });
    // we need to make sure that the gsi changes are greater than 1 otherwise we can do this in one push
    for (const gsiChange of gsiChanges) {
      const stackName = gsiChange.path[1];
      const tableName = gsiChange.path[3];
      const gsiStatus = this.gsiChangeStatus(gsiChange);
      const ddbResource = this.templateState.getLatest(stackName) || this.getStack(stackName, 'current');

      if (gsiStatus === GSIStatus.add) {
        const indexName = (gsiChange as any).item.rhs.IndexName;
        let gsiRecord = this.getGSIRecord(indexName, this.getTable(gsiChange, 'next'));
        this.addGSI(gsiRecord, tableName, ddbResource);
        this.templateState.add(stackName, JSON.stringify(ddbResource));
      }
      // if its an edit most likely one gsi is removed and another was added
      // by using the index name we can check which values to remove
      else if (gsiStatus === GSIStatus.edit) {
        const gsiPath = gsiChange.path.slice(0, 7);
        const rhsGSIName = _.get(this.nextState, gsiPath).IndexName;
        const lhsGSIName = _.get(this.currentState, gsiPath).IndexName;
        // remove the gsi
        this.deleteGSI(lhsGSIName, tableName, ddbResource);
        this.templateState.add(stackName, JSON.stringify(ddbResource));
        // add the gsi
        const gsiRecord = this.getGSIRecord(rhsGSIName, this.getTable(gsiChange, 'next'));
        this.addGSI(gsiRecord, tableName, ddbResource);
        this.templateState.add(stackName, JSON.stringify(ddbResource));
      } else if (gsiStatus === GSIStatus.delete) {
        const removedGSI = (gsiChange as any).item.lhs as GlobalSecondaryIndex;
        this.deleteGSI(removedGSI.IndexName as string, tableName, ddbResource);
        this.templateState.add(stackName, JSON.stringify(ddbResource));
      } else if (gsiStatus === GSIStatus.batchAdd) {
      /**
       * batch gsi actions
       */
        const addedGSIs = (gsiChange as any).lhs as GlobalSecondaryIndex[];
        for (const gsi of addedGSIs) {
          // grab added gsi resources
          let gsiRecord = this.getGSIRecord(gsi.IndexName as string, this.getTable(gsiChange, 'next'));
          this.addGSI(gsiRecord, tableName, ddbResource);
          this.templateState.add(stackName, JSON.stringify(ddbResource));
        }
      } else if (gsiStatus === GSIStatus.batchDelete) {
        const removedGSIs = (gsiChange as any).lhs as GlobalSecondaryIndex[];
        for (let gsi of removedGSIs) {
          // grab deleted gsi resource
          this.deleteGSI(gsi.IndexName as string, tableName, ddbResource);
          this.templateState.add(stackName, JSON.stringify(ddbResource));
        }
      }
    }
  }

  gsiChangeStatus(gsiChange: Diff<any, any>): GSIStatus {
    if (gsiChange.kind === 'A') {
      if (gsiChange.item.kind === 'D' && gsiChange.item.lhs) {
        return GSIStatus.delete;
      }
      if (gsiChange.item.kind === 'N' && gsiChange.item.rhs) {
        return GSIStatus.add;
      }
    }
    if (gsiChange.kind === 'E' && gsiChange.lhs) {
      if (gsiChange.path.slice(-1)[0] === 'IndexName') return GSIStatus.edit;
      if (gsiChange.path.slice(-1)[0] === 'AttributeName') {
        // need to run a check to ensure this ks change is actually happening and not because the order changed.
        const innerDiffs = this.getInnerDiffs(gsiChange);
        const pathToGSI = gsiChange.path.slice(0, 7);
        const gsiIndexName = _.get(this.currentState, pathToGSI).IndexName;
        for (const innerDiff of innerDiffs) {
          if (innerDiff.kind === 'E' && innerDiff.path.slice(-1)[0] === 'AttributeName' && innerDiff.path[0] === gsiIndexName) {
            return GSIStatus.edit;
          }
        }
      }
    }
    if (gsiChange.kind === 'N' && gsiChange.rhs.length > 1) {
      return GSIStatus.batchAdd;
    }
    if (gsiChange.kind === 'D' && gsiChange.lhs.length > 1) {
      return GSIStatus.batchDelete;
    }
    return GSIStatus.none;
  }

  createDiffs(): DiffChanges<DiffableProject> {
    // run sanity checks to determine if iterative changes are required
    const cloudBuildDirExists = fs.existsSync(this.cloudBuildDir);
    const buildDirExists = fs.existsSync(this.buildDir);
    if (cloudBuildDirExists && buildDirExists) {
      this.currentState = loadDiffableProject(this.cloudBuildDir, this.rootStackFileName);
      this.nextState = loadDiffableProject(this.buildDir, this.rootStackFileName);
      return getDiffs(this.currentState, this.nextState);
    }
    throw Error('Need CloudBuild and Local Build to exist to find diffs');
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

  getTable(gsiChange: Diff<any, any>, state: 'current' | 'next'): DynamoDB.Table {
    if (state === 'current') {
      return this.currentState.stacks[gsiChange.path[1]].Resources[gsiChange.path[3]] as DynamoDB.Table;
    }
    return this.nextState.stacks[gsiChange.path[1]].Resources[gsiChange.path[3]] as DynamoDB.Table;
  }

  getStack(stackName: string, state: 'current' | 'next'): Template {
    if (state === 'current') {
      return this.currentState.stacks[stackName];
    }
    return this.nextState.stacks[stackName];
  }

  private getInnerDiffs(gsiChange: Diff<any, any>) {
    const pathToGSIs = gsiChange.path.slice(0, 6);
    const oldIndexes = _.get(this.currentState, pathToGSIs);
    const newIndexes = _.get(this.nextState, pathToGSIs);
    const oldIndexesDiffable = _.keyBy(oldIndexes, 'IndexName');
    const newIndexesDiffable = _.keyBy(newIndexes, 'IndexName');
    return getDiffs(oldIndexesDiffable, newIndexesDiffable) || [];
  }
  /**
   * GSI Operations
   */
  private getGSIRecord(indexName: string, table: DynamoDB.Table): GSIRecord {
    const gsis = table.Properties.GlobalSecondaryIndexes as GlobalSecondaryIndex[];
    const addedGSI = (_.filter(gsis, {
      IndexName: indexName,
    }) as GlobalSecondaryIndex[])[0];
    const attrDefs = ((addedGSI.KeySchema as any) as AttributeDefinition[]).reduce((acc, attr) => {
      acc.push(attr.AttributeName);
      return acc;
    }, []);
    const attrDef = _.filter(table.Properties.AttributeDefinitions as AttributeDefinition[], defs => {
      return attrDefs.includes(defs.AttributeName);
    });
    return { gsi: addedGSI, attributeDefinition: attrDef };
  }

  private addGSI(gsiRecord: GSIRecord, tableName: string, template: Template): void {
    const table = template.Resources[tableName];
    const gsis = table.Properties.GlobalSecondaryIndexes as GlobalSecondaryIndex[];
    gsis.push(gsiRecord.gsi);
    const attrDefs = table.Properties.AttributeDefinitions as AttributeDefinition[];
    attrDefs.concat(gsiRecord.attributeDefinition);
  }

  private deleteGSI(indexName: string, tableName: string, template: Template): void {
    const table = template.Resources[tableName];
    const gsis = table.Properties.GlobalSecondaryIndexes as GlobalSecondaryIndex[];
    const attrDefs = table.Properties.AttributeDefinitions as AttributeDefinition[];
    const removedGSIKS = _.remove(gsis, { IndexName: indexName })[0].KeySchema as Array<KeySchema>;
    const currentKS = gsis.reduce((acc, gsi) => {
      acc.push(...(gsi.KeySchema as Array<KeySchema>));
      return acc;
    }, []);
    // values in removedGSIKS that is not existent in currentKS will be removed
    const attrToRemove = _.differenceBy(removedGSIKS, currentKS, 'AttributeName');
    _.pullAllBy(attrDefs, attrToRemove, 'AttributeName');
  }
}
