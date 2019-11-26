import { NormalizedScalarsMap } from '@graphql-codegen/visitor-plugin-common';
import { GraphQLSchema } from 'graphql';
import { AppSyncModelVisitor, ParsedAppSyncModelConfig, RawAppSyncModelConfig } from './appsync-visitor';
declare type JSONSchema = {
    models: JSONSchemaModels;
    enums: JSONSchemaEnums;
    version: string;
};
declare type JSONSchemaModels = Record<string, JSONSchemaModel>;
declare type JSONSchemaModel = {
    name: string;
    attributes?: JSONModelAttributes;
    fields: JSONModelFields;
    syncable?: boolean;
};
declare type JSONSchemaEnums = Record<string, JSONSchemaEnum>;
declare type JSONSchemaEnum = {
    name: string;
    values: string[];
};
declare type JSONModelAttributes = JSONModelAttribute[];
declare type JSONModelAttribute = {
    type: string;
    properties?: Record<string, any>;
};
declare type JSONModelFields = Record<string, JSONModelField>;
declare enum JSONGraphQLScalarType {
    ID = "ID",
    String = "String",
    Int = "Int",
    Float = "Float",
    Boolean = "Boolean"
}
declare type JSONModelFieldType = JSONGraphQLScalarType | keyof typeof JSONGraphQLScalarType | {
    model: string;
} | {
    enum: string;
};
declare type JSONModelField = {
    name: string;
    targetName: string;
    type: JSONModelFieldType;
    isArray: boolean;
    isRequired?: boolean;
    attributes?: JSONModelFieldAttributes;
};
declare type JSONModelFieldAttributes = JSONModelFieldAttribute[];
declare type JSONModelFieldAttribute = JSONModelAttribute;
export interface RawAppSyncModelMetadataConfig extends RawAppSyncModelConfig {
    /**
     * @name metaDataTarget
     * @type string
     * @description required, the language target for generated code
     *
     * @example
     * ```yml
     * generates:
     * Models:
     * config:
     *    target: 'metadata'
     *    metaDataTarget: 'typescript'
     *  plugins:
     *    - amplify-codegen-appsync-model-plugin
     * ```
     * metaDataTarget: 'javascript'| 'typescript'
     */
    metaDataTarget?: string;
}
export interface ParsedAppSyncModelMetadataConfig extends ParsedAppSyncModelConfig {
    metaDataTarget: string;
}
export declare class AppSyncJSONVisitor<TRawConfig extends RawAppSyncModelMetadataConfig = RawAppSyncModelMetadataConfig, TPluginConfig extends ParsedAppSyncModelMetadataConfig = ParsedAppSyncModelMetadataConfig> extends AppSyncModelVisitor<TRawConfig, TPluginConfig> {
    constructor(schema: GraphQLSchema, rawConfig: TRawConfig, additionalConfig: Partial<TPluginConfig>, defaultScalars?: NormalizedScalarsMap);
    generate(): string;
    protected generateTypeScriptMetaData(): string;
    protected generateJavaScriptMetaData(): string;
    protected generateTypeDeclaration(): string;
    protected generateJSONMetaData(): string;
    protected generateMetaData(): JSONSchema;
    private generateAttributes;
    private getType;
}
export {};
//# sourceMappingURL=appsync-json-metadata-visitor.d.ts.map