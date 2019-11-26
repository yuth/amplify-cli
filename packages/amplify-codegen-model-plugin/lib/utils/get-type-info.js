"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
function getTypeInfo(typeNode, schema) {
    if (typeNode.kind === 'NamedType') {
        return {
            type: typeNode.name.value,
            isNullable: true,
            isList: false,
            baseType: schema.getType(typeNode.name.value),
        };
    }
    else if (typeNode.kind === 'NonNullType') {
        return Object.assign(Object.assign({}, getTypeInfo(typeNode.type, schema)), { isNullable: false });
    }
    else if (typeNode.kind === 'ListType') {
        return Object.assign(Object.assign({}, getTypeInfo(typeNode.type, schema)), { isList: true, isNullable: true });
    }
    return {
        isList: false,
        isNullable: false,
        type: typeNode,
    };
}
exports.getTypeInfo = getTypeInfo;
//# sourceMappingURL=get-type-info.js.map