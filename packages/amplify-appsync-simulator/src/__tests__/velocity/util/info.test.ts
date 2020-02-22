import { GraphQLResolveInfo, SelectionNode, Kind, FieldNode, FragmentDefinitionNode } from 'graphql';
import { createInfo, getSelectionSetAsList } from '../../../velocity/util/info';

const stubInfo = {
  fieldName: 'someField',
  fieldNodes: [
    {
      kind: 'Field',
      name: {
        kind: 'Name',
        value: 'someField',
      },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: {
              kind: 'Name',
              value: 'otherField',
            },
          },
          {
            kind: 'Field',
            name: {
              kind: 'Name',
              value: 'someOtherField',
            },
            arguments: [
              {
                kind: 'Argument',
                name: {
                  kind: 'Name',
                  value: 'varName',
                },
                value: {
                  kind: 'Variable',
                  name: {
                    kind: 'Name',
                    value: 'foo',
                  },
                },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                {
                  kind: 'Field',
                  name: {
                    kind: 'Name',
                    value: 'subField',
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
  parentType: { name: 'Query' },
  variableValues: {
    foo: 'bar',
  },
} as unknown;
const mockInfo = stubInfo as GraphQLResolveInfo;

describe('info', () => {
  it('should generate a valid graphql info object', () => {
    const info = createInfo(mockInfo);
    expect(info).toEqual({
      fieldName: 'someField',
      variables: {
        foo: 'bar',
      },
      parentTypeName: 'Query',
      selectionSetList: ['otherField', 'someOtherField', 'someOtherField/subField'],
      selectionSetGraphQL: '{\n  otherField\n  someOtherField(varName: $foo) {\n    subField\n  }\n}',
    });
  });
  describe('getSelectionSetAsList', () => {
    describe('Field type', () => {
      let nodes: SelectionNode[];
      beforeEach(() => {
        nodes = [
          {
            kind: 'Field',
            name: {
              kind: 'Name',
              value: 'someField',
            },
            alias: undefined,
          },
        ];
      });

      it('should support simple field', () => {
        expect(getSelectionSetAsList(nodes, {})).toEqual(['someField']);
      });
      it('should accept prefix and add it to field list', () => {
        expect(getSelectionSetAsList(nodes, {}, 'prefix')).toEqual(['prefix/someField']);
      });
      it('should support alias for the field', () => {
        (nodes[0] as any).alias = {
          kind: Kind.NAME,
          value: 'aliasName',
        };
        expect(getSelectionSetAsList(nodes, {}, 'prefix')).toEqual(['prefix/aliasName']);
      });
    });

    describe('Object type field', () => {
      let nodes: SelectionNode[];
      beforeEach(() => {
        nodes = [
          {
            kind: Kind.FIELD,
            name: {
              kind: Kind.NAME,
              value: 'someField',
            },
            selectionSet: {
              kind: Kind.SELECTION_SET,
              selections: [
                {
                  kind: Kind.FIELD,
                  name: {
                    kind: Kind.NAME,
                    value: 'child',
                  },
                },
              ],
            },
          },
        ];
      });
      it('should support an field with selection set', () => {
        expect(getSelectionSetAsList(nodes, {})).toEqual(['someField', 'someField/child']);
      });
      it('should support prefix', () => {
        expect(getSelectionSetAsList(nodes, {}, 'prefix')).toEqual(['prefix/someField', 'prefix/someField/child']);
      });
      it('should support alias', () => {
        ((nodes[0] as FieldNode).selectionSet.selections[0] as any).alias = {
          kind: Kind.NAME,
          value: 'childAlias',
        };
        expect(getSelectionSetAsList(nodes, {})).toEqual(['someField', 'someField/childAlias']);
      });
    });

    describe('fragment spread', () => {
      let nodes: SelectionNode[];
      let fragments: Record<string, FragmentDefinitionNode> = {};
      beforeEach(() => {
        nodes = [
          {
            kind: Kind.FIELD,
            name: {
              kind: Kind.NAME,
              value: 'someField',
            },
            selectionSet: {
              kind: Kind.SELECTION_SET,
              selections: [
                {
                  kind: Kind.FIELD,
                  name: {
                    kind: Kind.NAME,
                    value: 'child',
                  },
                },
              ],
            },
          },
        ];
        fragments['myTestFragment'] = {
          kind: Kind.FRAGMENT_DEFINITION,
          name: {
            kind: Kind.NAME,
            value: 'myTestFragment',
          },
          typeCondition: {
            kind: Kind.NAMED_TYPE,
            name: {
              kind: Kind.NAME,
              value: 'myTestFragment',
            },
          },
          selectionSet: {
            kind: Kind.SELECTION_SET,
            selections: [
              {
                kind: Kind.FIELD,
                name: {
                  kind: Kind.NAME,
                  value: 'child',
                },
              },
            ],
          },
        };
      });
      it('should support fragment spread in a field', () => {
        expect(getSelectionSetAsList(nodes, fragments)).toEqual(['someField', 'someField/child']);
      });
    });
    describe('inline fragments', () => {
      let nodes: SelectionNode[];
      beforeEach(() => {
        nodes = [
          {
            kind: Kind.INLINE_FRAGMENT,
            selectionSet: {
              kind: Kind.SELECTION_SET,
              selections: [
                {
                  kind: Kind.FIELD,
                  name: {
                    kind: Kind.NAME,
                    value: 'child',
                  },
                },
              ],
            },
          },
        ];
      });
      it('should support inline fragment spread in a field', () => {
        expect(getSelectionSetAsList(nodes, {})).toEqual(['child']);
      });
    });
  });
});
