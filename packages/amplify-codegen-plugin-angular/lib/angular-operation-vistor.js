"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const visitor_plugin_common_1 = require("@graphql-codegen/visitor-plugin-common");
const angular_selection_set_to_object_1 = require("./angular-selection-set-to-object");
const angular_operation_variables_to_object_1 = require("./angular-operation-variables-to-object");
function getRootType(operation, schema) {
    switch (operation) {
        case 'query':
            return schema.getQueryType();
        case 'mutation':
            return schema.getMutationType();
        case 'subscription':
            return schema.getSubscriptionType();
    }
}
class AngularOperationsVisitor extends visitor_plugin_common_1.BaseDocumentsVisitor {
    constructor(schema, config, allFragments) {
        super(config, {
            avoidOptionals: config.avoidOptionals || false,
            immutableTypes: config.immutableTypes || false
        }, schema);
        this.setSelectionSetHandler(new angular_selection_set_to_object_1.AngularSelectionSetToObject(this.scalars, this.schema, this.convertName, this.config.addTypename, allFragments, this.config.immutableTypes));
        this.setVariablesTransformer(new angular_operation_variables_to_object_1.AngularOperationVariablesHelper(this.scalars, this.convertName, this.config.avoidOptionals, this.config.immutableTypes));
    }
}
exports.AngularOperationsVisitor = AngularOperationsVisitor;
//# sourceMappingURL=angular-operation-vistor.js.map