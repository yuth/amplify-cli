import * as aws from 'aws-sdk';
import assert from 'assert';
import throttle from 'lodash.throttle';
import { createDeploymentMachine, DeploymentStep, StackParameter, StateMachineHelperFunctions } from './state-machine';
import { interpret } from 'xstate';
import { IStackProgressPrinter, StackEventMonitor } from './stack-event-monitor';
import { StackProgressPrinter } from './stack-progress-printer';
import ora from 'ora';
import configurationManager from '../configuration-manager';
import { $TSContext } from 'amplify-cli-core';
import { ConfigurationOptions } from 'aws-sdk/lib/config-base';

interface DeploymentManagerOptions {
  throttleDelay?: number;
  eventPollingDelay?: number;
}
export class DeploymentManager {
  /**
   * Helper method to get an instance of the Deployment manager with the right credentials
   */

  public static createInstance = async (
    context: $TSContext,
    deploymentBucket: string,
    printer?: IStackProgressPrinter,
    options?: DeploymentManagerOptions,
  ) => {
    try {
      const cred = await configurationManager.loadConfiguration(context);
      assert(cred.region);
      return new DeploymentManager(cred, cred.region, deploymentBucket, printer, options);
    } catch (e) {
      throw new Error('Could not load the credentials');
    }
  };

  private deployment: DeploymentStep[] = [];
  private options: Required<DeploymentManagerOptions>;
  private cfnClient: aws.CloudFormation;
  private s3Client: aws.S3;
  private constructor(
    creds: ConfigurationOptions,
    private region: string,
    private deploymentBucket: string,
    // private deployedTemplatePath: string,
    private printer: IStackProgressPrinter = new StackProgressPrinter(),
    options: DeploymentManagerOptions = {},
  ) {
    this.options = {
      throttleDelay: 1_000,
      eventPollingDelay: 1_000,
      ...options,
    };
    this.s3Client = new aws.S3(creds);
    this.cfnClient = new aws.CloudFormation(creds);
  }

  public deploy = async (): Promise<void> => {
    // try {
    //   await this.s3Client
    //     .headObject({
    //       Bucket: this.deploymentBucket,
    //       Key: this.deployedTemplatePath,
    //     })
    //     .promise();
    // } catch (e) {
    //   if (e.code === 404) {
    //     throw new Error(`The deployed template s3://${this.deploymentBucket}/${this.deployedTemplatePath} does not exist`);
    //   }
    // }

    // sanity check before deployment
    await Promise.all(this.deployment.map(d => this.ensureTemplateExists(d.stackTemplatePath)));

    const fns: StateMachineHelperFunctions = {
      deployFn: this.doDeploy,
      deploymentWaitFn: this.waitForDeployment,
      rollbackFn: this.rollBackStack,
      tableReadyWaitFn: this.waitForIndices,
      rollbackWaitFn: this.waitForDeployment,
      stackEventPollFn: this.stackPollFn,
    };
    const machine = createDeploymentMachine(
      {
        currentIndex: -1,
        deploymentBucket: this.deploymentBucket,
        region: this.region,
        stacks: this.deployment,
      },
      fns,
    );

    let maxDeployed = 0;
    return new Promise((resolve, reject) => {
      const spinner = ora('Deploying');
      const service = interpret(machine)
        .onTransition(state => {
          if (state.changed) {
            maxDeployed = Math.max(maxDeployed, state.context.currentIndex + 1);
            if (state.matches('idle')) {
              spinner.text = `Starting deployment`;
            } else if (state.matches('deploy')) {
              spinner.text = `Deploying stack (${maxDeployed} of ${state.context.stacks.length})`;
            } else if (state.matches('rollback')) {
              spinner.text = `Rolling back (${maxDeployed - state.context.currentIndex} of ${maxDeployed})`;
            } else if (state.matches('deployed')) {
              spinner.succeed(`Deployed`);
            }
          }

          switch (state.value) {
            case 'deployed':
              return resolve();
            case 'rolledBack':
            case 'failed':
              spinner.fail(`Failed to deploy`);
              return reject(new Error('Deployment failed'));
            default:
            // intentionally left blank as we don't care about intermediate states
          }
        })
        .start();
      spinner.start();
      service.send({ type: 'DEPLOY' });
    });
  };

  public addStep = (deploymentStep: DeploymentStep): void => {
    this.deployment.push(deploymentStep);
  };

  public setPrinter = (printer: IStackProgressPrinter) => {
    this.printer = printer;
  };

