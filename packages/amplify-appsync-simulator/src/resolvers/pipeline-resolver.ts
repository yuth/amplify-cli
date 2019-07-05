import {
  AmplifyAppSyncSimulator,
  AppSyncSimulatorUnitResolverConfig,
  AppSyncSimulatorEventType,
  AppSyncSimulatorPipelineResolverConfig
} from '..';

type PipelineResolverConfig = {
  requestMappingTemplateLocation: string;
  responseMappingTemplateLocation: string;
  typeName: string;
  fieldName: string;
  functions: string[];
};

export class AppSyncPipelineResolver {
  private config: PipelineResolverConfig;
  constructor(config: PipelineResolverConfig, private simulatorContext: AmplifyAppSyncSimulator) {
    try {
      simulatorContext.getMappingTemplate(config.requestMappingTemplateLocation);
      simulatorContext.getMappingTemplate(config.responseMappingTemplateLocation);
      config.functions.map(fn => simulatorContext.getFunction(fn));
    } catch (e) {
      throw new Error(`Invalid config for PIPELINE_RESOLVER ${JSON.stringify(config)}`);
    }
    const { fieldName, typeName } = config;
    if (!fieldName || !typeName) {
      throw new Error(`Invalid config for PIPELINE_RESOLVER ${JSON.stringify(config)}`);
    }
    this.config = config;
  }

  async resolve(source, args, context, info) {
    this.simulatorContext.emit(
      AppSyncSimulatorEventType.BEFORE_RESOLVE,
      this.config.fieldName,
      this.config.typeName,
      {
        source,
        args,
        context,
        info
      }
    );
    const requestMappingTemplate = this.simulatorContext.getMappingTemplate(
      this.config.requestMappingTemplateLocation
    );
    const responseMappingTemplate = this.simulatorContext.getMappingTemplate(
      this.config.responseMappingTemplateLocation
    );

    let result = {};
    let stash = {};

    ({ result, stash } = requestMappingTemplate.render(
      { source, arguments: args, stash },
      context,
      info
    ));

    await this.config.functions.reduce((chain, fn) => {
      const fnResolver = this.simulatorContext.getFunction(fn);
      const p = chain.then(async ({prevResult, stash}) => {
        ({ result:prevResult, stash } = await fnResolver.resolve(source, args, stash, prevResult, context, info));
        return Promise.resolve({prevResult, stash});
      });
      return p;
    }, Promise.resolve({prevResult: result, stash}))
    .then(({prevResult}) => {
      result = prevResult;
    });

    this.simulatorContext.emit(
      AppSyncSimulatorEventType.AFTER_RESOLVE,
      this.config.fieldName,
      this.config.typeName,
      {
        source,
        args,
        context,
        info,
        result
      }
    );
    return responseMappingTemplate.render({ source, arguments: args, result }, context, info)
      .result;
  }
}
