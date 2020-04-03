import { GraphQLSchema, DocumentNode, execute } from 'graphql';
import { exposeGraphQLErrors } from '../expose-graphql-errors';
import { AppSyncGraphQLExecutionContext } from './index';
export async function runQueryOrMutation(
  schema: GraphQLSchema,
  doc: DocumentNode,
  variables: Record<string, any>,
  operationName: string,
  context: AppSyncGraphQLExecutionContext,
): Promise<{ data: any; errors?: any }> {
  const results: any = await execute(schema, doc, null, context, variables, operationName);
  const errors = [...(results.errors || []), ...(context.appsyncErrors || [])];
  if (errors.length > 0) {
    results.errors = exposeGraphQLErrors(errors);
  }
  return { data: null, ...results };
}
