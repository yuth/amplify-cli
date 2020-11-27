import { Diff, diff } from 'deep-diff';
import * as diffUtils from '../../graphql-transformer/diff-utils';
import { GSIStatus } from '../../utils/amplify-resource-state-utils';
import * as diffTestHelpers from './diff-test-helper';
describe('diff utils', () => {
  describe('diffToTableStatus', () => {
    describe('add index', () => {
      it('Should return add when a new index is added', () => {
        const diffedProj = diffTestHelpers.getDiffedProject(
          [],
          [
            {
              indexName: 'firstIndex',
              attributes: {
                hash: {
                  name: 'foo',
                  type: 'S',
                },
              },
            },
          ],
        );
        const filteredDiffs = diffTestHelpers.filterNonGSIChanges(diffedProj.diff!);
        const change = diffUtils.getIndexChanges(filteredDiffs[0]!, diffedProj.current, diffedProj.next);
        expect(change).toHaveLength(1);
        expect(change[0].type).toEqual(GSIStatus.add);
        expect(change[0].indexName).toEqual('firstIndex');
      });
      it('should show as add when an index is added to an table which already has another GSI', () => {
        const firstIndex = {
          indexName: 'firstIndex',
          attributes: {
            hash: {
              name: 'foo',
              type: 'S',
            },
          },
        };
        const diffedProj = diffTestHelpers.getDiffedProject(
          [firstIndex],
          [
            firstIndex,
            {
              indexName: 'secondIndex',
              attributes: {
                hash: {
                  name: 'bar',
                  type: 'S',
                },
              },
            },
          ],
        );
        const filteredDiffs = diffTestHelpers.filterNonGSIChanges(diffedProj.diff!);
        const change = diffUtils.getIndexChanges(filteredDiffs[0]!, diffedProj.current, diffedProj.next);

        expect(change).toHaveLength(1);
        expect(change[0].type).toEqual(GSIStatus.add);
        expect(change[0].indexName).toEqual('secondIndex');
      });

      it('should return as add when multiple index is added to an table which already has another GSI', () => {
        const firstIndex = {
          indexName: 'firstIndex',
          attributes: {
            hash: {
              name: 'foo',
              type: 'S',
            },
          },
        };
        const diffedProj = diffTestHelpers.getDiffedProject(
          [firstIndex],
          [
            firstIndex,
            {
              ...firstIndex,
              indexName: 'secondIndex',
              attributes: {
                hash: {
                  name: 'bar',
                },
              },
            },
            {
              ...firstIndex,
              indexName: 'thirdIndex',
              attributes: {
                hash: {
                  name: 'baz',
                },
              },
            },
            {
              ...firstIndex,
              indexName: 'fourthIndex',
              attributes: {
                hash: {
                  name: 'quk',
                },
              },
            },
          ],
        );
        const filteredDiffs = diffTestHelpers.filterNonGSIChanges(diffedProj.diff!);
        const change = diffUtils.getIndexChanges(filteredDiffs[2]!, diffedProj.current, diffedProj.next);

        expect(change[0].type).toEqual(GSIStatus.add);
        expect(change[0].indexName).toEqual('secondIndex');

        const change2 = diffUtils.getIndexChanges(filteredDiffs[1]!, diffedProj.current, diffedProj.next);
        expect(change2[0].indexName).toEqual('thirdIndex');

        const change3 = diffUtils.getIndexChanges(filteredDiffs[0]!, diffedProj.current, diffedProj.next);
        expect(change3[0].indexName).toEqual('fourthIndex');
      });

      it('should return as add when multiple index is added in the middle of GSI array', () => {
        const firstIndex = {
          indexName: 'firstIndex',
          attributes: {
            hash: {
              name: 'foo',
              type: 'S',
            },
          },
        };
        const lastIndex = {
          ...firstIndex,
          indexName: 'lastIndex',
        };
        const diffedProj = diffTestHelpers.getDiffedProject(
          [firstIndex, lastIndex],
          [
            firstIndex,
            {
              ...firstIndex,
              indexName: 'secondIndex',
              attributes: {
                hash: {
                  name: 'bar',
                },
              },
            },
            {
              ...firstIndex,
              indexName: 'thirdIndex',
              attributes: {
                hash: {
                  name: 'baz',
                },
              },
            },
            {
              ...firstIndex,
              indexName: 'fourthIndex',
              attributes: {
                hash: {
                  name: 'quk',
                },
              },
            },
            lastIndex,
          ],
        );
        const filteredDiffs = diffTestHelpers.filterNonGSIChanges(diffedProj.diff!);
        const changes = filteredDiffs.reduce<diffUtils.IndexChange[]>(
          (acc, diff) => [...acc, ...diffUtils.getIndexChanges(diff, diffedProj.current, diffedProj.next)],
          [],
        );
        expect(changes).toContainEqual([
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

      it('should return as add when multiple GSIs are added to a table with no GSI', () => {
        const firstIndex = {
          indexName: 'firstIndex',
          attributes: {
            hash: {
              name: 'foo',
              type: 'S',
            },
          },
        };
        const secondIndex = {
          ...firstIndex,
          indexName: 'secondIndex',
          attributes: {
            hash: {
              name: 'bar',
            },
          },
        };
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
      const diffedProj = diffTestHelpers.getDiffedProject(
        [
          {
            indexName: 'firstIndex',
            attributes: {
              hash: {
                name: 'foo',
                type: 'S',
              },
            },
          },
        ],
        [],
      );
      const filteredDiffs = diffTestHelpers.filterNonGSIChanges(diffedProj.diff!);
      expect(diffUtils.getIndexChanges(filteredDiffs[0]!, diffedProj.current, diffedProj.next)).toEqual([
        {
          type: GSIStatus.delete,
          indexName: 'firstIndex',
        },
      ]);
    });
    it('should return delete when there are more than 1 GSI in inital table', () => {
      const firstIndex = {
        indexName: 'firstIndex',
        attributes: {
          hash: {
            name: 'foo',
            type: 'S',
          },
        },
      };
      const diffedProj = diffTestHelpers.getDiffedProject(
        [
          firstIndex,
          {
            indexName: 'secondIndex',
            attributes: {
              hash: {
                name: 'bar',
                type: 'S',
              },
            },
          },
        ],
        [firstIndex],
      );
      const filteredDiffs = diffTestHelpers.filterNonGSIChanges(diffedProj.diff!);
      expect(diffUtils.getIndexChanges(filteredDiffs[0]!, diffedProj.current, diffedProj.next)).toEqual([
        {
          type: GSIStatus.delete,
          indexName: 'secondIndex',
        },
      ]);
    });

    it('should return as return when multiple index is removed to an table which already has another GSI', () => {
      const firstIndex = {
        indexName: 'firstIndex',
        attributes: {
          hash: {
            name: 'foo',
            type: 'S',
          },
        },
      };
      const diffedProj = diffTestHelpers.getDiffedProject(
        [
          firstIndex,
          {
            ...firstIndex,
            indexName: 'secondIndex',
            attributes: {
              hash: {
                name: 'bar',
              },
            },
          },
          {
            ...firstIndex,
            indexName: 'thirdIndex',
            attributes: {
              hash: {
                name: 'baz',
              },
            },
          },
          {
            ...firstIndex,
            indexName: 'fourthIndex',
            attributes: {
              hash: {
                name: 'quk',
              },
            },
          },
        ],
        [firstIndex],
      );
      const filteredDiffs = diffTestHelpers.filterNonGSIChanges(diffedProj.diff!);
      expect(diffUtils.getIndexChanges(filteredDiffs[0]!, diffedProj.current, diffedProj.next)).toEqual([
        {
          type: GSIStatus.delete,
          indexName: 'fourthIndex',
        },
      ]);

      expect(diffUtils.getIndexChanges(filteredDiffs[1]!, diffedProj.current, diffedProj.next)).toEqual([
        {
          type: GSIStatus.delete,
          indexName: 'thirdIndex',
        },
      ]);

      expect(diffUtils.getIndexChanges(filteredDiffs[2]!, diffedProj.current, diffedProj.next)).toEqual([
        {
          type: GSIStatus.delete,
          indexName: 'secondIndex',
        },
      ]);
    });

    it('should do a batch delete when all the GSIs are deleted', () => {
      const firstIndex = {
        indexName: 'firstIndex',
        attributes: {
          hash: {
            name: 'foo',
            type: 'S',
          },
        },
      };
      const diffedProj = diffTestHelpers.getDiffedProject(
        [
          firstIndex,
          {
            ...firstIndex,
            indexName: 'secondIndex',
            attributes: {
              hash: {
                name: 'bar',
              },
            },
          },
          {
            ...firstIndex,
            indexName: 'thirdIndex',
            attributes: {
              hash: {
                name: 'baz',
              },
            },
          },
        ],
        undefined,
      );
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
    it('should return an update when index has sort key added is changed', () => {
      const firstIndex = {
        indexName: 'firstIndex',
        attributes: {
          hash: {
            name: 'foo',
            type: 'S',
          },
        },
      };
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
    it('should return an update when index has sort key changed is changed', () => {
      const firstIndex = {
        indexName: 'firstIndex',
        attributes: {
          hash: {
            name: 'foo',
            type: 'S',
          },
          sort: {
            name: 'oldBar',
            type: 'S',
          },
        },
      };
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
  });

  describe('No op', () => {
    it('should return an empty list if GSIs are re-ordered in the array', () => {
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
      const secondIndex = {
        ...firstIndex,
        indexName: 'secondIndex',
      };
      const thirdIndex = {
        ...firstIndex,
        indexName: 'thirdIndex',
      };

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
