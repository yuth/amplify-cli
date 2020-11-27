import { GlobalSecondaryIndex } from 'cloudform-types/types/dynamoDb/table';
import { Diff, diff as getDiffs } from 'deep-diff';
import _ from 'lodash';
import { GSIStatus } from '../utils/amplify-resource-state-utils';
import { DiffableProject } from './utils';

export type IndexChange = {
  type: GSIStatus;
  indexName: string;
};
// Todo rename to something sensible
export const getIndexChanges = (gsiChange: Diff<any, any>, current: DiffableProject, next: DiffableProject): IndexChange[] => {
  const leafPath = gsiChange.path.slice(-1)[0];
  if (gsiChange.kind === 'A') {
    if (gsiChange.item.kind === 'D' && gsiChange.item.lhs) {
      return [
        {
          type: GSIStatus.delete,
          indexName: gsiChange.item.lhs.IndexName,
        },
      ];
    }
    if (gsiChange.item.kind === 'N' && gsiChange.item.rhs) {
      if (['IndexName', 'GlobalSecondaryIndexes'].includes(leafPath)) {
        const innerDiffs = getInnerDiffs(gsiChange, current, next);
        const pathToGSI = gsiChange.path.slice(0, 7);
        const gsiIndexName = _.get(current, pathToGSI).IndexName;
        for (const innerDiff of innerDiffs) {
          if (innerDiff.kind === 'A' && innerDiff.path.slice(-1)[0] === 'KeySchema' && innerDiff.path[0] === gsiIndexName) {
            return [{ type: GSIStatus.edit, indexName: gsiIndexName }];
          }
        }
        return [
          {
            type: GSIStatus.add,
            indexName: gsiChange.item.rhs.IndexName,
          },
        ];
      } else if (['KeySchema'].includes(leafPath)) {
        // ensure the diff is not because the key schema is moved
        const innerDiffs = getInnerDiffs(gsiChange, current, next);
        const pathToGSI = gsiChange.path.slice(0, 7);
        const gsiIndexName = _.get(current, pathToGSI).IndexName;
        for (const innerDiff of innerDiffs) {
          if (innerDiff.kind === 'A' && innerDiff.path.slice(-1)[0] === 'KeySchema' && innerDiff.path[0] === gsiIndexName) {
            return [{ type: GSIStatus.edit, indexName: gsiIndexName }];
          }
        }
      }
    }
  } else if (gsiChange.kind === 'N' && gsiChange.rhs.length >= 1) {
    return gsiChange.rhs.map(newIndex => {
      return {
        type: GSIStatus.add,
        indexName: newIndex.IndexName,
      };
    });
  } else if (gsiChange.kind === 'D' && gsiChange.lhs.length > 1) {
    return gsiChange.lhs.map(newIndex => {
      return {
        type: GSIStatus.delete,
        indexName: newIndex.IndexName,
      };
    });
  } else if (gsiChange.kind === 'E' && gsiChange.lhs) {
    if (leafPath === 'IndexName') {
      const innerDiff = getInnerDiffs(gsiChange, current, next);
      // Index is moved around no real change
      if (innerDiff.length == 0) {
        return [];
      }
      return [
        { type: GSIStatus.delete, indexName: gsiChange.lhs },
        { type: GSIStatus.add, indexName: gsiChange.rhs },
      ];
    }

    if (leafPath === 'AttributeName') {
      // need to run a check to ensure this ks change is actually happening and not because the order changed.
      const innerDiffs = getInnerDiffs(gsiChange, current, next);
      const pathToGSI = gsiChange.path.slice(0, 7);
      const gsiIndexName = _.get(current, pathToGSI).IndexName;
      for (const innerDiff of innerDiffs) {
        if (innerDiff.kind === 'E' && innerDiff.path.slice(-1)[0] === 'AttributeName' && innerDiff.path[0] === gsiIndexName) {
          return [{ type: GSIStatus.edit, indexName: gsiIndexName }];
        }
      }
    }
  }
  return [];
};

export const getInnerDiffs = (gsiChange: Diff<any, any>, current: DiffableProject, next: DiffableProject) => {
  const gsiIndex = gsiChange.path.indexOf('GlobalSecondaryIndexes');
  const pathToGSIs = gsiChange.path.slice(0, gsiIndex + 1);
  const oldIndexes = _.get(current, pathToGSIs);
  const newIndexes = _.get(next, pathToGSIs);
  const oldIndexesDiffable = _.keyBy(oldIndexes, 'IndexName');
  const newIndexesDiffable = _.keyBy(newIndexes, 'IndexName');
  return getDiffs(oldIndexesDiffable, newIndexesDiffable) || [];
};
