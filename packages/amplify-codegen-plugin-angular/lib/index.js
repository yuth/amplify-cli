"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tslib_1 = require("tslib");
const graphql_1 = require("graphql");
const angular_service_visitor_1 = require("./angular-service-visitor");
const angular_operation_vistor_1 = require("./angular-operation-vistor");
const path_1 = require("path");
exports.plugin = (schema, documents, config) => {
    const allAst = graphql_1.concatAST(documents.reduce((prev, v) => {
        return [...prev, v.content];
    }, []));
    const operations = allAst.definitions.filter(d => d.kind === graphql_1.Kind.OPERATION_DEFINITION);
    if (operations.length === 0) {
        return '';
    }
    const allFragments = allAst.definitions.filter(d => d.kind === graphql_1.Kind.FRAGMENT_DEFINITION);
    const loadedFragments = allFragments.map(fragmentDef => ({ name: fragmentDef.name.value, onType: fragmentDef.typeCondition.name.value }));
    const operationVisitorResult = graphql_1.visit(allAst, {
        leave: new angular_operation_vistor_1.AngularOperationsVisitor(schema, config, loadedFragments),
    });
    const visitor = new angular_service_visitor_1.AwsAmplifyAngularServiceVisitor(allFragments, operations, config);
    const visitorResult = graphql_1.visit(allAst, { leave: visitor });
    return [
        operationVisitorResult.definitions,
        visitor.getImports(),
        visitor.fragments,
        ...visitorResult.definitions.filter(t => typeof t === 'string'),
        visitor.buildService()
    ].join('\n');
};
exports.validate = (schema, documents, config, outputFile) => tslib_1.__awaiter(this, void 0, void 0, function* () {
    if (path_1.extname(outputFile) !== '.ts') {
        throw new Error(`Plugin "amplify-codegen-plugin-angular" requires extension to be ".ts"!`);
    }
});
//# sourceMappingURL=index.js.map