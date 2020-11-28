import * as diffUtils from '../../graphql-transformer/diff-utils';
import { GSIStatus } from '../../utils/amplify-resource-state-utils';
import * as diffTestHelpers from './diff-test-helper';
describe('diff utils', () => {
  let firstIndex;
  let secondIndex;
  let thirdIndex;
  let fourthIndex;
  beforeEach(() => {
    firstIndex = {
      indexName: 'firstIndex',
      attributes: {
        hash: {
          name: 'foo',
          type: 'S',
        },
      },
    };
    secondIndex = {
      indexName: 'secondIndex',
      attributes: {
        hash: {
          name: 'bar',
          type: 'S',
        },
      },
    };
    thirdIndex = {
      indexName: 'thirdIndex',
      attributes: {
        hash: {
          name: 'baz',
          type: 'S',
        },
      },
    };

    fourthIndex = {
      indexName: 'fourthIndex',
      attributes: {
        hash: {
          name: 'qux',
          type: 'S',
        },
      },
    };
  });
  describe('diffToTableStatus', () => {
    describe('add index', () => {
      it('Should return add when a new index is added', () => {
        const diffedProj = diffTestHelpers.getDiffedProject([], [firstIndex]);
        const filteredDiffs = diffTestHelpers.filterNonGSIChanges(diffedProj.diff!);
        const change = diffUtils.getIndexChanges(filteredDiffs[0]!, diffedProj.current, diffedProj.next);
        expect(change).toHaveLength(1);
        expect(change[0].type).toEqual(GSIStatus.add);
        expect(change[0].indexName).toEqual('firstIndex');
      });
      it('should show as add when an index is added to an table which already has another GSI', () => {
        const diffedProj = diffTestHelpers.getDiffedProject([firstIndex], [firstIndex, secondIndex]);
        const filteredDiffs = diffTestHelpers.filterNonGSIChanges(diffedProj.diff!);
        const changes = filteredDiffs.reduce<diffUtils.IndexChange[]>(
          (acc, diff) => [...acc, ...diffUtils.getIndexChanges(diff, diffedProj.current, diffedProj.next)],
          [],
        );
        expect(changes).toMatchObject([{ type: GSIStatus.add, indexName: 'secondIndex' }]);
      });

      it('should return as add when multiple index is added to an table which already has another GSI', () => {
        const diffedProj = diffTestHelpers.getDiffedProject([firstIndex], [firstIndex, secondIndex, thirdIndex, fourthIndex]);
        const filteredDiffs = diffTestHelpers.filterNonGSIChanges(diffedProj.diff!);
        const changes = filteredDiffs.reduce<diffUtils.IndexChange[]>(
          (acc, diff) => [...acc, ...diffUtils.getIndexChanges(diff, diffedProj.current, diffedProj.next)],
          [],
        );
        expect(changes).toMatchObject([
          {
            type: GSIStatus.add,
            indexName: 'secondIndex',
          },
          {
            type: GSIStatus.add,
            indexName: 'thirdIndex',
          },
          {
            type: GSIStatus.add,
            indexName: 'fourthIndex',
          },
        ]);
      });

      it('should return add when multiple index is added in the middle of GSI array', () => {
        const diffedProj = diffTestHelpers.getDiffedProject([firstIndex, fourthIndex], [firstIndex, secondIndex, thirdIndex, fourthIndex]);
        const filteredDiffs = diffTestHelpers.filterNonGSIChanges(diffedProj.diff!);
        const changes = filteredDiffs.reduce<diffUtils.IndexChange[]>(
          (acc, diff) => [...acc, ...diffUtils.getIndexChanges(diff, diffedProj.current, diffedProj.next)],
          [],
        );
        console.log(changes);
        expect(changes).toMatchObject([
          {
            type: GSIStatus.add,
            indexName: 'secondIndex',
          },
          {
            type: GSIStatus.add,
            indexName: 'thirdIndex',
          },
        ]);
      });
      it('should return add when multiple index is added in to end of GSI array', () => {
        const diffedProj = diffTestHelpers.getDiffedProject([firstIndex, fourthIndex], [firstIndex, fourthIndex, secondIndex, thirdIndex]);
        const filteredDiffs = diffTestHelpers.filterNonGSIChanges(diffedProj.diff!);
        const changes = filteredDiffs.reduce<diffUtils.IndexChange[]>(
          (acc, diff) => [...acc, ...diffUtils.getIndexChanges(diff, diffedProj.current, diffedProj.next)],
          [],
        );
        console.log(changes);
        expect(changes).toMatchObject([
          {
            type: GSIStatus.add,
            indexName: 'secondIndex',
          },
          {
            type: GSIStatus.add,
            indexName: 'thirdIndex',
          },
        ]);
      });

      it('should return add when multiple index is added in to begining of GSI array', () => {
        const diffedProj = diffTestHelpers.getDiffedProject([firstIndex, fourthIndex], [secondIndex, thirdIndex, firstIndex, fourthIndex]);
        const filteredDiffs = diffTestHelpers.filterNonGSIChanges(diffedProj.diff!);
        const changes = filteredDiffs.reduce<diffUtils.IndexChange[]>(
          (acc, diff) => [...acc, ...diffUtils.getIndexChanges(diff, diffedProj.current, diffedProj.next)],
          [],
        );
        console.log(changes);
        expect(changes).toMatchObject([
          {
            type: GSIStatus.add,
            indexName: 'secondIndex',
          },
          {
            type: GSIStatus.add,
            indexName: 'thirdIndex',
          },
        ]);
      });

      it('should return as add when multiple GSIs are added to a table with no GSI', () => {
        const diffedProj = diffTestHelpers.getDiffedProject(undefined, [firstIndex, secondIndex]);
        const filteredDiffs = diffTestHelpers.filterNonGSIChanges(diffedProj.diff!);
        const change = diffUtils.getIndexChanges(filteredDiffs[0]!, diffedProj.current, diffedProj.next);
        expect(change).toHaveLength(2);
        expect(change[0]).toEqual({
          type: GSIStatus.add,
          indexName: 'firstIndex',
        });
        expect(change[1]).toEqual({
          type: GSIStatus.add,
          indexName: 'secondIndex',
        });
      });
    });
  });

  describe('delete', () => {
    it('should return delete when index is removed', () => {
      const diffedProj = diffTestHelpers.getDiffedProject([firstIndex], []);
      const filteredDiffs = diffTestHelpers.filterNonGSIChanges(diffedProj.diff!);
      expect(diffUtils.getIndexChanges(filteredDiffs[0]!, diffedProj.current, diffedProj.next)).toEqual([
        {
          type: GSIStatus.delete,
          indexName: 'firstIndex',
        },
      ]);
    });
    it('should return delete when there are more than 1 GSI in inital table', () => {
      const diffedProj = diffTestHelpers.getDiffedProject([firstIndex, secondIndex], [firstIndex]);
      const filteredDiffs = diffTestHelpers.filterNonGSIChanges(diffedProj.diff!);
      expect(diffUtils.getIndexChanges(filteredDiffs[0]!, diffedProj.current, diffedProj.next)).toEqual([
        {
          type: GSIStatus.delete,
          indexName: 'secondIndex',
        },
      ]);
    });

    it('should return delete when multiple index is removed from the end of GSI array', () => {
      const diffedProj = diffTestHelpers.getDiffedProject([firstIndex, secondIndex, thirdIndex, fourthIndex], [firstIndex]);
      const filteredDiffs = diffTestHelpers.filterNonGSIChanges(diffedProj.diff!);
      const changes = filteredDiffs.reduce<diffUtils.IndexChange[]>((acc, diff) => {
        return [...acc, ...diffUtils.getIndexChanges(diff, diffedProj.current, diffedProj.next)];
      }, []);
      expect(changes).toMatchObject([
        {
          indexName: 'secondIndex',
          type: GSIStatus.delete,
        },
        {
          type: GSIStatus.delete,
          indexName: 'thirdIndex',
        },
        {
          type: GSIStatus.delete,
          indexName: 'fourthIndex',
        },
      ]);
    });

    it('should return delete when multiple index is removed from the middle of GSI array', () => {
      const diffedProj = diffTestHelpers.getDiffedProject([firstIndex, secondIndex, thirdIndex, fourthIndex], [firstIndex, fourthIndex]);
      const filteredDiffs = diffTestHelpers.filterNonGSIChanges(diffedProj.diff!);
      const changes = filteredDiffs.reduce<diffUtils.IndexChange[]>((acc, diff) => {
        return [...acc, ...diffUtils.getIndexChanges(diff, diffedProj.current, diffedProj.next)];
      }, []);
      expect(changes).toMatchObject([
        {
          indexName: 'secondIndex',
          type: GSIStatus.delete,
        },
        {
          type: GSIStatus.delete,
          indexName: 'thirdIndex',
        },
      ]);
    });

    it('should return delete when multiple index is removed from the begining of GSI array', () => {
      const diffedProj = diffTestHelpers.getDiffedProject([firstIndex, secondIndex, thirdIndex, fourthIndex], [fourthIndex]);
      const filteredDiffs = diffTestHelpers.filterNonGSIChanges(diffedProj.diff!);
      const changes = filteredDiffs.reduce<diffUtils.IndexChange[]>((acc, diff) => {
        return [...acc, ...diffUtils.getIndexChanges(diff, diffedProj.current, diffedProj.next)];
      }, []);
      expect(changes).toMatchObject([
        {
          indexName: 'firstIndex',
          type: GSIStatus.delete,
        },
        {
          indexName: 'secondIndex',
          type: GSIStatus.delete,
        },
        {
          type: GSIStatus.delete,
          indexName: 'thirdIndex',
        },
      ]);
    });

    it('should do a batch delete when all the GSIs are deleted', () => {
      const diffedProj = diffTestHelpers.getDiffedProject([firstIndex, secondIndex, thirdIndex], undefined);
      const filteredDiffs = diffTestHelpers.filterNonGSIChanges(diffedProj.diff!);
      expect(diffUtils.getIndexChanges(filteredDiffs[0]!, diffedProj.current, diffedProj.next)).toEqual([
        {
          type: GSIStatus.delete,
          indexName: 'firstIndex',
        },
        {
          type: GSIStatus.delete,
          indexName: 'secondIndex',
        },
        {
          type: GSIStatus.delete,
          indexName: 'thirdIndex',
        },
      ]);
    });
  });

  describe('update', () => {
    it('should return an update when index has sort key is added', () => {
      const firstIndexUpdated = {
        ...firstIndex,
        attributes: {
          ...firstIndex.attributes,
          sort: {
            name: 'bar',
            type: 'S',
          },
        },
      };

      const diffedProj = diffTestHelpers.getDiffedProject([firstIndex], [firstIndexUpdated]);
      const filteredDiffs = diffTestHelpers.filterNonGSIChanges(diffedProj.diff!);
      const change = diffUtils.getIndexChanges(filteredDiffs[0]!, diffedProj.current, diffedProj.next);
      expect(change).toEqual([
        {
          type: GSIStatus.edit,
          indexName: 'firstIndex',
        },
      ]);
    });

    it('should return an update when index has sort key added', () => {
      const firstIndexUpdated = {
        ...firstIndex,
        attributes: {
          ...firstIndex.attributes,
          sort: {
            name: 'bar',
            type: 'S',
          },
        },
      };

      const diffedProj = diffTestHelpers.getDiffedProject([firstIndex], [firstIndexUpdated]);
      const filteredDiffs = diffTestHelpers.filterNonGSIChanges(diffedProj.diff!);
      const change = diffUtils.getIndexChanges(filteredDiffs[0]!, diffedProj.current, diffedProj.next);
      expect(change).toEqual([
        {
          type: 'edit',
          indexName: 'firstIndex',
        },
      ]);
    });

    it('should return an update when index has hash key is changed', () => {
      const firstIndex = {
        indexName: 'firstIndex',
        attributes: {
          hash: {
            name: 'foo',
            type: 'S',
          },
          sort: {
            name: 'bar',
            type: 'S',
          },
        },
      };
      const firstIndexUpdated = {
        ...firstIndex,
        attributes: {
          ...firstIndex.attributes,
          hash: {
            name: 'foo2',
            type: 'S',
          },
        },
      };

      const diffedProj = diffTestHelpers.getDiffedProject([firstIndex], [firstIndexUpdated]);
      const filteredDiffs = diffTestHelpers.filterNonGSIChanges(diffedProj.diff!);
      const change = diffUtils.getIndexChanges(filteredDiffs[0]!, diffedProj.current, diffedProj.next);
      expect(change).toEqual([
        {
          type: GSIStatus.edit,
          indexName: 'firstIndex',
        },
      ]);
    });

    it('should return an remove and an add when index name is changed', () => {
      const firstIndex = {
        indexName: 'firstIndex',
        attributes: {
          hash: {
            name: 'foo',
            type: 'S',
          },
          sort: {
            name: 'bar',
            type: 'S',
          },
        },
      };
      const firstIndexUpdated = {
        ...firstIndex,
        indexName: 'firstIndexRenamed',
      };

      const diffedProj = diffTestHelpers.getDiffedProject([firstIndex], [firstIndexUpdated]);
      const filteredDiffs = diffTestHelpers.filterNonGSIChanges(diffedProj.diff!);
      const change = diffUtils.getIndexChanges(filteredDiffs[0]!, diffedProj.current, diffedProj.next);
      expect(change).toEqual([
        {
          type: GSIStatus.delete,
          indexName: 'firstIndex',
        },
        {
          type: GSIStatus.add,
          indexName: 'firstIndexRenamed',
        },
      ]);
    });

    it('should update when GSI has multiple Keys and one of the index gets sort key added', () => {
      const secondIndexWithSortKey = {
        ...secondIndex,
        attributes: {
          ...secondIndex.attributes,
          sort: {
            name: 'secondBar',
            type: 'N',
          },
        },
      };
      const diffedProj = diffTestHelpers.getDiffedProject([firstIndex, secondIndex], [firstIndex, secondIndexWithSortKey]);
      const filteredDiffs = diffTestHelpers.filterNonGSIChanges(diffedProj.diff!);
      const change = diffUtils.getIndexChanges(filteredDiffs[0]!, diffedProj.current, diffedProj.next);
      expect(change).toEqual([
        {
          type: GSIStatus.edit,
          indexName: 'secondIndex',
        },
      ]);
    });

    it('should update when GSI has multiple Keys and one of the index gets sort key added and the GSI array order changes', () => {
      const secondIndexWithSortKey = {
        ...secondIndex,
        attributes: {
          ...secondIndex.attributes,
          sort: {
            name: 'secondBar',
            type: 'N',
          },
        },
      };
      const diffedProj = diffTestHelpers.getDiffedProject([firstIndex, secondIndex], [secondIndexWithSortKey, firstIndex]);
      const filteredDiffs = diffTestHelpers.filterNonGSIChanges(diffedProj.diff!);
      console.log(filteredDiffs);
      const changes = filteredDiffs.reduce<diffUtils.IndexChange[]>(
        (acc, diff) => [...acc, ...diffUtils.getIndexChanges(diff, diffedProj.current, diffedProj.next)],
        [],
      );
      expect(changes).toEqual([
        {
          type: GSIStatus.edit,
          indexName: 'secondIndex',
        },
      ]);
    });
  });

  describe('No op', () => {
    it('should return an empty list if GSIs are re-ordered in the array', () => {
      const diffedProj = diffTestHelpers.getDiffedProject([firstIndex, secondIndex, thirdIndex], [secondIndex, firstIndex, thirdIndex]);
      const filteredDiffs = diffTestHelpers.filterNonGSIChanges(diffedProj.diff!);
      const changes = filteredDiffs.reduce<diffUtils.IndexChange[]>(
        (acc, diff) => [...acc, ...diffUtils.getIndexChanges(diff, diffedProj.current, diffedProj.next)],
        [],
      );
      expect(changes).toHaveLength(0);
    });
  });
});
