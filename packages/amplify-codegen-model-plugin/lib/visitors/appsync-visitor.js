"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const visitor_plugin_common_1 = require("@graphql-codegen/visitor-plugin-common");
const change_case_1 = require("change-case");
const crypto = require("crypto");
const graphql_1 = require("graphql");
const get_type_info_1 = require("../utils/get-type-info");
const sort_1 = require("../utils/sort");
var CodeGenGenerateEnum;
(function (CodeGenGenerateEnum) {
    CodeGenGenerateEnum["metadata"] = "metadata";
    CodeGenGenerateEnum["code"] = "code";
    CodeGenGenerateEnum["loader"] = "loader";
})(CodeGenGenerateEnum = exports.CodeGenGenerateEnum || (exports.CodeGenGenerateEnum = {}));
class AppSyncModelVisitor extends visitor_plugin_common_1.BaseVisitor {
    constructor(_schema, rawConfig, additionalConfig, defaultScalars = visitor_plugin_common_1.DEFAULT_SCALARS) {
        super(rawConfig, Object.assign(Object.assign({}, additionalConfig), { scalars: visitor_plugin_common_1.buildScalars(_schema, rawConfig.scalars || '', defaultScalars) }));
        this._schema = _schema;
        this.READ_ONLY_FIELDS = ['id'];
        this.SCALAR_TYPE_MAP = {};
        this.typeMap = {};
        this.enumMap = {};
        this.typesToSkip = [];
        const typesUsedInDirectives = [];
        if (rawConfig.directives) {
            const directiveSchema = graphql_1.parse(rawConfig.directives);
            directiveSchema.definitions.forEach((definition) => {
                if (definition.kind === graphql_1.Kind.ENUM_TYPE_DEFINITION || definition.kind === graphql_1.Kind.INPUT_OBJECT_TYPE_DEFINITION) {
                    typesUsedInDirectives.push(definition.name.value);
                }
            });
        }
        this.typesToSkip = [this._schema.getQueryType(), this._schema.getMutationType(), this._schema.getSubscriptionType()]
            .filter(t => t)
            .map(t => (t && t.name) || '');
        this.typesToSkip.push(...typesUsedInDirectives);
    }
    ObjectTypeDefinition(node, index, parent) {
        if (this.typesToSkip.includes(node.name.value)) {
            // Skip Query, mutation and subscription type
            return;
        }
        const directives = this.getDirectives(node.directives);
        if (directives.find(directive => directive.name === 'model')) {
            const fields = node.fields;
            // Todo: Add validation for each directives
            // @model would add the id: ID! if missing or throw error if there is an id of different type
            // @key check if fields listed in directives are present in the Object
            //
            const model = {
                name: this.convertName(node),
                type: 'model',
                directives,
                fields,
            };
            this.ensureIdField(model);
            this.typeMap[node.name.value] = model;
        }
    }
    FieldDefinition(node) {
        const directive = this.getDirectives(node.directives);
        return Object.assign({ name: node.name.value, directives: directive }, get_type_info_1.getTypeInfo(node.type, this._schema));
    }
    EnumTypeDefinition(node) {
        if (this.typesToSkip.includes(node.name.value)) {
            // Skip Query, mutation and subscription type and additional
            return;
        }
        const enumName = this.getEnumName(node.name.value);
        const values = node.values
            ? node.values.reduce((acc, val) => {
                acc[this.getEnumValue(val.name.value)] = val.name.value;
                return acc;
            }, {})
            : {};
        this.enumMap[node.name.value] = {
            name: enumName,
            type: 'enum',
            values,
        };
    }
    getDirectives(directives) {
        if (directives) {
            return directives.map(d => ({
                name: d.name.value,
                arguments: this.getDirectiveArguments(d),
            }));
        }
        return [];
    }
    getDirectiveArguments(directive) {
        const directiveArguments = {};
        if (directive.arguments) {
            directive.arguments.reduce((acc, arg) => {
                directiveArguments[arg.name.value] = graphql_1.valueFromASTUntyped(arg.value);
                return directiveArguments;
            }, directiveArguments);
        }
        return directiveArguments;
    }
    /**
     * Returns an object that contains all the models that need codegen to be run
     *
     */
    getSelectedModels() {
        if (this._parsedConfig.selectedType) {
            const selectedModel = this.typeMap[this._parsedConfig.selectedType];
            return selectedModel ? { [this._parsedConfig.selectedType]: selectedModel } : {};
        }
        return this.typeMap;
    }
    getSelectedEnums() {
        if (this._parsedConfig.selectedType) {
            const selectedModel = this.enumMap[this._parsedConfig.selectedType];
            return selectedModel ? { [this._parsedConfig.selectedType]: selectedModel } : {};
        }
        return this.enumMap;
    }
    selectedTypeIsEnum() {
        if (this._parsedConfig && this._parsedConfig.selectedType) {
            if (this._parsedConfig.selectedType in this.enumMap) {
                return true;
            }
        }
        return false;
    }
    /**
     * returns the Java type or class name
     * @param field
     */
    getNativeType(field) {
        const typeName = field.type;
        let typeNameStr = '';
        if (typeName in this.scalars) {
            typeNameStr = this.scalars[typeName];
        }
        else if (this.isModelType(field)) {
            typeNameStr = this.getModelName(this.typeMap[typeName]);
        }
        else if (this.isEnumType(field)) {
            typeNameStr = this.getEnumName(this.enumMap[typeName]);
        }
        else {
            throw new Error(`Unknown type ${typeName} for field ${field.name}`);
        }
        return field.isList ? this.getListType(typeNameStr) : typeNameStr;
    }
    getListType(typeStr) {
        return `List<${typeStr}>`;
    }
    getFieldName(field) {
        return change_case_1.camelCase(field.name);
    }
    getEnumName(enumField) {
        if (typeof enumField === 'string') {
            return change_case_1.pascalCase(enumField);
        }
        return change_case_1.pascalCase(enumField.name);
    }
    getModelName(model) {
        return change_case_1.pascalCase(model.name);
    }
    getEnumValue(value) {
        return change_case_1.upperCase(value);
    }
    isEnumType(field) {
        const typeName = field.type;
        return typeName in this.enumMap;
    }
    isModelType(field) {
        const typeName = field.type;
        return typeName in this.typeMap;
    }
    computeVersion() {
        // Sort types
        const typeArr = [];
        Object.values(this.typeMap).forEach((obj) => {
            // include only key directive as we don't care about others for versioning
            const directives = obj.directives.filter(dir => dir.name === 'key');
            const fields = obj.fields
                .map((field) => {
                // include only connection field and type
                const fieldDirectives = field.directives.filter(field => field.name === 'connection');
                return {
                    name: field.name,
                    directives: fieldDirectives,
                    type: field.type,
                };
            })
                .sort((a, b) => sort_1.sortFields(a, b));
            typeArr.push({
                name: obj.name,
                directives,
                fields,
            });
        });
        typeArr.sort(sort_1.sortFields);
        return crypto
            .createHash('MD5')
            .update(JSON.stringify(typeArr))
            .digest()
            .toString('hex');
    }
    ensureIdField(model) {
        const idField = model.fields.find(field => field.name === 'id');
        if (idField) {
            if (idField.type !== 'ID') {
                throw new Error(`id field on ${model.name} should be of type ID`);
            }
            // Make id field required
            idField.isNullable = false;
        }
        else {
            model.fields.splice(0, 0, {
                name: 'id',
                type: 'ID',
                isNullable: false,
                isList: false,
                directives: [],
            });
        }
    }
}
exports.AppSyncModelVisitor = AppSyncModelVisitor;
//# sourceMappingURL=appsync-visitor.js.map