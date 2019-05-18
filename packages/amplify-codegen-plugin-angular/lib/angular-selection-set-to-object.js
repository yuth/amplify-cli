"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const visitor_plugin_common_1 = require("@graphql-codegen/visitor-plugin-common");
const graphql_1 = require("graphql");
class AngularSelectionSetToObject extends visitor_plugin_common_1.SelectionSetToObject {
    constructor(_scalars, _schema, _convertName, _addTypename, _loadedFragments, _immutableTypes, _parentSchemaType, _selectionSet) {
        super(_scalars, _schema, _convertName, _addTypename, _loadedFragments, _parentSchemaType, _selectionSet);
        this._immutableTypes = _immutableTypes;
    }
    createNext(parentSchemaType, selectionSet) {
        return new AngularSelectionSetToObject(this._scalars, this._schema, this._convertName, this._addTypename, this._loadedFragments, this._immutableTypes, parentSchemaType, selectionSet);
    }
    clearOptional(str) {
        if (str.startsWith('Maybe')) {
            return str.replace(/^Maybe<(.*?)>$/i, '$1');
        }
        return str;
    }
    formatNamedField(name) {
        return this._immutableTypes ? `readonly ${name}` : name;
    }
    wrapTypeWithModifiers(baseType, type) {
        if (graphql_1.isNonNullType(type)) {
            return this.clearOptional(this.wrapTypeWithModifiers(baseType, type.ofType));
        }
        else if (graphql_1.isListType(type)) {
            const innerType = this.wrapTypeWithModifiers(baseType, type.ofType);
            return `Maybe<${this._immutableTypes ? 'ReadonlyArray' : 'Array'}<${innerType}>>`;
        }
        else {
            return `Maybe<${baseType}>`;
        }
    }
}
exports.AngularSelectionSetToObject = AngularSelectionSetToObject;
//# sourceMappingURL=angular-selection-set-to-object.js.map