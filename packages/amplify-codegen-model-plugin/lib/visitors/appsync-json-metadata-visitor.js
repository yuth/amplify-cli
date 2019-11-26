"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const visitor_plugin_common_1 = require("@graphql-codegen/visitor-plugin-common");
const appsync_visitor_1 = require("./appsync-visitor");
var JSONGraphQLScalarType;
(function (JSONGraphQLScalarType) {
    JSONGraphQLScalarType["ID"] = "ID";
    JSONGraphQLScalarType["String"] = "String";
    JSONGraphQLScalarType["Int"] = "Int";
    JSONGraphQLScalarType["Float"] = "Float";
    JSONGraphQLScalarType["Boolean"] = "Boolean";
})(JSONGraphQLScalarType || (JSONGraphQLScalarType = {}));
class AppSyncJSONVisitor extends appsync_visitor_1.AppSyncModelVisitor {
    constructor(schema, rawConfig, additionalConfig, defaultScalars = visitor_plugin_common_1.DEFAULT_SCALARS) {
        super(schema, rawConfig, additionalConfig, defaultScalars);
        this._parsedConfig.metaDataTarget = rawConfig.metaDataTarget || 'json';
    }
    generate() {
        if (this._parsedConfig.metaDataTarget === 'typescript') {
            return this.generateTypeScriptMetaData();
        }
        else if (this._parsedConfig.metaDataTarget === 'javascript') {
            return this.generateJavaScriptMetaData();
        }
        else if (this._parsedConfig.metaDataTarget === 'typedeclaration') {
            return this.generateTypeDeclaration();
        }
        return this.generateJSONMetaData();
    }
    generateTypeScriptMetaData() {
        const metadatObj = this.generateMetaData();
        const metaData = [`import { Schema } from "@aws-amplify/datastore";`, ''];
        metaData.push(`export const schema: Schema = ${JSON.stringify(metadatObj, null, 4)};`);
        return metaData.join('\n');
    }
    generateJavaScriptMetaData() {
        const metadatObj = this.generateMetaData();
        const metaData = [];
        metaData.push(`export const schema = ${JSON.stringify(metadatObj, null, 4)};`);
        return metaData.join('\n');
    }
    generateTypeDeclaration() {
        return ["import { Schema } from '@aws-amplify/datastore';", '', 'export declare const schema: Schema;'].join('\n');
    }
    generateJSONMetaData() {
        const metaData = this.generateMetaData();
        return JSON.stringify(metaData, null, 4);
    }
    generateMetaData() {
        const result = {
            models: {},
            enums: {},
            version: this.computeVersion(),
        };
        Object.entries(this.getSelectedModels()).forEach(([name, obj]) => {
            const model = {
                syncable: true,
                name: this.getModelName(obj),
                attributes: this.generateAttributes(obj.directives),
                fields: obj.fields.reduce((acc, field) => {
                    acc[this.getFieldName(field)] = {
                        name: this.getFieldName(field),
                        targetName: field.name,
                        isArray: field.isList,
                        type: this.getType(field.type),
                        isRequired: !field.isNullable,
                        attributes: this.generateAttributes(field.directives),
                    };
                    return acc;
                }, {}),
            };
            result.models[obj.name] = model;
        });
        Object.entries(this.enumMap).forEach(([name, enumObj]) => {
            const enumV = {
                name,
                values: Object.values(enumObj.values),
            };
            result.enums[this.getEnumName(enumObj)] = enumV;
        });
        return result;
    }
    generateAttributes(directives) {
        return directives.map(d => ({
            type: d.name,
            properties: d.arguments,
        }));
    }
    getType(gqlType) {
        // Todo: Handle unlisted scalars
        if (gqlType in JSONGraphQLScalarType) {
            return JSONGraphQLScalarType[gqlType];
        }
        if (gqlType in this.enumMap) {
            return { enum: this.enumMap[gqlType].name };
        }
        return { model: gqlType };
    }
}
exports.AppSyncJSONVisitor = AppSyncJSONVisitor;
//# sourceMappingURL=appsync-json-metadata-visitor.js.map