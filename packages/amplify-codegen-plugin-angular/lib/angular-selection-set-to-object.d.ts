import { SelectionSetToObject, ConvertNameFn, ScalarsMap, LoadedFragment } from '@graphql-codegen/visitor-plugin-common';
import { GraphQLSchema, GraphQLNamedType, SelectionSetNode, GraphQLObjectType, GraphQLNonNull, GraphQLList } from 'graphql';
export declare class AngularSelectionSetToObject extends SelectionSetToObject {
    private _immutableTypes;
    constructor(_scalars: ScalarsMap, _schema: GraphQLSchema, _convertName: ConvertNameFn, _addTypename: boolean, _loadedFragments: LoadedFragment[], _immutableTypes: boolean, _parentSchemaType?: GraphQLNamedType, _selectionSet?: SelectionSetNode);
    createNext(parentSchemaType: GraphQLNamedType, selectionSet: SelectionSetNode): SelectionSetToObject;
    private clearOptional;
    protected formatNamedField(name: string): string;
    protected wrapTypeWithModifiers(baseType: string, type: GraphQLObjectType | GraphQLNonNull<GraphQLObjectType> | GraphQLList<GraphQLObjectType>): string;
}
