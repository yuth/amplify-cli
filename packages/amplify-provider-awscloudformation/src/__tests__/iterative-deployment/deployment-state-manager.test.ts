import { DeploymentStatus, DeploymentStepStatus, IDeploymentStateManager } from 'amplify-cli-core';
import { DeploymentStateManager } from '../../iterative-deployment/deployment-state-manager';
import { S3 } from '../../aws-utils/aws-s3';

describe('deployment state manager', () => {
  let deploymentStateManager: IDeploymentStateManager;

  let s3Files: Record<string, string> = {};
  let simulate404: boolean = false;

  const mockContext: any = {
    amplify: {
      getProjectDetails: () => ({
        amplifyMeta: {
          providers: {
            awscloudformation: {
              DeploymentBucketName: 'bucket',
            },
          },
        },
      }),
      getEnvInfo: () => ({
        envName: 'dev',
      }),
    },
  };

  beforeEach(async () => {
    const getInstanceSpy = jest.spyOn(S3, 'getInstance');

    getInstanceSpy.mockReturnValue(
      new Promise((resolve, _) => {
        resolve(({
          uploadFile: async (s3Params: any, showSpinner: boolean): Promise<string> => {
            return new Promise((resolve, _) => {
              s3Files[s3Params.Key] = s3Params.Body;

              resolve('');
            });
          },
          getStringObjectFromBucket: async (bucketName: string, objectKey: string): Promise<string> => {
            return new Promise((resolve, _) => {
              if (simulate404) {
                resolve(undefined);
              }

              resolve(s3Files[objectKey]);
            });
          },
        } as unknown) as S3);
      }),
    );

    deploymentStateManager = await DeploymentStateManager.createDeploymentStateManager(mockContext);
  });

  afterEach(async () => {
    s3Files = {};
    simulate404 = false;
  });

  it('deployment in progress reflected correctly', async () => {
    let isInProgress = await deploymentStateManager.isDeploymentInProgress();
    expect(isInProgress).toBe(false);

    const started = await deploymentStateManager.startDeployment([
      {
        status: DeploymentStepStatus.WAITING_FOR_DEPLOYMENT,
      },
    ]);

    expect(started).toBe(true);

    isInProgress = await deploymentStateManager.isDeploymentInProgress();
    expect(isInProgress).toBe(true);

    await deploymentStateManager.updateCurrentStepStatus(DeploymentStepStatus.DEPLOYED);
    await deploymentStateManager.finishDeployment(DeploymentStatus.DEPLOYED);

    isInProgress = await deploymentStateManager.isDeploymentInProgress();
    expect(isInProgress).toBe(false);
  });

  it('second start fails if deployment is in progress', async () => {
    let started = await deploymentStateManager.startDeployment([
      {
        status: DeploymentStepStatus.WAITING_FOR_DEPLOYMENT,
      },
    ]);

    expect(started).toBe(true);

    started = await deploymentStateManager.startDeployment([
      {
        status: DeploymentStepStatus.WAITING_FOR_DEPLOYMENT,
      },
    ]);

    expect(started).toBe(false);
  });

  it('second start uses state from cloud', async () => {
    let started = await deploymentStateManager.startDeployment([
      {
        status: DeploymentStepStatus.WAITING_FOR_DEPLOYMENT,
      },
    ]);

    await deploymentStateManager.finishDeployment(DeploymentStatus.DEPLOYED);

    started = await deploymentStateManager.startDeployment([
      {
        status: DeploymentStepStatus.WAITING_FOR_DEPLOYMENT,
      },
    ]);

    expect(started).toBe(true);
  });

  it('no deployment in progress when a deployment already finished previously present', async () => {
    let isInProgress = await deploymentStateManager.isDeploymentInProgress();

    expect(isInProgress).toBe(false);
  });

  it('multi step deployment succeeds', async () => {
    const started = await deploymentStateManager.startDeployment([
      {
        status: DeploymentStepStatus.WAITING_FOR_DEPLOYMENT,
      },
      {
        status: DeploymentStepStatus.WAITING_FOR_DEPLOYMENT,
      },
      {
        status: DeploymentStepStatus.WAITING_FOR_DEPLOYMENT,
      },
    ]);

    expect(started).toBe(true);

    await deploymentStateManager.updateCurrentStepStatus(DeploymentStepStatus.DEPLOYED);
    await deploymentStateManager.advanceStep();

    await deploymentStateManager.updateCurrentStepStatus(DeploymentStepStatus.DEPLOYED);
    await deploymentStateManager.advanceStep();

    await deploymentStateManager.updateCurrentStepStatus(DeploymentStepStatus.DEPLOYED);

    const finished = await deploymentStateManager.finishDeployment(DeploymentStatus.DEPLOYED);

    expect(finished).toBe(true);

    const currentCloudState = await DeploymentStateManager.getStatusFromCloud(mockContext);

    expect(currentCloudState.status).toBe(DeploymentStatus.DEPLOYED);
    expect(currentCloudState.steps.filter(s => s.status === DeploymentStepStatus.DEPLOYED).length).toBe(3);

    const currentStatus = await deploymentStateManager.getStatus();
    const cloudStatus = await DeploymentStateManager.getStatusFromCloud(mockContext);

    expect(currentStatus).toMatchObject(cloudStatus);
  });

  it('multi step deployment with rollback succeeds', async () => {
    const started = await deploymentStateManager.startDeployment([
      {
        status: DeploymentStepStatus.WAITING_FOR_DEPLOYMENT,
      },
      {
        status: DeploymentStepStatus.WAITING_FOR_DEPLOYMENT,
      },
      {
        status: DeploymentStepStatus.WAITING_FOR_DEPLOYMENT,
      },
    ]);

    expect(started).toBe(true);

    await deploymentStateManager.updateCurrentStepStatus(DeploymentStepStatus.DEPLOYED);
    await deploymentStateManager.advanceStep();

    await deploymentStateManager.startRollback();

    await deploymentStateManager.updateCurrentStepStatus(DeploymentStepStatus.ROLLED_BACK);
    await deploymentStateManager.advanceStep();

    await deploymentStateManager.updateCurrentStepStatus(DeploymentStepStatus.ROLLED_BACK);

    const finished = await deploymentStateManager.finishDeployment(DeploymentStatus.ROLLED_BACK);

    expect(finished).toBe(true);

    const currentCloudState = await DeploymentStateManager.getStatusFromCloud(mockContext);

    expect(currentCloudState.status).toBe(DeploymentStatus.ROLLED_BACK);
    expect(currentCloudState.steps.filter(s => s.status === DeploymentStepStatus.WAITING_FOR_DEPLOYMENT).length).toBe(1);
    expect(currentCloudState.steps.filter(s => s.status === DeploymentStepStatus.ROLLED_BACK).length).toBe(2);

    const currentStatus = await deploymentStateManager.getStatus();
    const cloudStatus = await DeploymentStateManager.getStatusFromCloud(mockContext);

    expect(currentStatus).toMatchObject(cloudStatus);
  });

  it('advance to non-existent next step fails', async () => {
    await deploymentStateManager.startDeployment([
      {
        status: DeploymentStepStatus.WAITING_FOR_DEPLOYMENT,
      },
    ]);

    expect(deploymentStateManager.advanceStep()).rejects.toThrow('Error: No more deployment steps to advance to (index: 0, direction: 1');
  });

  it('advance to non-existent next step fails with rollback', async () => {
    await deploymentStateManager.startDeployment([
      {
        status: DeploymentStepStatus.WAITING_FOR_DEPLOYMENT,
      },
    ]);

    await deploymentStateManager.startRollback();

    expect(deploymentStateManager.getStatus().status).toBe(DeploymentStatus.ROLLING_BACK);

    expect(deploymentStateManager.advanceStep()).rejects.toThrow('Error: No more deployment steps to advance to (index: 0, direction: -1');
  });

  it('cannot finish deployment twice', async () => {
    await deploymentStateManager.startDeployment([
      {
        status: DeploymentStepStatus.WAITING_FOR_DEPLOYMENT,
      },
    ]);

    const finished = await deploymentStateManager.finishDeployment(DeploymentStatus.DEPLOYED);

    expect(finished).toBe(true);

    expect(deploymentStateManager.finishDeployment(DeploymentStatus.DEPLOYED)).rejects.toThrow(
      'Cannot finish a deployment when it was not started.',
    );
  });

  it('cannot finish rolled back deployment twice', async () => {
    await deploymentStateManager.startDeployment([
      {
        status: DeploymentStepStatus.WAITING_FOR_DEPLOYMENT,
      },
    ]);

    await deploymentStateManager.startRollback();

    const finished = await deploymentStateManager.finishDeployment(DeploymentStatus.ROLLED_BACK);

    expect(finished).toBe(true);

    expect(deploymentStateManager.finishDeployment(DeploymentStatus.DEPLOYED)).rejects.toThrow(
      'Cannot finish a deployment when it was not started.',
    );
  });

  it('can set FAILED status on in-progress deployments', async () => {
    await deploymentStateManager.startDeployment([
      {
        status: DeploymentStepStatus.WAITING_FOR_DEPLOYMENT,
      },
    ]);

    const finished = await deploymentStateManager.finishDeployment(DeploymentStatus.FAILED);

    expect(finished).toBe(true);

    const currentStatus = await deploymentStateManager.getStatus();

    expect(currentStatus.status).toBe(DeploymentStatus.FAILED);
  });

  it('cannot rollback non-started deployment', async () => {
    expect(deploymentStateManager.startRollback()).rejects.toThrow('Cannot rollback a non-deploying deployment');
  });

  it('cannot rollback an already rolled back deployment', async () => {
    await deploymentStateManager.startDeployment([
      {
        status: DeploymentStepStatus.WAITING_FOR_DEPLOYMENT,
      },
    ]);

    await deploymentStateManager.startRollback();

    expect(deploymentStateManager.startRollback()).rejects.toThrow('Cannot rollback a non-deploying deployment');
  });

  it('cannot finish by passing in invalid status', async () => {
    await deploymentStateManager.startDeployment([
      {
        status: DeploymentStepStatus.WAITING_FOR_DEPLOYMENT,
      },
    ]);

    expect(deploymentStateManager.finishDeployment(DeploymentStatus.DEPLOYING)).rejects.toThrow(
      'Invalid status DEPLOYING for finishDeployment.',
    );
    expect(deploymentStateManager.finishDeployment(DeploymentStatus.IDLE)).rejects.toThrow('Invalid status IDLE for finishDeployment.');
    expect(deploymentStateManager.finishDeployment(DeploymentStatus.ROLLING_BACK)).rejects.toThrow(
      'Invalid status ROLLING_BACK for finishDeployment.',
    );
  });
});
