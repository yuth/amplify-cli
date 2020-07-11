import { ResolverSlotManager } from './ResolverSlotManager';
import { GraphQLTransform, TransformerContext } from '..';
import Resource from 'cloudform-types/types/resource';
import Resolver from 'cloudform-types/types/appSync/resolver';
import PipelineFns from 'cloudform-types/types/appSync/functionConfiguration';
import { AppSync } from 'cloudform-types';
const REQUEST_TEMPLATE_SLOTS = ['init', 'preauth', 'auth', 'postAuth', 'predataLoad'];
const RESPONSE_TEMPLATE_SLOTS = ['postDataLoad', 'preAuthFilter', 'authFilter', 'postAuthFilter', 'finish'];
export class SimpleResolver {
  private dataSourceName: string;
  private slotManager: ResolverSlotManager;
  constructor(dataSourceName) {
    this.slotManager = new ResolverSlotManager([...REQUEST_TEMPLATE_SLOTS, ...RESPONSE_TEMPLATE_SLOTS]);
  }

  addDataSource(dataSourceName: string): void {
    this.dataSourceName = dataSourceName;
  }

  generateResources(ctx: TransformerContext): Resource[] {
    const resources: Resource[] = [];
    const requestFunctions = REQUEST_TEMPLATE_SLOTS.map((slotName) => {
      const slotItems = this.slotManager.get(slotName)
      const fns = slotItems.map(item => {
        return new AppSync.FunctionConfiguration({
          DataSourceName: 'NONE',
          FunctionVersion: '2018-05-29',
          RequestMappingTemplate: '',
          ApiId: 'asdf',
          Name: "Foo Bar baz",
          ResponseMappingTemplate: printBlock('Handle error or return result')(
            compoundExpression([
              iff(ref('ctx.error'), raw('$util.error($ctx.error.message, $ctx.error.type)')),
              raw('$util.toJson($ctx.result)'),
            ]),
          ),
        });
      })
    })
  }
}
