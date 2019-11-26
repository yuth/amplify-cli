"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const visitor_plugin_common_1 = require("@graphql-codegen/visitor-plugin-common");
const change_case_1 = require("change-case");
const swift_declaration_block_1 = require("../languages/swift-declaration-block");
const appsync_visitor_1 = require("./appsync-visitor");
const schemaTypeMap = {
    String: '.string',
    AWSDate: '.dateTime',
    AWSTime: '.dateTime',
    Boolean: '.bool',
};
class AppSyncSwiftVisitor extends appsync_visitor_1.AppSyncModelVisitor {
    constructor() {
        super(...arguments);
        this.modelExtensionImports = ['import Amplify', 'import Foundation'];
        this.imports = ['import Foundation'];
    }
    generate() {
        if (this._parsedConfig.generate === appsync_visitor_1.CodeGenGenerateEnum.metadata) {
            return this.generateSchema();
        }
        if (this._parsedConfig.generate === appsync_visitor_1.CodeGenGenerateEnum.loader) {
            return this.generateClassLoader();
        }
        if (this.selectedTypeIsEnum()) {
            return this.generateEnums();
        }
        return this.generateStruct();
    }
    generateStruct() {
        let result = [...this.imports, ''];
        Object.entries(this.getSelectedModels()).forEach(([name, obj]) => {
            const structBlock = new swift_declaration_block_1.SwiftDeclarationBlock()
                .withName(this.getModelName(obj))
                .access('public')
                .withProtocols(['Model']);
            Object.entries(obj.fields).forEach(([fieldName, field]) => {
                const fieldType = this.getNativeType(field);
                structBlock.addProperty(field.name, fieldType, undefined, 'public', {
                    optional: field.isNullable,
                    isList: field.isList,
                });
            });
            const initImpl = this.getInitBody(obj.fields);
            structBlock.addClassMethod('init', null, initImpl, obj.fields.map(field => ({
                name: this.getFieldName(field),
                type: this.getNativeType(field),
                value: field.name === 'id' ? 'UUID().uuidString' : undefined,
                flags: { optional: field.isNullable, isList: field.isList },
            })), 'public', {}, 'MARK: constructor');
            result.push(structBlock.string);
        });
        return result.join('\n');
    }
    generateEnums() {
        const result = [...this.imports, ''];
        Object.entries(this.getSelectedEnums()).forEach(([name, enumValue]) => {
            const enumDeclaration = new swift_declaration_block_1.SwiftDeclarationBlock()
                .asKind('enum')
                .access('public')
                .withProtocols(['String'])
                .withName(this.getEnumName(enumValue));
            Object.entries(enumValue.values).forEach(([name, value]) => {
                enumDeclaration.addEnumValue(name, value);
            });
            result.push(enumDeclaration.string);
        });
        return result.join('\n');
    }
    generateSchema() {
        let result = [...this.modelExtensionImports, ''];
        Object.entries(this.getSelectedModels())
            .filter(([_, m]) => m.type === 'model')
            .forEach(([_, model]) => {
            const schemaDeclarations = new swift_declaration_block_1.SwiftDeclarationBlock().asKind('extension').withName(this.getModelName(model));
            this.generateCodingKeys(this.getModelName(model), model, schemaDeclarations),
                this.generateModelSchema(this.getModelName(model), model, schemaDeclarations);
            result.push(schemaDeclarations.string);
        });
        return result.join('\n');
    }
    generateCodingKeys(name, model, extensionDeclaration) {
        const codingKeyEnum = new swift_declaration_block_1.SwiftDeclarationBlock()
            .asKind('enum')
            .access('public')
            .withName('CodingKeys')
            .withProtocols(['String', 'ModelKey'])
            .withComment('MARK: - CodingKeys');
        // AddEnums.name
        model.fields.forEach(field => codingKeyEnum.addEnumValue(this.getFieldName(field), field.name));
        extensionDeclaration.appendBlock(codingKeyEnum.string);
        // expose keys
        extensionDeclaration.addProperty('keys', '', 'CodingKeys.self', 'public', {
            static: true,
            variable: false,
        });
    }
    generateModelSchema(name, model, extensionDeclaration) {
        const keysName = change_case_1.lowerCaseFirst(model.name);
        const fields = model.fields.map(field => {
            return this.generateFieldSchema(field, keysName);
        });
        const closure = [
            '{ model in',
            `let ${keysName} = ${this.getModelName(model)}.keys`,
            '',
            'model.fields(',
            visitor_plugin_common_1.indentMultiline(fields.join(',\n')),
            ')',
            '}',
        ].join('\n');
        extensionDeclaration.addProperty('schema', '', `defineSchema ${visitor_plugin_common_1.indentMultiline(closure).trim()}`, 'public', { static: true, variable: false }, ' MARK: - ModelSchema');
    }
    generateClassLoader() {
        const structList = Object.values(this.typeMap).map(typeObj => {
            return `${this.getModelName(typeObj)}.self`;
        });
        const result = [...this.modelExtensionImports, ''];
        const classDeclaration = new swift_declaration_block_1.SwiftDeclarationBlock()
            .access('public')
            .withName('AmplifyModels')
            .asKind('class')
            .final()
            .withComment('Contains the set of classes that conforms to the `Model` protocol.');
        classDeclaration.addProperty('version', 'String', `"${this.computeVersion()}"`, 'public', { static: true });
        const impl = ['return [', visitor_plugin_common_1.indentMultiline(structList.join(',\n')), ']'].join('\n');
        classDeclaration.addClassMethod('get', '[Model.Type]', impl, undefined, 'public', { static: true });
        result.push(classDeclaration.string);
        return result.join('\n');
    }
    getInitBody(fields) {
        let result = fields.map(field => {
            return visitor_plugin_common_1.indent(`self.${field.name} = ${field.name}`);
        });
        return result.join('\n');
    }
    getListType(typeStr) {
        return `${typeStr}`;
    }
    generateFieldSchema(field, modelKeysName) {
        if (field.type === 'ID') {
            return `.id()`;
        }
        let ofType;
        const isEnumType = this.isEnumType(field);
        const isModelType = this.isModelType(field);
        if (field.isList) {
            ofType = `.collection(of: ${this.getSwiftModelTypeName(field)})`;
        }
        else {
            const typeName = this.getSwiftModelTypeName(field);
            if (isEnumType) {
                ofType = `.enum(${typeName})`;
            }
            else if (isModelType) {
                ofType = `.model(${typeName})`;
            }
            else {
                ofType = typeName;
            }
        }
        const name = `${modelKeysName}.${this.getFieldName(field)}`;
        const isRequired = field.isNullable ? '.optional' : '.required';
        const connection = this.getFieldConnection(field);
        const args = [`${name}`, `is: ${isRequired}`, `ofType: ${ofType}`, connection].filter(arg => arg).join(', ');
        return `.field(${args})`;
    }
    getSwiftModelTypeName(field) {
        if (this.isEnumType(field)) {
            return `${this.getEnumName(field.type)}.self`;
        }
        if (this.isModelType(field)) {
            return `${this.getModelName(this.typeMap[field.type])}.self`;
        }
        if (field.type in schemaTypeMap) {
            return schemaTypeMap[field.type];
        }
        // TODO: investigate if returning string is acceptable or should throw an exception
        return '.string';
    }
    getFieldConnection(field) {
        //connection
        const connectionDirective = field.directives.find(d => d.name === 'connection');
        if (connectionDirective) {
            const connectionArgs = Object.entries(connectionDirective.arguments).map(([name, value]) => {
                return `${name}: "${value}"`;
            });
            return `.connected(${connectionArgs.join(', ')})`;
        }
    }
    getEnumValue(value) {
        return change_case_1.camelCase(value);
    }
}
exports.AppSyncSwiftVisitor = AppSyncSwiftVisitor;
//# sourceMappingURL=appsync-swift-visitor.js.map