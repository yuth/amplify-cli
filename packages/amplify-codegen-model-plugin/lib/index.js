"use strict";
function __export(m) {
    for (var p in m) if (!exports.hasOwnProperty(p)) exports[p] = m[p];
}
Object.defineProperty(exports, "__esModule", { value: true });
__export(require("./plugin"));
__export(require("./preset"));
exports.addToSchema = (config) => {
    const result = [];
    if (config.scalars) {
        if (typeof config.scalars === 'string') {
            result.push(config.scalars);
        }
        else {
            result.push(...Object.keys(config.scalars).map(scalar => `scalar ${scalar}`));
        }
    }
    if (config.directives) {
        if (typeof config.directives === 'string') {
            result.push(config.directives);
        }
    }
    return result.join('\n');
};
//# sourceMappingURL=index.js.map