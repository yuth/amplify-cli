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
const S3server_1 = require("./S3server");
class StorageSimulatorServer {
    constructor(config) {
        this.storageServer = new S3server_1.StorageServer(config);
    }
    start() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.storageServer.start();
        });
    }
    stop() {
        this.storageServer.stop();
    }
    get url() {
        return {
            storage: this.storageServer.url
        };
    }
}
exports.StorageSimulatorServer = StorageSimulatorServer;
//# sourceMappingURL=index.js.map