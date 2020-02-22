import { GraphQLResolveInfo, SelectionNode, FragmentDefinitionNode } from 'graphql';
import { print } from 'graphql/language/printer';

export const getSelectionSetAsList = (
  nodes: readonly SelectionNode[],
  fragments: Record<string, FragmentDefinitionNode>,
  prefix: string = null,
) => {
  return nodes.reduce((selectionSetList: string[], node) => {
    if (node.kind == 'Field') {
      const nameOrAlias = node.alias ? node.alias.value : node.name.value;
      const name = prefix ? `${prefix}/${nameOrAlias}` : nameOrAlias;
      selectionSetList.push(name);
      if (node.selectionSet) {
        selectionSetList.push(...getSelectionSetAsList(node.selectionSet.selections, fragments, name));
      }
    } else if (node.kind === 'FragmentSpread') {
      const fragment = fragments[node.name.value];
      selectionSetList.push(...getSelectionSetAsList(fragment.selectionSet.selections, fragments, prefix));
    } else if (node.kind === 'InlineFragment') {
      selectionSetList.push(...getSelectionSetAsList(node.selectionSet.selections, fragments, prefix));
    }

    return selectionSetList;
  }, []);
};

export function createInfo(info: GraphQLResolveInfo) {
  let selectionSetGraphQL = '';
  let selectionSetList = [];

  const fieldNode = info.fieldNodes.find(f => f.name.value === info.fieldName);
  if (fieldNode && fieldNode.selectionSet) {
    const query = print(fieldNode);
    selectionSetGraphQL = query.substr(query.indexOf('{'));
    selectionSetList = getSelectionSetAsList(fieldNode.selectionSet.selections, info.fragments, undefined);
  }

  return {
    fieldName: info.fieldName,
    variables: info.variableValues,
    parentTypeName: info.parentType.name,
    selectionSetList,
    selectionSetGraphQL,
  };
}
