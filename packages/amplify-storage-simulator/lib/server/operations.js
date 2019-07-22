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
const e2p = require("event-to-promise");
const serveStatic = require("serve-static");
const glob = require("glob");
const o2x = require("object-to-xml");
const directoryPath = path_1.join(__dirname, 'bucket'); // get bucket througb parameters remove afterwards
//console.log(directoryPath);
class StorageServer {
    constructor(config) {
        this.config = config;
        this.localDirectoryPath = config.localDirS3;
        console.log("path file", this.localDirectoryPath);
        this.app = express();
        this.app.use(express.json());
        this.app.use(cors());
        //this.app.use('/', express.static(STATIC_ROOT))
        this.app.use(bodyParser.raw({ limit: '100mb', type: '*/*' }));
        this.app.use(bodyParser.json({ limit: '50mb', type: '*/*' }));
        this.app.use(bodyParser.urlencoded({ limit: '50mb', extended: false, type: '*/*' }));
        this.app.use(serveStatic(this.localDirectoryPath), this.handleRequestAll.bind(this));
        this.server = null;
        this.route = config.route;
        console.log("config object = ", config);
        console.log("route path = ", this.route + ':path');
        //this.app.get(this.route +':path', this.handleRequestGet.bind(this));
        //this.app.put(this.route +':path', this.handleRequestPut.bind(this));
        //this.app.put(this.route+'/*', this.handleRequestPut.bind(this));
        //this.app.delete(this.route +':path', this.handleRequestDelete.bind(this));
        //this.app.get(this.route, this.handleRequestList.bind(this));
    }
    start() {
        if (this.server) {
            throw new Error('Server is already running');
        }
        this.server = http_1.createServer({}, this.app).listen(this.config.port);
        return e2p(this.server, 'listening').then(() => {
            this.connection = this.server.address();
            //this.url = `http://${getLocalIpAddress()}:${this.connection.port}`;
            this.url = `http://localhost:${this.connection.port}`;
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
    handleRequestAll(request, response) {
        return __awaiter(this, void 0, void 0, function* () {
            // parsing the path and the request parameters
            request.url = (decodeURIComponent(request.url));
            var str2 = this.route.slice(0, -1) + '';
            const temp = request.url.split(str2);
            console.log("temp", temp);
            if (request.query.prefix !== undefined)
                request.params.path = path_1.join(request.query.prefix, temp[0]);
            else {
                if (temp[1] !== undefined)
                    request.params.path = temp[1].split('?')[0];
                else // change for IOS as no bucket name is present in the original url
                    request.params.path = temp[0].split('?')[0];
            }
            console.log("path", request.params.path);
            if (request.method === 'PUT') {
                this.handleRequestPut(request, response);
            }
            if (request.method === 'GET') {
                if (request.params.path.indexOf('.') === -1) {
                    this.handleRequestList(request, response);
                }
                else {
                    this.handleRequestGet(request, response);
                }
            }
            if (request.method === 'DELETE') {
                this.handleRequestDelete(request, response);
            }
        });
    }
    handleRequestGet(request, response) {
        return __awaiter(this, void 0, void 0, function* () {
            // fill in  this content
            console.log("enter get");
            fs_extra_1.readFile(path_1.join(this.localDirectoryPath, request.params.path), (err, data) => {
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
            var object = {};
            var key = 'Contents';
            object[key] = [];
            // getting folders recursively
            const dirPath = path_1.join(this.localDirectoryPath, request.params.path);
            console.log("dirPath", dirPath);
            let files = glob.sync(dirPath + '/**/*');
            for (let file in files) {
                if (!fs_extra_1.statSync(files[file]).isDirectory()) {
                    object[key].push({ "Key": files[file].split(dirPath)[1],
                    });
                    console.log(files[file].split(dirPath)[1]);
                }
            }
            response.set('Content-Type', 'text/xml');
            response.send(o2x({
                '?xml version="1.0" encoding="utf-8"?': null,
                object
            }));
        });
    }
    handleRequestDelete(request, response) {
        return __awaiter(this, void 0, void 0, function* () {
            // fill in  this content
            console.log("enter delete");
            fs_extra_1.unlink(path_1.join(this.localDirectoryPath, request.params.path), (err) => {
                if (err)
                    throw err;
                response.send(xml(convert.json2xml(JSON.stringify(request.params.id + 'was deleted'))));
            });
        });
    }
    handleRequestPut(request, response) {
        return __awaiter(this, void 0, void 0, function* () {
            // fill in  this content
            console.log("put entered");
            const directoryPath = path_1.join(String(this.localDirectoryPath), String(request.params.path));
            fs_extra_1.ensureFileSync(directoryPath);
            //console.log(request);
            fs_extra_1.writeFile(directoryPath, request.body, function (err) {
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