import { CloudFormation } from 'aws-sdk';
import path from 'path';
import fs from 'fs-extra';
import _ from 'lodash';
import { diff as getDiffs, Diff } from 'deep-diff';
import { DiffableProject, loadDiffableProject, GSIStatus, GSIRecord, TemplateState } from '../utils/amplify-resource-state-utils';
import { sanityCheck } from 'graphql-transformer-core';
import { Template, DynamoDB } from 'cloudform-types';
import { GlobalSecondaryIndex, KeySchema, AttributeDefinition } from 'cloudform-types/types/dynamoDb/table';
import { $TSContext, JSONUtilities } from 'amplify-cli-core';
import configurationManager from '../configuration-manager';
import { DeploymentStep } from '../iterative-deployment/state-machine';
import { hashDirectory, ROOT_APPSYNC_S3_KEY } from '../upload-appsync-files';
/**
 * Rules
 */
type DiffChanges<T> = Array<Diff<DiffableProject, DiffableProject>>;

export type GQLResourceManagerProps = {
  cfnClient: CloudFormation;
  resourceMeta: $ResourceMeta;
  backendDir: string;
  cloudBackendDir: string;
  iterativeChangeEnabled?: boolean;
  rootStackFileName?: string;
};

export type $ResourceMeta = {
  category: string;
  providerPlugin: string;
  resourceName: string;
  service: string
  output: any;
  providerMetadata: {
    s3TemplateURL: string;
    logicalId: string;
  };
  stackId: string,
  DeploymentBucketName: string
  [key: string]: any;
}

export class GraphQLResourceManager {
  static serviceName: string = 'AppSync';
  static categoryName: string = 'api';
  cfnClient: CloudFormation;
  resourceName: string;
  resourceMeta: $ResourceMeta;
  rootStackFileName: string;
  cloudBuildDir: string;
  buildDir: string;
  backendDir: string;
  currentState: DiffableProject;
  nextState: DiffableProject;
  templateState: TemplateState;
  iterativeChangeEnabled: boolean;
  diffs: DiffChanges<DiffableProject>;
  tableArnMap: Map<string, string>;

  public static createInstance = async (
    context: $TSContext,
    StackId: string,
    iterativeChangeEnabled: boolean = true,
  ) => {

    const getResource = (resourceStatus: any): any => {
      const { resourcesToBeUpdated } = resourceStatus;
      let resources = resourcesToBeUpdated;
      if (resources.length > 0) {
        const resource = resources[0];
        if (resource.providerPlugin !== 'awscloudformation') {
          return;
        }
        return resource;
      } else {
        // No resource to update/add
        return null;
      }
    }
    try {
      const cred = await configurationManager.loadConfiguration(context);
      const cfn = new CloudFormation(cred);
      const resourceStatus = await context.amplify.getResourceStatus(GraphQLResourceManager.categoryName);
      const resourceMeta = getResource(resourceStatus);
      const apiStack = await cfn.describeStackResources({ StackName: StackId, LogicalResourceId: resourceMeta.providerMetadata.logicalId }).promise();
      return new GraphQLResourceManager({
        cfnClient: cfn,
        resourceMeta: { ...getResource(resourceStatus), stackId: apiStack.StackResources[0].PhysicalResourceId },
        backendDir: context.amplify.pathManager.getBackendDirPath(),
        cloudBackendDir: context.amplify.pathManager.getCurrentCloudBackendDirPath(),
        iterativeChangeEnabled,
        rootStackFileName: 'cloudformation-template.json'
      });
    } catch (err) {
      throw err;
    }
  }

  constructor(props: GQLResourceManagerProps) {
    if (!props.resourceMeta) {
      throw Error('No GraphQL API enabled.');
    }
    this.cfnClient = props.cfnClient;
    this.resourceMeta = props.resourceMeta;
    this.cloudBuildDir = path.join(props.cloudBackendDir, GraphQLResourceManager.categoryName, this.resourceMeta.resourceName, 'build');
    this.backendDir = path.join(props.backendDir, GraphQLResourceManager.categoryName, this.resourceMeta.resourceName);
    this.buildDir = path.join(this.backendDir, 'build');
    this.rootStackFileName = props.rootStackFileName;
    this.iterativeChangeEnabled = props.iterativeChangeEnabled;
    this.templateState = new TemplateState();
    this.tableArnMap = new Map<string, string>();
    this.diffs = this.createDiffs();
  }

