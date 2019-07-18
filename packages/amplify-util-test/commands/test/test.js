module.exports = {
  name: 'test',
  run: async function(context) {
    if (context.parameters.options.help) {
      const header = `amplify ${this.name} [subcommand]\nDescriptions:
      Test resources locally`

      const commands = [
        {
          name: 'storage',
          description: 'Run Storage test server',         
        }
      ];
      context.amplify.showHelp(header, commands);
      return;
    }
  }
}