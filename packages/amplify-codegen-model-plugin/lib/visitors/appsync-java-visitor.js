"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const java_common_1 = require("@graphql-codegen/java-common");
const visitor_plugin_common_1 = require("@graphql-codegen/visitor-plugin-common");
const change_case_1 = require("change-case");
const util_1 = require("util");
const appsync_visitor_1 = require("./appsync-visitor");
// Fields which can not be using builder,
const IMPORT_PKGS = [
    'java.util.List',
    'java.util.UUID',
    'java.util.Objects',
    '',
    'com.amplifyframework.datastore.annotations.Connection',
    'com.amplifyframework.datastore.annotations.Field',
    'com.amplifyframework.datastore.annotations.Index',
    'com.amplifyframework.datastore.model.Model',
    '',
];
const ENUN_IMPORT_PKGS = ['import com.google.gson.annotations.SerializedName;', ''];
const PKG_NAME = 'com.amplify.datastore.generated';
class AppSyncModelJavaVisitor extends appsync_visitor_1.AppSyncModelVisitor {
    constructor() {
        super(...arguments);
        this.additionalPackages = new Set();
    }
    generate() {
        if (this.selectedTypeIsEnum()) {
            return this.generateEnums();
        }
        return this.generateClasses();
    }
    generateEnums() {
        const result = [this.generatePackageName(), ...ENUN_IMPORT_PKGS];
        Object.entries(this.getSelectedEnums()).forEach(([name, enumValue]) => {
            const enumDeclaration = new java_common_1.JavaDeclarationBlock()
                .asKind('enum')
                .access('public')
                .withName(this.getEnumName(enumValue));
            const body = Object.entries(enumValue.values).map(([name, value]) => {
                return `@SerializedName("${value}")\n${name}`;
            });
            enumDeclaration.withBlock(visitor_plugin_common_1.indentMultiline(body.join(',\n') + ';'));
            result.push(enumDeclaration.string);
        });
        return result.join('\n');
    }
    generateClasses() {
        const result = [];
        Object.entries(this.getSelectedModels()).forEach(([name, model]) => {
            const modelDeclaration = this.generateClass(model);
            result.push(...[modelDeclaration]);
        });
        const packageDeclaration = this.generatePackageHeader();
        return [packageDeclaration, ...result].join('\n');
    }
    generatePackageName() {
        return `package ${PKG_NAME};`;
    }
    generateClass(model) {
        const classDeclarationBlock = new java_common_1.JavaDeclarationBlock()
            .asKind('class')
            .access('public')
            .withName(model.name)
            .implements(['Model'])
            .final();
        const annotations = this.generateModelAnnotations(model);
        classDeclarationBlock.annotate(annotations);
        model.fields.forEach(field => {
            this.generateField(field, classDeclarationBlock);
        });
        // step interface declarations
        this.generateStepBuilderInterfaces(model).forEach((builderInterface) => {
            classDeclarationBlock.nestedClass(builderInterface);
        });
        // builder
        this.generateBuilderClass(model, classDeclarationBlock);
        // getters
        this.generateGetters(model, classDeclarationBlock);
        // constructor
        this.generateConstructor(model, classDeclarationBlock);
        return classDeclarationBlock.string;
    }
    generatePackageHeader() {
        const imports = [...Array.from(this.additionalPackages), '', ...IMPORT_PKGS].map(pkg => (pkg ? `import ${pkg};` : ''));
        return [this.generatePackageName(), '', ...imports].join('\n');
    }
    /**
     * Add fields as members of the class
     * @param field
     * @param classDeclarationBlock
     */
    generateField(field, classDeclarationBlock) {
        const annotations = this.generateFieldAnnotations(field);
        const fieldType = this.getNativeType(field);
        const fieldName = this.getFieldName(field);
        classDeclarationBlock.addClassMember(fieldName, fieldType, '', annotations, 'private', {
            final: true,
        });
    }
    generateStepBuilderInterfaces(model) {
        const nonNullableFields = model.fields.filter(field => !field.isNullable);
        const nullableFields = model.fields.filter(field => field.isNullable);
        const nonIdFields = nonNullableFields.filter((field) => !this.READ_ONLY_FIELDS.includes(field.name));
        const interfaces = nonIdFields.map((field, idx) => {
            const fieldName = this.getFieldName(field);
            const isLastField = nonIdFields.length - 1 === idx ? true : false;
            const returnType = isLastField ? 'Build' : nonIdFields[idx + 1].name;
            const interfaceName = this.getStepInterfaceName(field.name);
            const interfaceDeclaration = new java_common_1.JavaDeclarationBlock()
                .asKind('interface')
                .withName(interfaceName)
                .access('public');
            interfaceDeclaration.withBlock(visitor_plugin_common_1.indent(`${this.getStepInterfaceName(returnType)} ${fieldName}(${this.getNativeType(field)} ${fieldName});`));
            return interfaceDeclaration;
        });
        // Builder
        const builder = new java_common_1.JavaDeclarationBlock()
            .asKind('interface')
            .withName(this.getStepInterfaceName('Build'))
            .access('public');
        const builderBody = [];
        builderBody.push(`${this.getModelName(model)} build();`);
        nullableFields.forEach((field, idx) => {
            const fieldName = this.getFieldName(field);
            builderBody.push(`${this.getStepInterfaceName('Build')} ${fieldName}(${this.getNativeType(field)} ${fieldName});`);
        });
        builder.withBlock(visitor_plugin_common_1.indentMultiline(builderBody.join('\n')));
        return [...interfaces, builder];
    }
    /**
     * Generate the Builder class
     * @param model
     * @returns JavaDeclarationBlock
     */
    generateBuilderClass(model, classDeclaration) {
        const nonNullableFields = model.fields.filter(field => !field.isNullable);
        const nullableFields = model.fields.filter(field => field.isNullable);
        const writeableFields = nullableFields.filter((field) => !this.READ_ONLY_FIELDS.includes(field.name));
        const stepInterfaces = writeableFields.map((field) => {
            return this.getStepInterfaceName(field.name);
        });
        const builderClassDeclaration = new java_common_1.JavaDeclarationBlock()
            .access('public')
            .static()
            .asKind('class')
            .withName('Builder')
            .implements([...stepInterfaces, this.getStepInterfaceName('Build')]);
        // Add private instance fields
        [...nonNullableFields, ...nullableFields].forEach((field) => {
            const fieldName = this.getFieldName(field);
            builderClassDeclaration.addClassMember(fieldName, this.getNativeType(field), '', undefined, 'private');
        });
        // methods
        // build();
        builderClassDeclaration.addClassMethod('build', this.getModelName(model), visitor_plugin_common_1.indentMultiline([`this.id = UUID.randomUUID().toString();`, `return new ${this.getModelName(model)}(this);`].join('\n')), undefined, [], 'public', {}, ['Override']);
        // non-nullable fields
        writeableFields.forEach((field, idx, fields) => {
            const isLastStep = idx === fields.length - 1;
            const fieldName = this.getFieldName(field);
            const returnType = isLastStep ? this.getStepInterfaceName('Build') : this.getStepInterfaceName(fields[idx + 1].name);
            const argumentType = this.getNativeType(field);
            const argumentName = fieldName;
            const body = [`Objects.requireNonNull(${fieldName});`, `this.${fieldName} = ${argumentName};`, `return this;`].join('\n');
            builderClassDeclaration.addClassMethod(fieldName, returnType, visitor_plugin_common_1.indentMultiline(body), [{ name: argumentName, type: argumentType }], [], 'public', {}, ['Override']);
        });
        // nullable fields
        nullableFields.forEach((field) => {
            const fieldName = this.getFieldName(field);
            const returnType = this.getStepInterfaceName('Build');
            const argumentType = this.getNativeType(field);
            const argumentName = fieldName;
            const body = [`this.${fieldName} = ${argumentName};`, `return this;`].join('\n');
            builderClassDeclaration.addClassMethod(fieldName, returnType, visitor_plugin_common_1.indentMultiline(body), [{ name: argumentName, type: argumentType }], [], 'public', {}, ['Override']);
        });
        classDeclaration.nestedClass(builderClassDeclaration);
    }
    /**
     * Generate getters for all the fields declared in the model. All the getter methods are added
     * to the declaration block passed
     * @param model
     * @param declarationsBlock
     */
    generateGetters(model, declarationsBlock) {
        model.fields.forEach((field) => {
            const fieldName = this.getFieldName(field);
            const returnType = this.getNativeType(field);
            const methodName = `get${change_case_1.pascalCase(field.name)}`;
            const body = visitor_plugin_common_1.indent(`return ${fieldName};`);
            declarationsBlock.addClassMethod(methodName, returnType, body, undefined, undefined, 'public');
        });
    }
    /**
     * Generate constructor for the class
     * @param model CodeGenModel
     * @param declarationsBlock Class Declaration block to which constructor will be added
     */
    generateConstructor(model, declarationsBlock) {
        const name = this.getModelName(model);
        const body = model.fields
            .map((field) => {
            const fieldName = this.getFieldName(field);
            return `this.${fieldName} = builder.${fieldName};`;
        })
            .join('\n');
        declarationsBlock.addClassMethod(name, null, body, [
            {
                name: 'builder',
                type: 'Builder',
            },
        ], undefined, 'private');
    }
    getNativeType(field) {
        const nativeType = super.getNativeType(field);
        if (nativeType.includes('.')) {
            const classSplit = nativeType.split('.');
            this.additionalPackages.add(nativeType);
            return classSplit[classSplit.length - 1];
        }
        return nativeType;
    }
    /**
     * Generate the name of the step builder interface
     * @param nextFieldName: string
     * @returns string
     */
    getStepInterfaceName(nextFieldName) {
        return `I${change_case_1.pascalCase(nextFieldName)}Step`;
    }
    generateModelAnnotations(model) {
        const annotations = model.directives.map(directive => {
            switch (directive.name) {
                case 'model':
                    return `ModelConfig(targetName = "${model.name}")`;
                    break;
                case 'key':
                    const args = [];
                    args.push(`name = "${directive.arguments.name}"`);
                    args.push(`fields = {${directive.arguments.fields.map((f) => `"${f}"`).join(',')}}`);
                    return `Index(${args.join(', ')})`;
                default:
                    break;
            }
            return '';
        });
        return annotations.filter(annotation => annotation);
    }
    generateFieldAnnotations(field) {
        const annotations = [];
        const annotationArgs = [
            `targetName="${field.name}"`,
            `targetType="${field.type}"`,
            !field.isNullable ? 'isRequired = true' : '',
        ].filter(arg => arg);
        annotations.push(`ModelField(${annotationArgs.join(', ')})`);
        field.directives.forEach(annotation => {
            switch (annotation.name) {
                case 'connection':
                    const connectionArgs = [];
                    Object.keys(annotation.arguments).forEach(argName => {
                        if (['name', 'keyField', 'sortField', 'keyName'].includes(argName)) {
                            connectionArgs.push(`${argName} = "${annotation.arguments[argName]}"`);
                        }
                    });
                    if (annotation.arguments.limit) {
                        connectionArgs.push(`limit = ${annotation.arguments.limit}`);
                    }
                    if (annotation.arguments.fields && util_1.isArray(annotation.arguments.fields)) {
                        const fieldArgs = annotation.arguments.fields.map(f => `"${f}"`).join(', ');
                        connectionArgs.push(`fields = {{${fieldArgs}}`);
                    }
                    if (connectionArgs.length) {
                        annotations.push(`Connection(${connectionArgs.join(', ')})`);
                    }
            }
        });
        return annotations;
    }
}
exports.AppSyncModelJavaVisitor = AppSyncModelJavaVisitor;
//# sourceMappingURL=appsync-java-visitor.js.map