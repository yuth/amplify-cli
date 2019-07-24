const Ora = require('ora');
const path = require('path');
const loadConfig = require('../codegen-config');
const constants = require('../constants');
const generateStatements = require('./statements');
const generateTypes = require('./types');
const {
  AmplifyCodeGenNoAppSyncAPIAvailableError: NoAppSyncAPIAvailableError,
  AmplifyCodeGenAPINotFoundError,
} = require('../errors');
const {
  downloadIntrospectionSchemaWithProgress,
  getAppSyncAPIDetails,
  getAppSyncAPIInfo,
  getProjectAwsRegion,
  updateAmplifyMeta,
} = require('../utils');
const addWalkThrough = require('../walkthrough/add');
const changeAppSyncRegion = require('../walkthrough/changeAppSyncRegions');

async function add(context, apiId = null) {
  let region = getProjectAwsRegion(context);
  const config = loadConfig(context);
  if (config.getProjects().length) {
    throw new Error(constants.ERROR_CODEGEN_SUPPORT_MAX_ONE_API);
  }
  let apiDetails;
  if (!apiId) {
    const availableAppSyncApis = getAppSyncAPIDetails(context); // published and un-published
    if (availableAppSyncApis.length === 0) {
      throw new NoAppSyncAPIAvailableError(constants.ERROR_CODEGEN_NO_API_AVAILABLE);
    }
    [apiDetails] = availableAppSyncApis;
    apiDetails.isLocal = true;
  } else {
    let shouldRetry = true;
    while (shouldRetry) {
      const apiDetailSpinner = new Ora();
      try {
        apiDetailSpinner.start('Getting API details');
        apiDetails = await getAppSyncAPIInfo(context, apiId, region);
        apiDetailSpinner.succeed();
        await updateAmplifyMeta(context, apiDetails);
        break;
      } catch (e) {
        apiDetailSpinner.fail();
        if (e instanceof AmplifyCodeGenAPINotFoundError) {
          context.print.info(`AppSync API was not found in region ${region}`);
          ({ shouldRetry, region } = await changeAppSyncRegion(context, region));
        } else {
          throw e;
        }
      }
    }
  }

  if (!apiDetails) {
    return;
  }
  const answer = await addWalkThrough(context);

  let schema;
  if (!apiDetails.isLocal) {
    schema = await downloadIntrospectionSchemaWithProgress(
      context,
      apiDetails.id,
      answer.schemaLocation,
      region,
    );
  } else {
    schema = path.join('amplify', 'backend', 'api', apiDetails.name, 'build', 'schema.graphql');
  }

  const newProject = {
    projectName: apiDetails.name,
    includes: answer.includePattern,
    excludes: answer.excludePattern,
    schema,
    amplifyExtension: {
      codeGenTarget: answer.target || '',
      generatedFileName: answer.generatedFileName || '',
      docsFilePath: answer.docsFilePath,
      region,
    },
  };

  if (answer.maxDepth) {
    newProject.amplifyExtension.maxDepth = answer.maxDepth;
  }
  config.addProject(newProject);
  if (answer.shouldGenerateDocs) {
    await generateStatements(context, false);
  }
  if (answer.shouldGenerateCode) {
    await generateTypes(context, false);
  }
  config.save();
}

module.exports = add;