  run = async (): Promise<DeploymentStep[]> => {
    // run sanity checks
    let needsIterativeDeployments = false;
    try {
      sanityCheck(this.diffs, this.currentState, this.nextState);
    } catch (err) {
      if (err.name === 'InvalidGSIMigrationError' && this.iterativeChangeEnabled) {
        needsIterativeDeployments = true;
      } else {
        throw err;
      }
    }
    if (needsIterativeDeployments) {
      this.gsiManagement();
      await this.getTableARNS();
      return await this.getDeploymentSteps();
    }
  }
  // save states to build with a copy of build on every deploy
  private getDeploymentSteps = async (): Promise<DeploymentStep[]> => {
    let count = 0;
    const gqlSteps = new Array<DeploymentStep>();
    const stateFileDir = path.join(this.cloudBuildDir, 'states');
    const parameters = await this.getParameters();
    const buildHash = await hashDirectory(this.backendDir);
    fs.mkdirSync(stateFileDir);
    while (!this.templateState.isEmpty()) {
      fs.copySync(this.buildDir, path.join(stateFileDir, `${count}`));
      const tables = this.templateState.getKeys();
      const tableArns = [];
      tables.forEach(key => {
        tableArns.push(this.tableArnMap.get(key));
        const filepath = path.join(stateFileDir, `${count}`, 'stacks', `${key}.json`);
        fs.writeFileSync(filepath, JSON.stringify(this.templateState.pop(key), null, 2));
      });
      gqlSteps.push({
        stackTemplatePath: this.resourceMeta.providerMetadata.s3TemplateURL,
        parameters: { ...parameters, S3DeploymentRootKey: `${ROOT_APPSYNC_S3_KEY}/${buildHash}/states/${count}`},
        stackName: this.resourceMeta.stackId,
        tableNames: tableArns,
      })
      count++;
    }
    fs.moveSync(stateFileDir, path.join(this.buildDir, 'states'));
    return gqlSteps;
  }

  private getTableARNS = async () => {
    const tables = this.templateState.getKeys();
    const apiResources = await this.cfnClient.describeStackResources({
      StackName: this.resourceMeta.stackId,
    }).promise();
    for (const resource of apiResources.StackResources) {
      if(tables.includes(resource.LogicalResourceId)) {
        const tableStack = await this.cfnClient.describeStacks({
          StackName: resource.PhysicalResourceId
        }).promise();
        const tableARN = tableStack.Stacks[0].Outputs.reduce( (acc, out) => {
          if (out.OutputKey === `GetAtt${resource.LogicalResourceId}TableName`) {
            acc.push(out.OutputValue);
          }
          return acc;
        }, []);
        this.tableArnMap.set(resource.LogicalResourceId, tableARN[0]);
      }
    }
  }

  private getParameters = async (): Promise<any> => {
    const apiStackInfo = await this.cfnClient.describeStacks({
      StackName: this.resourceMeta.stackId,
    }).promise();
    return apiStackInfo.Stacks[0].Parameters;
  }

  private gsiManagement = () => {
    const gsiChanges = _.filter(this.diffs, diff => {
      return _.includes(diff.path, 'GlobalSecondaryIndexes');
    });
    // we need to make sure that the gsi changes are greater than 1 otherwise we can do this in one push
    for (const gsiChange of gsiChanges) {
      const tableName = gsiChange.path[3];
      const stackName = gsiChange.path[1].split('.')[0];
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

  private gsiChangeStatus = (gsiChange: Diff<any, any>): GSIStatus => {
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

  private createDiffs = (): DiffChanges<DiffableProject> => {
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

  private getTable = (gsiChange: Diff<any, any>, state: 'current' | 'next'): DynamoDB.Table => {
    if (state === 'current') {
      return this.currentState.stacks[gsiChange.path[1]].Resources[gsiChange.path[3]] as DynamoDB.Table;
    }
    return this.nextState.stacks[gsiChange.path[1]].Resources[gsiChange.path[3]] as DynamoDB.Table;
  }

  private getStack(stackName: string, state: 'current' | 'next'): Template {
    if (state === 'current') {
      return this.currentState.stacks[`${stackName}.json`];
    }
    return this.nextState.stacks[`${stackName}.json`];
  }

  private getInnerDiffs = (gsiChange: Diff<any, any>) => {
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
  private getGSIRecord = (indexName: string, table: DynamoDB.Table): GSIRecord => {
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

  private addGSI = (gsiRecord: GSIRecord, tableName: string, template: Template): void => {
    const table = template.Resources[tableName];
    const gsis = table.Properties.GlobalSecondaryIndexes as GlobalSecondaryIndex[];
    gsis.push(gsiRecord.gsi);
    const attrDefs = table.Properties.AttributeDefinitions as AttributeDefinition[];
    table.Properties.AttributeDefinitions = _.unionBy(attrDefs, gsiRecord.attributeDefinition, 'AttributeName');
  }

  private deleteGSI = (indexName: string, tableName: string, template: Template): void => {
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
