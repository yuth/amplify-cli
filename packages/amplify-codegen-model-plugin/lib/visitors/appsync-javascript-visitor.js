"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const visitor_plugin_common_1 = require("@graphql-codegen/visitor-plugin-common");
const appsync_typescript_visitor_1 = require("./appsync-typescript-visitor");
class AppSyncModelJavascriptVisitor extends appsync_typescript_visitor_1.AppSyncModelTypeScriptVisitor {
    constructor(schema, rawConfig, additionalConfig, defaultScalars = visitor_plugin_common_1.DEFAULT_SCALARS) {
        super(schema, rawConfig, additionalConfig, defaultScalars);
        this.IMPORT_STATEMENTS = ['import { ModelInit, MutableModel, PersistentModelConstructor } from "@aws-amplify/datastore";'];
        this._parsedConfig.isDeclaration = rawConfig.isDeclaration || false;
    }
    generate() {
        if (this._parsedConfig.isDeclaration) {
            const imports = this.generateImports();
            const enumDeclarations = Object.values(this.enumMap)
                .map(enumObj => this.generateEnumDeclarations(enumObj, true))
                .join('\n\n');
            const modelDeclarations = Object.values(this.typeMap)
                .map(typeObj => this.generateModelDeclaration(typeObj, true))
                .join('\n\n');
            return [imports, '', enumDeclarations, '', modelDeclarations].join('\n');
        }
        else {
            const imports = this.generateImportsJavaScriptImplementation();
            const enumDeclarations = Object.values(this.enumMap)
                .map((e) => this.generateEnumObject(e))
                .join('\n');
            const modelInitialization = this.generateModelInitialization(Object.values(this.typeMap), false);
            const modelExports = this.generateExports(Object.values(this.typeMap));
            return [imports, '', enumDeclarations, '', modelInitialization, '', modelExports].join('\n');
        }
    }
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
    generateEnumObject(enumObj, exportEnum = false) {
        const enumName = this.getEnumName(enumObj);
        const header = [exportEnum ? 'export' : null, 'const', enumName].filter(h => h).join(' ');
        return `${header} = ${JSON.stringify(enumObj.values, null, 2)};`;
    }
    /**
     * Generate import statements to be used in the JavaScript model file
     */
    generateImportsJavaScriptImplementation() {
        return ['// @ts-check', "import { initSchema } from '@aws-amplify/datastore';", "import { schema } from './schema';"].join('\n');
    }
    generateModelTypeDeclarationName(model) {
        return `${this.getModelName(model)}`;
    }
}
exports.AppSyncModelJavascriptVisitor = AppSyncModelJavascriptVisitor;
//# sourceMappingURL=appsync-javascript-visitor.js.map