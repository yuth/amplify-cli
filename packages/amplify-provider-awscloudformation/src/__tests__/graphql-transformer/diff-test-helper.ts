import * as gsiTestHelper from './gsi-test-helpers';
import { Diff, diff as getDiffs } from 'deep-diff';
import { DynamoDB } from 'cloudform';
import { DiffableProject } from '../../graphql-transformer/utils';

export const getDiffedProject = (
  currentGSI: gsiTestHelper.GSIDefinition[] | undefined,
  nextGSI: gsiTestHelper.GSIDefinition[] | undefined,
) => {
  const table1 = gsiTestHelper.makeTableWithGSI({
    gsis: currentGSI,
  });
  const table2 = gsiTestHelper.makeTableWithGSI({
    gsis: nextGSI,
  });
  const currentProj = makeProj('Post', table1);
  const nextProj = makeProj('Post', table2);
  const diffedValue = getDiffs(currentProj, nextProj);
  return { current: currentProj, next: nextProj, diff: diffedValue };
};

export const makeProj = (stackName: string, table: DynamoDB.Table): DiffableProject => {
  return {
    root: {},
    stacks: {
      [stackName]: {
        Resources: {
          [`${table.Properties.TableName || 'MyTable'}Table`]: table,
        },
      },
    },
  };
};

export const filterNonGSIChanges = (diffs: Array<Diff<any, any>>) => {
  const seenPaths = new Set();
  return diffs
    .filter(diff => diff.path?.includes('GlobalSecondaryIndexes'))
    .filter(diff => {
      const leafPath = diff.path?.slice(-1)[0];
      if (leafPath !== 'GlobalSecondaryIndexes') {
        const gsiPathIndex = diff.path!.indexOf('GlobalSecondaryIndexes') + 1;
        const gsiPath = diff.path?.slice(0, gsiPathIndex).join('/');
        if (seenPaths.has(gsiPath)) return;
      }
      const pathJoined = `${diff.path?.join('/')}`;
      if (!seenPaths.has(pathJoined)) {
        seenPaths.add(pathJoined);
        return true;
      }
    });
};
