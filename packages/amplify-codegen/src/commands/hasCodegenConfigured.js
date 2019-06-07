const loadConfig = require('../codegen-config');


async function hasCodegenConfigured(context) {
  const config = loadConfig(context);
  const projects = config.getProjects();

  return (projects.length > 0);


}

module.exports = hasCodegenConfigured;
