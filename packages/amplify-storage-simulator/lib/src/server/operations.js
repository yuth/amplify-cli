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
const express = require("express");
const cors = require("cors");
const path_1 = require("path");
const http_1 = require("http");
const fs_extra_1 = require("fs-extra");
const xml = require("xml");
const bodyParser = require("body-parser");
const convert = require("xml-js");
const ip_1 = require("ip");
const e2p = require("event-to-promise");
//const STATIC_ROOT = join(__dirname, '..', '..','public');
const directoryPath = path_1.join(__dirname, 'bucket'); // get bucket througb parameters remove afterwards
console.log(directoryPath);
class StorageServer {
    constructor(config) {
        this.config = config;
        this.app = express();
        this.app.use(express.json());
        this.app.use(cors());
        //this.app.use('/', express.static(STATIC_ROOT))
        this.app.use(bodyParser.json({ limit: '50mb' }));
        this.app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));
        this.app.use(bodyParser.raw({ limit: '100mb' }));
        this.server = null;
        this.route = config.route;
        console.log("config object = ", config);
        console.log("route path = ", this.route + ':id');
        this.app.get(this.route + ':id', this.handleRequestGet.bind(this));
        this.app.put(this.route + ':id', this.handleRequestPut.bind(this));
        this.app.delete(this.route + ':id', this.handleRequestDelete.bind(this));
        this.app.get(this.route, this.handleRequestList.bind(this));
    }
    start() {
        if (this.server) {
            throw new Error('Server is already running');
        }
        this.server = http_1.createServer({}, this.app).listen(this.config.port);
        return e2p(this.server, 'listening').then(() => {
            this.connection = this.server.address();
            this.url = `http://${ip_1.address()}:${this.connection.port}`;
            console.log('given url : ', this.url);
            return this.server;
        });
    }
    stop() {
        if (this.server) {
            this.server.close();
            this.server = null;
            this.connection = null;
        }
    }
    handleRequestGet(request, response) {
        return __awaiter(this, void 0, void 0, function* () {
            // fill in  this content
            console.log("enter get");
            fs_extra_1.readFile(path_1.join(directoryPath, request.params.id), (err, data) => {
                if (err)
                    throw err;
                response.send(data);
            });
        });
    }
    handleRequestList(request, response) {
        return __awaiter(this, void 0, void 0, function* () {
            // fill in  this content
            console.log("enter list");
            fs_extra_1.readdir(directoryPath, function (err, files) {
                //handling error
                if (err) {
                    return console.log('Unable to scan directory: ' + err);
                }
                //listing all files using forEach
                var result = [];
                files.forEach(function (file) {
                    if (!file.startsWith('.')) {
                        console.log(file);
                        result.push({ key: file });
                    }
                });
                console.log(result);
                response.send(xml(convert.json2xml("result")));
            });
        });
    }
    handleRequestDelete(request, response) {
        return __awaiter(this, void 0, void 0, function* () {
            // fill in  this content
            console.log("enter delete");
            fs_extra_1.unlink(path_1.join(directoryPath, request.params.id), (err) => {
                if (err)
                    throw err;
                response.send(xml(convert.json2xml(JSON.stringify(request.params.id + 'was deleted'))));
            });
        });
    }
    handleRequestPut(request, response) {
        return __awaiter(this, void 0, void 0, function* () {
            // fill in  this content
            console.log("put enetered");
            fs_extra_1.writeFile(path_1.join(directoryPath, request.params.id), request.body, function (err) {
                if (err) {
                    return console.log(err);
                }
                console.log("The file was saved!");
            });
            response.send(xml(convert.json2xml(JSON.stringify('upload success'))));
        });
    }
}
exports.StorageServer = StorageServer;
//# sourceMappingURL=operations.js.map