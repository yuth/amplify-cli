import { JavaDeclarationBlock } from '@graphql-codegen/java-common';
import { AppSyncModelVisitor, CodeGenField, CodeGenModel, ParsedAppSyncModelConfig, RawAppSyncModelConfig } from './appsync-visitor';
export declare class AppSyncModelJavaVisitor<TRawConfig extends RawAppSyncModelConfig = RawAppSyncModelConfig, TPluginConfig extends ParsedAppSyncModelConfig = ParsedAppSyncModelConfig> extends AppSyncModelVisitor<TRawConfig, TPluginConfig> {
    protected additionalPackages: Set<string>;
    generate(): string;
    generateEnums(): string;
    generateClasses(): string;
    generatePackageName(): string;
    generateClass(model: CodeGenModel): string;
    protected generatePackageHeader(): string;
    /**
     * Add fields as members of the class
     * @param field
     * @param classDeclarationBlock
     */
    protected generateField(field: CodeGenField, classDeclarationBlock: JavaDeclarationBlock): void;
    protected generateStepBuilderInterfaces(model: CodeGenModel): JavaDeclarationBlock[];
    /**
     * Generate the Builder class
     * @param model
     * @returns JavaDeclarationBlock
     */
    protected generateBuilderClass(model: CodeGenModel, classDeclaration: JavaDeclarationBlock): void;
    /**
     * Generate getters for all the fields declared in the model. All the getter methods are added
     * to the declaration block passed
     * @param model
     * @param declarationsBlock
     */
    protected generateGetters(model: CodeGenModel, declarationsBlock: JavaDeclarationBlock): void;
    /**
     * Generate constructor for the class
     * @param model CodeGenModel
     * @param declarationsBlock Class Declaration block to which constructor will be added
     */
    protected generateConstructor(model: CodeGenModel, declarationsBlock: JavaDeclarationBlock): void;
    protected getNativeType(field: CodeGenField): string;
    /**
     * Generate the name of the step builder interface
     * @param nextFieldName: string
     * @returns string
     */
    private getStepInterfaceName;
    protected generateModelAnnotations(model: CodeGenModel): string[];
    protected generateFieldAnnotations(field: CodeGenField): string[];
}
//# sourceMappingURL=appsync-java-visitor.d.ts.map