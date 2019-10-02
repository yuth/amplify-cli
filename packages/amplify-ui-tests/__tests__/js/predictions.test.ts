import {
  getUITestConfig,
  createNewProjectDir,
  deleteProjectDir,
  createTestMetaFile,
} from '../../src/utils';
import {
  gitCloneSampleApp,
  setupCypress,
  signUpNewUser,
  closeServer,
  buildApp,
  startServer,
  runCypressTest,
} from '../../src/utils/command';
import { deleteProject, initProjectWithProfile, amplifyPush } from '../../src/init';
import { addAuthWithDefault } from '../../src/categories/auth';
import { addIdentityText, addConvertWithDefault } from '../../src/categories/predictions';
import { existsAWSExportsPath, copyAWSExportsToProj } from '../../src/utils/projectMeta';
import { join } from 'path';

describe('Prediction tests in JavaScript SDK:', () => {
  let projRoot: string;
  let destRoot: string;
  const { Predictions, gitRepo } = getUITestConfig();
  const PREDICT_PORT_NUMBER: string = Predictions.port;
  const JS_SAMPLE_APP_REPO: string = process.env.AMPLIFY_JS_SAMPLES_STAGING_URL
    ? process.env.AMPLIFY_JS_SAMPLES_STAGING_URL
    : gitRepo;

  const { apps } = Predictions.simplePredictions;
  let settings = {};

  beforeAll(async () => {
    projRoot = createNewProjectDir();
    jest.setTimeout(1000 * 60 * 60); // 1 hour
    await gitCloneSampleApp(projRoot, { repo: JS_SAMPLE_APP_REPO });
    destRoot = projRoot + '/amplify-js-samples-staging';
    await setupCypress(destRoot);

    // provision resources in the cloud
    await initProjectWithProfile(projRoot, {}, true);
    await addAuthWithDefault(projRoot, {}, true); // should add auth before add predictions
    await addIdentityText(projRoot, {}, true);
    await addConvertWithDefault(projRoot, {}, true);
    await amplifyPush(projRoot, true);
    console.log('Pushed the project to cloud!!!!');
  });

  afterAll(async () => {
    console.log('\n\n\n\n Start deleting project \n\n\n\n\n');
    await deleteProject(projRoot, true, true);
    console.log('\n\n\n\n End deleting project \n\n\n\n\n');
    deleteProjectDir(projRoot);
  });

  it('should set up amplify backend and generate aws-export.js file', async () => {
    console.log(
      '\n\n\n\n\nexistsAWSExportsPath =>',
      existsAWSExportsPath(projRoot, 'js'),
      '\n\n\n\n'
    );
    expect(existsAWSExportsPath(projRoot, 'js')).toBeTruthy();
  });

  it('should have user pool in backend and sign up a user for test', async () => {
    console.log('\n\n\n\n Start Singing up the user \n\n\n\n\n');
    settings = await signUpNewUser(projRoot);
    console.log('\n\n\n\n end Singing up the user \n\n\n\n\n');
  });

  it.each([apps])(`should pass all UI tests on app <%o.name}>`, async app => {
    console.log('Running ');
    let appPort = PREDICT_PORT_NUMBER;
    try {
      const appRoot = join(destRoot, app.path);
      appPort = app.port ? app.port : PREDICT_PORT_NUMBER;
      console.log('\n\n\n\nStart copying aws-export.js ', `${projRoot} ===> ${appRoot}`, '\n\n\n');
      copyAWSExportsToProj(projRoot, appRoot);
      console.log('\n\n\nEnd copying aws-export.js ', `${projRoot} ===> ${appRoot}`, '\n\n\n');
      console.log(
        `create Meta file  => ${JSON.stringify({
          ...settings,
          port: appPort,
          name: app.name,
          testFiles: app.testFiles,
        })}`
      );
      await createTestMetaFile(destRoot, {
        ...settings,
        port: appPort,
        name: app.name,
        testFiles: app.testFiles,
      });
      console.log('Finished creating meta file', '\n\n\n');
      await buildApp(appRoot);
      console.log('\n\n\nfinished buildApp', '\n\n\n');
      console.log('Starting server', '\n\n\n');
      await startServer(appRoot, { port: appPort });
      console.log('started server', '\n\n\n');
      await runCypressTest(destRoot).then(isPassed => expect(isPassed).toBeTruthy());
    } finally {
      closeServer({ port: appPort });
    }
  });
});
