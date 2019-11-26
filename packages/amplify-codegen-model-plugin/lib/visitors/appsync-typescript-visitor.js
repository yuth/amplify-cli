"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const visitor_plugin_common_1 = require("@graphql-codegen/visitor-plugin-common");
const typescript_declaration_block_1 = require("../languages/typescript-declaration-block");
const appsync_visitor_1 = require("./appsync-visitor");
class AppSyncModelTypeScriptVisitor extends appsync_visitor_1.AppSyncModelVisitor {
    constructor() {
        super(...arguments);
        this.SCALAR_TYPE_MAP = {
            String: 'string',
            Int: 'number',
            Float: 'number',
            Boolean: 'boolean',
            ID: 'string',
        };
        this.IMPORT_STATEMENTS = [
            'import { ModelInit, MutableModel, PersistentModelConstructor } from "@aws-amplify/datastore";',
            'import { initSchema } from "@aws-amplify/datastore";',
            '',
            'import { schema } from "./schema";',
        ];
    }
    generate() {
        const imports = this.generateImports();
        const enumDeclarations = Object.values(this.enumMap)
            .map(enumObj => this.generateEnumDeclarations(enumObj))
            .join('\n\n');
        const modelDeclarations = Object.values(this.typeMap)
            .map(typeObj => this.generateModelDeclaration(typeObj))
            .join('\n\n');
        const modelInitialization = this.generateModelInitialization(Object.values(this.typeMap));
        const modelExports = this.generateExports(Object.values(this.typeMap));
        return [imports, '', enumDeclarations, '', modelDeclarations, '', modelInitialization, '', modelExports].join('\n');
    }
    generateImports() {
        return this.IMPORT_STATEMENTS.join('\n');
    }
    generateEnumDeclarations(enumObj, exportEnum = false) {
        const enumDeclarations = new typescript_declaration_block_1.TypeScriptDeclarationBlock()
            .asKind('enum')
            .withName(this.getEnumName(enumObj))
            .withEnumValues(enumObj.values)
            .export(exportEnum);
        return enumDeclarations.string;
    }
    /**
     *
     * @param modelObj CodeGenModel object
     * @param isDeclaration flag indicates if the class needs to be exported
     */
    generateModelDeclaration(modelObj, isDeclaration = true) {
        const modelName = this.generateModelTypeDeclarationName(modelObj);
        const modelDeclarations = new typescript_declaration_block_1.TypeScriptDeclarationBlock()
            .asKind('class')
            .withFlag({ isDeclaration })
            .withName(modelName)
            .export(true);
        modelObj.fields.forEach((field) => {
            modelDeclarations.addProperty(this.getFieldName(field), this.getNativeType(field), undefined, 'DEFAULT', {
                readonly: true,
                optional: field.isNullable,
            });
        });
        // Constructor
        modelDeclarations.addClassMethod('constructor', null, null, [
            {
                name: 'init',
                type: `ModelInit<${modelName}>`,
            },
        ], 'DEFAULT', {});
        // copyOf method
        modelDeclarations.addClassMethod('copyOf', modelName, null, [
            {
                name: 'source',
                type: modelName,
            },
            {
                name: 'mutator',
                type: `(draft: MutableModel<${modelName}>) => MutableModel<${modelName}> | void`,
            },
        ], 'DEFAULT', { static: true });
        return modelDeclarations.string;
    }
    /**
     * Generate model Declaration using classCreator
     * @param model
     */
    generateModelInitialization(models, includeTypeInfo = true) {
        if (models.length === 0) {
            return '';
        }
        const modelClasses = models
            .map(model => [this.generateModelImportName(model), this.generateModelImportAlias(model)])
            .map(([importName, aliasName]) => {
            return importName === aliasName ? importName : `${importName}: ${aliasName}`;
        });
        const initializationResult = ['const', '{', modelClasses.join(', '), '}', '=', 'initSchema(schema)'];
        if (includeTypeInfo) {
            const typeInfo = models
                .map(model => {
                return [this.generateModelImportName(model), this.generateModelTypeDeclarationName(model)];
            })
                .map(([importName, modelDeclarationName]) => `${importName}: PersistentModelConstructor<${modelDeclarationName}>;`);
            const typeInfoStr = ['{', visitor_plugin_common_1.indentMultiline(typeInfo.join('\n')), '}'].join('\n');
            initializationResult.push('as', typeInfoStr);
        }
        return `${initializationResult.join(' ')};`;
    }
    generateExports(models) {
        const exportStr = models
            .map(model => {
            const modelClassName = this.generateModelImportAlias(model);
            const exportClassName = this.getModelName(model);
            return modelClassName !== exportClassName ? `${modelClassName} as ${exportClassName}` : modelClassName;
        })
            .join(',\n');
        return ['export {', visitor_plugin_common_1.indentMultiline(exportStr), '};'].join('\n');
    }
    /**
     * Generate the type declaration class name of Model
     * @param model CodeGenModel
     */
    generateModelTypeDeclarationName(model) {
        return `${this.getModelName(model)}Model`;
    }
    /**
     * Generate alias for the model used when importing it from initSchema
     * @param model
     */
    generateModelImportAlias(model) {
        return this.getModelName(model);
    }
    /**
     * Generate the import name for model from initSchema
     * @param model Model object
     *
     */
    generateModelImportName(model) {
        return this.getModelName(model);
    }
    /**
     * Generate the class name for export
     * @param model
     */
    generateModelExportName(model) {
        return this.getModelName(model);
    }
    getListType(typeStr) {
        return `${typeStr}[]`;
    }
    getNativeType(field) {
        const typeName = field.type;
        if (this.isModelType(field)) {
            const modelType = this.typeMap[typeName];
            return this.generateModelTypeDeclarationName(modelType);
        }
        let nativeType = super.getNativeType(field);
        if (this.isEnumType(field)) {
            nativeType = `${nativeType} | keyof typeof ${this.getEnumName(this.enumMap[typeName])}`;
        }
        return nativeType;
    }
}
exports.AppSyncModelTypeScriptVisitor = AppSyncModelTypeScriptVisitor;
//# sourceMappingURL=appsync-typescript-visitor.js.map