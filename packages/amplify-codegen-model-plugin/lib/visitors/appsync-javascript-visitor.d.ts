import { NormalizedScalarsMap } from '@graphql-codegen/visitor-plugin-common';
import { GraphQLSchema } from 'graphql';
import { AppSyncModelTypeScriptVisitor } from './appsync-typescript-visitor';
import { CodeGenEnum, CodeGenModel, ParsedAppSyncModelConfig, RawAppSyncModelConfig } from './appsync-visitor';
export interface RawAppSyncModelJavaScriptConfig extends RawAppSyncModelConfig {
    /**
     * @name isDeclaration
     * @type boolean
     * @description required, the language target for generated code
     *
     * @example
     * ```yml
     * generates:
     * Models:
     * config:
     *    target: 'javascript'
     *    isDelcaration: true
     *  plugins:
     *    - amplify-codegen-appsync-model-plugin
     * ```
     * isDeclaration: true| false
     */
    isDeclaration?: boolean;
}
export interface ParsedAppSyncModelJavaScriptConfig extends ParsedAppSyncModelConfig {
    isDeclaration: boolean;
}
export declare class AppSyncModelJavascriptVisitor<TRawConfig extends RawAppSyncModelJavaScriptConfig = RawAppSyncModelJavaScriptConfig, TPluginConfig extends ParsedAppSyncModelJavaScriptConfig = ParsedAppSyncModelJavaScriptConfig> extends AppSyncModelTypeScriptVisitor<TRawConfig, TPluginConfig> {
    protected IMPORT_STATEMENTS: string[];
    constructor(schema: GraphQLSchema, rawConfig: TRawConfig, additionalConfig: Partial<TPluginConfig>, defaultScalars?: NormalizedScalarsMap);
    generate(): string;
    /**
     * Generate JavaScript object for enum. The generated objet. For an enum with value
     * enum status {
     * pending
     * done
     * }
     * the generated object would be
     * const Status = {
     *    "PENDING": "pending",
     *    "DONE": "done",
     * }
     * @param enumObj: CodeGenEnun codegen enum object
     * @param exportEnum: boolean export the enum object
     */
    protected generateEnumObject(enumObj: CodeGenEnum, exportEnum?: boolean): string;
    /**
     * Generate import statements to be used in the JavaScript model file
     */
    protected generateImportsJavaScriptImplementation(): string;
    protected generateModelTypeDeclarationName(model: CodeGenModel): string;
}
//# sourceMappingURL=appsync-javascript-visitor.d.ts.map