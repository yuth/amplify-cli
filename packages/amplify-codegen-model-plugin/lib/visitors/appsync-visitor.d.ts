import { BaseVisitor, NormalizedScalarsMap, ParsedConfig, RawConfig } from '@graphql-codegen/visitor-plugin-common';
import { EnumTypeDefinitionNode, FieldDefinitionNode, GraphQLNamedType, GraphQLSchema, ObjectTypeDefinitionNode } from 'graphql';
export declare enum CodeGenGenerateEnum {
    metadata = "metadata",
    code = "code",
    loader = "loader"
}
export interface RawAppSyncModelConfig extends RawConfig {
    /**
     * @name target
     * @type string
     * @description required, the language target for generated code
     *
     * @example
     * ```yml
     * generates:
     * Models:
     * config:
     *    target: 'swift'
     *  plugins:
     *    - amplify-codegen-appsync-model-plugin
     * ```
     * target: 'swift'| 'javascript'| 'typescript' | 'android' | 'metadata'
     */
    target: string;
    /**
     * @name modelName
     * @type string
     * @description optional, name of the model to which the code needs to be generated. Used only
     * when target is set to swift
     * @default undefined, this will generate code for all the models
     *
     * generates:
     * Models:
     * config:
     *    target: 'swift'
     *    model: Todo
     *  plugins:
     *    - amplify-codegen-appsync-model-plugin
     * ```
     */
    selectedType: string;
    /**
     * @name generate
     * @type string
     * @description optional, informs what needs to be generated.
     * type - Generate class or struct
     * metadata - Generate metadata used by swift and JS/TS
     * loader - Class/Struct loader used by swift or Java
     * @default code, this will generate non meta data code
     *
     * generates:
     * Models:
     * config:
     *    target: 'swift'
     *    model: Todo
     *    generate: 'metadata'
     *  plugins:
     *    - amplify-codegen-appsync-model-plugin
     * ```
     */
    generate: CodeGenGenerateEnum;
    /**
     * @name directives
     * @type string
     * @descriptions optional string which includes directive definition and types used by directives. The types defined in here won't make it to output
     */
    directives?: string;
}
export interface ParsedAppSyncModelConfig extends ParsedConfig {
    selectedType?: string;
    generate?: CodeGenGenerateEnum;
}
export declare type CodeGenArgumentsMap = {
    [argumentName: string]: any;
};
export declare type CodeGenDirective = {
    name: string;
    arguments: CodeGenArgumentsMap;
};
export declare type CodeGenDirectives = CodeGenDirective[];
export declare type CodeGenField = TypeInfo & {
    name: string;
    directives: CodeGenDirectives;
};
export declare type TypeInfo = {
    type: string;
    isList: boolean;
    isNullable: boolean;
    baseType?: GraphQLNamedType | null;
};
export declare type CodeGenModel = {
    name: string;
    type: 'model';
    directives: CodeGenDirectives;
    fields: CodeGenField[];
};
export declare type CodeGenEnum = {
    name: string;
    type: 'enum';
    values: CodeGenEnumValueMap;
};
export declare type CodeGenModelMap = {
    [modelName: string]: CodeGenModel;
};
export declare type CodeGenEnumValueMap = {
    [enumConvertedName: string]: string;
};
export declare type CodeGenEnumMap = Record<string, CodeGenEnum>;
export declare abstract class AppSyncModelVisitor<TRawConfig extends RawAppSyncModelConfig = RawAppSyncModelConfig, TPluginConfig extends ParsedAppSyncModelConfig = ParsedAppSyncModelConfig> extends BaseVisitor<TRawConfig, TPluginConfig> {
    protected _schema: GraphQLSchema;
    protected READ_ONLY_FIELDS: string[];
    protected SCALAR_TYPE_MAP: Record<string, string>;
    protected typeMap: CodeGenModelMap;
    protected enumMap: CodeGenEnumMap;
    protected typesToSkip: string[];
    constructor(_schema: GraphQLSchema, rawConfig: TRawConfig, additionalConfig: Partial<TPluginConfig>, defaultScalars?: NormalizedScalarsMap);
    ObjectTypeDefinition(node: ObjectTypeDefinitionNode, index?: string | number, parent?: any): void;
    FieldDefinition(node: FieldDefinitionNode): CodeGenField;
    EnumTypeDefinition(node: EnumTypeDefinitionNode): void;
    abstract generate(): string;
    private getDirectives;
    private getDirectiveArguments;
    /**
     * Returns an object that contains all the models that need codegen to be run
     *
     */
    protected getSelectedModels(): CodeGenModelMap;
    protected getSelectedEnums(): CodeGenEnumMap;
    protected selectedTypeIsEnum(): boolean;
    /**
     * returns the Java type or class name
     * @param field
     */
    protected getNativeType(field: CodeGenField): string;
    protected getListType(typeStr: string): string;
    protected getFieldName(field: CodeGenField): string;
    protected getEnumName(enumField: CodeGenEnum | string): string;
    protected getModelName(model: CodeGenModel): string;
    protected getEnumValue(value: string): string;
    protected isEnumType(field: CodeGenField): boolean;
    protected isModelType(field: CodeGenField): boolean;
    protected computeVersion(): string;
    protected ensureIdField(model: CodeGenModel): void;
}
//# sourceMappingURL=appsync-visitor.d.ts.map