import { generateFilterExpression } from './dynamodb-filter';
export const transformUtils = {
  toDynamoDBFilterExpression: filter => {
    const result = generateFilterExpression(filter);
    return JSON.stringify({
      expression: result.expressions.join(' '),
      expressionNames: result.expressionNames,
      expressionValues: result.expressionValues
    });
  }
};