"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const graphql_1 = require("graphql");
const path_1 = require("path");
const scalars_1 = require("./scalars");
const APPSYNC_DATA_STORE_CODEGEN_TARGETS = ['java', 'android', 'swift', 'ios', 'javascript', 'typescript'];
const JAVA_PACKAGE_NAME = 'com.amplify.datastore.generated';
const hasDirective = (directiveName) => (typeObj) => {
    if (typeObj && typeObj.directives && typeObj.directives.length) {
        return typeObj.directives.find(d => d.name.value === directiveName) !== undefined;
    }
    return false;
};
const generateJavaPreset = (options, models) => {
    const config = [];
    const baseOutputDir = [options.baseOutputDir, ...JAVA_PACKAGE_NAME.split('.')];
    models.forEach(model => {
        const modelName = model.name.value;
        config.push(Object.assign(Object.assign({}, options), { filename: path_1.join(...baseOutputDir, `${modelName}.java`), config: Object.assign(Object.assign({}, options.config), { scalars: Object.assign(Object.assign({}, scalars_1.JAVA_SCALAR_MAP), options.config.scalars), metadata: false, selectedType: modelName }) }));
    });
    return config;
};
const generateSwiftPreset = (options, models) => {
    const config = [];
    models.forEach(model => {
        const modelName = model.name.value;
        config.push(Object.assign(Object.assign({}, options), { filename: path_1.join(options.baseOutputDir, `${modelName}.swift`), config: Object.assign(Object.assign({}, options.config), { scalars: Object.assign(Object.assign({}, scalars_1.SWIFT_SCALAR_MAP), options.config.scalars), generate: 'code', selectedType: modelName }) }));
        if (model.kind !== graphql_1.Kind.ENUM_TYPE_DEFINITION) {
            config.push(Object.assign(Object.assign({}, options), { filename: path_1.join(options.baseOutputDir, `${modelName}+Schema.swift`), config: Object.assign(Object.assign({}, options.config), { target: 'swift', scalars: Object.assign(Object.assign({}, scalars_1.SWIFT_SCALAR_MAP), options.config.scalars), generate: 'metadata', selectedType: modelName }) }));
        }
    });
    // metadata
    config.push(Object.assign(Object.assign({}, options), { filename: path_1.join(options.baseOutputDir, `metadata.json`), config: Object.assign(Object.assign({}, options.config), { scalars: Object.assign(Object.assign({}, scalars_1.SWIFT_SCALAR_MAP), options.config.scalars), target: 'metadata' }) }));
    // class loader
    config.push(Object.assign(Object.assign({}, options), { filename: path_1.join(options.baseOutputDir, `AmplifyModels.swift`), config: Object.assign(Object.assign({}, options.config), { scalars: Object.assign(Object.assign({}, scalars_1.SWIFT_SCALAR_MAP), options.config.scalars), target: 'swift', generate: 'loader' }) }));
    return config;
};
const generateTypeScriptPreset = (options, models) => {
    const config = [];
    const modelFolder = path_1.join(options.baseOutputDir, 'models');
    config.push(Object.assign(Object.assign({}, options), { filename: path_1.join(modelFolder, 'index.ts'), config: Object.assign(Object.assign({}, options.config), { scalars: Object.assign(Object.assign({}, scalars_1.TYPESCRIPT_SCALAR_MAP), options.config.scalars), metadata: false }) }));
    // metadata
    config.push(Object.assign(Object.assign({}, options), { filename: path_1.join(modelFolder, 'schema.ts'), config: Object.assign(Object.assign({}, options.config), { scalars: Object.assign(Object.assign({}, scalars_1.TYPESCRIPT_SCALAR_MAP), options.config.scalars), target: 'metadata', metaDataTarget: 'typescript' }) }));
    return config;
};
const generateJavasScriptPreset = (options, models) => {
    const config = [];
    const modelFolder = path_1.join(options.baseOutputDir, 'models');
    config.push(Object.assign(Object.assign({}, options), { filename: path_1.join(modelFolder, 'index.js'), config: Object.assign(Object.assign({}, options.config), { scalars: Object.assign(Object.assign({}, scalars_1.TYPESCRIPT_SCALAR_MAP), options.config.scalars), metadata: false }) }));
    //indx.d.ts
    config.push(Object.assign(Object.assign({}, options), { filename: path_1.join(modelFolder, 'index.d.ts'), config: Object.assign(Object.assign({}, options.config), { scalars: Object.assign(Object.assign({}, scalars_1.TYPESCRIPT_SCALAR_MAP), options.config.scalars), metadata: false, isDeclaration: true }) }));
    // metadata schema.js
    config.push(Object.assign(Object.assign({}, options), { filename: path_1.join(modelFolder, 'schema.js'), config: Object.assign(Object.assign({}, options.config), { scalars: Object.assign(Object.assign({}, scalars_1.TYPESCRIPT_SCALAR_MAP), options.config.scalars), target: 'metadata', metaDataTarget: 'javascript' }) }));
    // schema.d.ts
    config.push(Object.assign(Object.assign({}, options), { filename: path_1.join(modelFolder, 'schema.d.ts'), config: Object.assign(Object.assign({}, options.config), { scalars: Object.assign(Object.assign({}, scalars_1.TYPESCRIPT_SCALAR_MAP), options.config.scalars), target: 'metadata', metaDataTarget: 'typedeclaration' }) }));
    return config;
};
exports.preset = {
    buildGeneratesSection: (options) => {
        const codeGenTarget = options.config.target;
        const hasModelDirective = hasDirective('model');
        const models = options.schema.definitions.filter(t => (t.kind === 'ObjectTypeDefinition' && hasModelDirective(t)) || (t.kind === 'EnumTypeDefinition' && !t.name.value.startsWith('__')));
        switch (codeGenTarget) {
            case 'java':
            case 'android':
                return generateJavaPreset(options, models);
                break;
            case 'swift':
            case 'ios':
                return generateSwiftPreset(options, models);
                break;
            case 'javascript':
                return generateJavasScriptPreset(options, models);
                break;
            case 'typescript':
                return generateTypeScriptPreset(options, models);
                break;
            default:
                throw new Error(`amplify-codegen-appsync-model-plugin not support language target ${codeGenTarget}. Supported codegen targets arr ${APPSYNC_DATA_STORE_CODEGEN_TARGETS.join(', ')}`);
        }
    },
};
//# sourceMappingURL=preset.js.map