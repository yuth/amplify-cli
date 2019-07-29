"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const server_1 = require("./server");
class AmplifyStorageSimulator {
    constructor(serverConfig) {
        this._serverConfig = serverConfig;
        try {
            this._server = new server_1.StorageSimulatorServer(serverConfig);
        }
        catch (e) {
            console.log(e);
        }
    }
    start() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this._server.start();
        });
    }
    stop() {
        this._server.stop();
    }
    get url() {
        return this._server.url.storage;
    }
}
exports.AmplifyStorageSimulator = AmplifyStorageSimulator;
//# sourceMappingURL=index.js.map