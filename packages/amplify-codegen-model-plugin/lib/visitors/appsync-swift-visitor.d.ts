import { SwiftDeclarationBlock } from '../languages/swift-declaration-block';
import { AppSyncModelVisitor, CodeGenModel } from './appsync-visitor';
export declare class AppSyncSwiftVisitor extends AppSyncModelVisitor {
    protected modelExtensionImports: string[];
    protected imports: string[];
    generate(): string;
    generateStruct(): string;
    generateEnums(): string;
    generateSchema(): string;
    generateCodingKeys(name: string, model: CodeGenModel, extensionDeclaration: SwiftDeclarationBlock): void;
    generateModelSchema(name: string, model: CodeGenModel, extensionDeclaration: SwiftDeclarationBlock): void;
    protected generateClassLoader(): string;
    private getInitBody;
    protected getListType(typeStr: string): string;
    private generateFieldSchema;
    private getSwiftModelTypeName;
    private getFieldConnection;
    protected getEnumValue(value: string): string;
}
//# sourceMappingURL=appsync-swift-visitor.d.ts.map