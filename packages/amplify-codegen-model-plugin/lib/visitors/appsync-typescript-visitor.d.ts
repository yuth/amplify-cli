import { AppSyncModelVisitor, CodeGenEnum, CodeGenField, CodeGenModel, ParsedAppSyncModelConfig, RawAppSyncModelConfig } from './appsync-visitor';
export interface RawAppSyncModelTypeScriptConfig extends RawAppSyncModelConfig {
}
export interface ParsedAppSyncModelTypeScriptConfig extends ParsedAppSyncModelConfig {
    isDeclaration: boolean;
}
export declare class AppSyncModelTypeScriptVisitor<TRawConfig extends RawAppSyncModelTypeScriptConfig = RawAppSyncModelTypeScriptConfig, TPluginConfig extends ParsedAppSyncModelTypeScriptConfig = ParsedAppSyncModelTypeScriptConfig> extends AppSyncModelVisitor<TRawConfig, TPluginConfig> {
    protected SCALAR_TYPE_MAP: {
        [key: string]: string;
    };
    protected IMPORT_STATEMENTS: string[];
    generate(): string;
    protected generateImports(): string;
    protected generateEnumDeclarations(enumObj: CodeGenEnum, exportEnum?: boolean): string;
    /**
     *
     * @param modelObj CodeGenModel object
     * @param isDeclaration flag indicates if the class needs to be exported
     */
    protected generateModelDeclaration(modelObj: CodeGenModel, isDeclaration?: boolean): string;
    /**
     * Generate model Declaration using classCreator
     * @param model
     */
    protected generateModelInitialization(models: CodeGenModel[], includeTypeInfo?: boolean): string;
    protected generateExports(models: CodeGenModel[]): string;
    /**
     * Generate the type declaration class name of Model
     * @param model CodeGenModel
     */
    protected generateModelTypeDeclarationName(model: CodeGenModel): string;
    /**
     * Generate alias for the model used when importing it from initSchema
     * @param model
     */
    protected generateModelImportAlias(model: CodeGenModel): string;
    /**
     * Generate the import name for model from initSchema
     * @param model Model object
     *
     */
    protected generateModelImportName(model: CodeGenModel): string;
    /**
     * Generate the class name for export
     * @param model
     */
    protected generateModelExportName(model: CodeGenModel): string;
    protected getListType(typeStr: string): string;
    protected getNativeType(field: CodeGenField): string;
}
//# sourceMappingURL=appsync-typescript-visitor.d.ts.map