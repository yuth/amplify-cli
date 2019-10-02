import { initProjectWithProfile, deleteProject, amplifyPush } from '../../src/init';

import {
  createNewProjectDir,
  deleteProjectDir,
  createTestMetaFile,
  getUITestConfig,
} from '../../src/utils';
import { addAuthWithDefault } from '../../src/categories/auth';
import { existsAWSExportsPath, copyAWSExportsToProj } from '../../src/utils/projectMeta';
import {
  runCypressTest,
  startServer,
  closeServer,
  gitCloneSampleApp,
  buildApp,
  signUpNewUser,
  setupCypress,
} from '../../src/utils/command';
import { join } from 'path';

describe('Auth tests in Javascript SDK:', () => {
  let projRoot: string;
  let destRoot: string;
  const { Auth, gitRepo } = getUITestConfig();
  const AUTH_PORT_NUMBER: string = Auth.port;
  const JS_SAMPLE_APP_REPO: string = gitRepo;

  const { apps } = Auth.simpleAuth;
  let settings = {};

  beforeAll(async () => {
    projRoot = createNewProjectDir(); // create a new project for each test
    console.log("Created the project root ===> ", projRoot);
    jest.setTimeout(1000 * 60 * 60); // 1 hour timeout as pushing might be slow
    await gitCloneSampleApp(projRoot, { repo: JS_SAMPLE_APP_REPO });
    console.log("Cloned the sample app from ==>", JS_SAMPLE_APP_REPO);
    destRoot = projRoot + '/amplify-js-samples-staging';
    console.log("Start setup cypress in path => ", destRoot);
    await setupCypress(destRoot);
    console.log("Done setup cypress");
    console.log('setting the destination root folder to ==>', destRoot);

    // provision
    await initProjectWithProfile(projRoot, {}, true);
    console.log('intialized amplify project');
    await addAuthWithDefault(projRoot, {}, true);
    console.log('added auth');
    await amplifyPush(projRoot, true); // Push it to the cloud
    console.log("pushed the changes to the cloud");
  });

  afterAll(async () => {
    await deleteProject(projRoot, true, true); // delete the project from the cloud
    deleteProjectDir(projRoot); // delete the project directory
  });

  it('should set up amplify backend and generate aws-export.js file', async () => {
    expect(existsAWSExportsPath(projRoot, 'js')).toBeTruthy();
  });

  it('should have user pool in backend and sign up a user for test', async () => {
    settings = await signUpNewUser(projRoot);
  });

  describe('Run UI tests on JS app', () => {
    let appPort = AUTH_PORT_NUMBER;
    afterEach(async () => {
      closeServer({ port: appPort });
    });

    it.each([apps])('should pass all UI tests on app <%o.name + >', async app => {
      const appRoot = join(destRoot, app.path);
      appPort = app.port ? app.port : AUTH_PORT_NUMBER;
      copyAWSExportsToProj(projRoot, appRoot);
      await createTestMetaFile(destRoot, {
        ...settings,
        port: appPort,
        name: app.name,
        testFiles: app.testFiles,
      });
      await buildApp(appRoot);
      await startServer(appRoot, { port: appPort });
      await runCypressTest(destRoot).then(isPassed => expect(isPassed).toBeTruthy());
    });
  });
});