  /**
   * Ensure that the stack is present and can be deployed
   * @param stackName name of the stack
   */
  private ensureStack = async (stackName: string): Promise<boolean> => {
    const result = await this.cfnClient.describeStacks({ StackName: stackName }).promise();
    return result.Stacks[0].StackStatus.endsWith('_COMPLETE');
  };

  /**
   * Checks the file exists in the path
   * @param path path of the cloudformation file
   */
  private ensureTemplateExists = async (path: string): Promise<boolean> => {
    let key = path;
    try {
      const bucketKey = this.getBucketKey(this.deploymentBucket, path);
      await this.s3Client.headObject({ Bucket: this.deploymentBucket, Key: bucketKey }).promise();
      return true;
    } catch (e) {
      if (e.ccode === 'NotFound') {
        throw new Error(`The cloudformation template ${path} was not found in deployment bucket ${this.deploymentBucket}`);
      }
      throw e;
    }
  };

  private getTableStatus = async (tableName: string, region: string): Promise<boolean> => {
    assert(tableName, 'table name should be passed');
    const dbClient = new aws.DynamoDB({ region });
    try {
      const response = await dbClient.describeTable({ TableName: tableName }).promise();
      const gsis = response.Table?.GlobalSecondaryIndexes;
      return gsis ? gsis.every(idx => idx.IndexStatus === 'ACTIVE') : true;
    } catch (e) {
      throw e;
    }
  };

  private waitForIndices = async (stackParams: StackParameter) => {
    if (stackParams.tableNames.length) console.log('\nWaiting for DynamoDB table indices to be ready');
    const throttledGetTableStatus = throttle(this.getTableStatus, this.options.throttleDelay);

    const waiters = stackParams.tableNames.map(name => {
      return new Promise(resolve => {
        let interval = setInterval(async () => {
          const areIndexesReady = await throttledGetTableStatus(name, this.region);
          if (areIndexesReady) {
            clearInterval(interval);
            resolve(undefined);
          }
        }, this.options.throttleDelay);
      });
    });

    try {
      await Promise.all(waiters);
      return Promise.resolve();
    } catch {
      Promise.reject();
    }
  };

  private stackPollFn = (deploymentStep: DeploymentStep): (() => void) => {
    let monitor: StackEventMonitor;
    assert(deploymentStep.stackName, 'stack name should be passed to stackPollFn');
    if (this.printer) {
      monitor = new StackEventMonitor(this.cfnClient, deploymentStep.stackName, this.printer);
      monitor.start();
    }
    return () => {
      if (monitor) {
        monitor.stop();
      }
    };
  };

  private doDeploy = async (currentStack: {
    stackName: string;
    parameters: Record<string, string>;
    stackTemplateUrl: string;
    region: string;
    capabilities?: string[];
  }): Promise<void> => {
    const cfn = this.cfnClient;
    assert(currentStack.stackName, 'stack name should be passed to doDeploy');
    assert(currentStack.stackTemplateUrl, 'stackTemplateUrl must be passed to doDeploy');
    await this.ensureStack(currentStack.stackName);
    const parameters = Object.entries(currentStack.parameters).map(([key, val]) => {
      return {
        ParameterKey: key,
        ParameterValue: val.toString(),
      };
    });
    try {
      await cfn
        .updateStack({
          StackName: currentStack.stackName,
          Parameters: parameters,
          TemplateURL: currentStack.stackTemplateUrl,
          Capabilities: currentStack.capabilities,
        })
        .promise();
    } catch (e) {
      return Promise.reject();
    }
  };

  private waitForDeployment = async (stackParams: StackParameter): Promise<void> => {
    const cfnClient = this.cfnClient;
    assert(stackParams.stackName, 'stackName should be passed to waitForDeployment');
    try {
      await cfnClient
        .waitFor('stackUpdateComplete', {
          StackName: stackParams.stackName,
        })
        .promise();
      return Promise.resolve();
    } catch (e) {
      return Promise.reject();
    }
  };

  private rollBackStack = async (currentStack: Readonly<StackParameter>): Promise<void> => {
    await this.doDeploy(currentStack);
  };

  private getBucketKey = (bucketName: string, bucketPath: string): string => {
    if (bucketPath.startsWith('https://') && bucketPath.includes(bucketName)) {
      return bucketPath.substring(bucketPath.indexOf(bucketName) + bucketName.length + 1);
    }
    return bucketPath;
  };
}
