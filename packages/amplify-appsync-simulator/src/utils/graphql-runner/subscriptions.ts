import { subscribe, GraphQLSchema, DocumentNode } from 'graphql';
import { ExecutionResultDataDefault, ExecutionResult } from 'graphql/execution/execute';
import { AppSyncGraphQLExecutionContext } from './index';
import { runQueryOrMutation } from './query-and-mutation';
import { getOperationType } from './helpers';
export async function runSubscription(
  schema: GraphQLSchema,
  document: DocumentNode,
  variables: Record<string, any>,
  operationName: string | undefined,
  context: AppSyncGraphQLExecutionContext,
): Promise<AsyncIterableIterator<ExecutionResult<ExecutionResultDataDefault>> | ExecutionResult<ExecutionResultDataDefault>> {
  const result = await runQueryOrMutation(schema, document, variables, operationName, context);
  if (result.errors && result.errors.length) {
    return result;
  }
  const operationType = getOperationType(document);
  if (operationType !== 'subscription') {
    const error = new Error(`Expected operation type subscription, received ${operationType}`);
    error.name = 'GraphQL operation error';
  }
  return subscribe({
    schema: schema,
    document,
    variableValues: variables,
    contextValue: context,
    operationName,
  });
}
