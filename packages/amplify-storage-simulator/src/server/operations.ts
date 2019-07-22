import * as express from 'express';
import * as cors from 'cors';
import { join } from 'path';
import { createServer } from 'http';
import { writeFile ,readdir ,readFile ,unlink ,readdirSync, statSync, ensureFileSync ,writeFileSync} from 'fs-extra';
import * as xml from 'xml';
import * as bodyParser from 'body-parser';
import * as convert from 'xml-js';
import { address as getLocalIpAddress } from 'ip';
import * as e2p from 'event-to-promise';
import * as serveStatic from "serve-static";
import * as glob from 'glob';
import * as o2x from 'object-to-xml';
 
import { StorageSimulatorServerConfig} from '../index';

const directoryPath = join(__dirname, 'bucket'); // get bucket througb parameters remove afterwards
//console.log(directoryPath);

export class StorageServer {
  private app;
  private server;
  private connection;
  private route; // bucket name get from the CFN parser
  url: string;
  private localDirectoryPath : string;

  constructor(
    private config: StorageSimulatorServerConfig,
  ) {
    this.localDirectoryPath = config.localDirS3;
    console.log("path file",this.localDirectoryPath);
    this.app = express();

    this.app.use(express.json());
    this.app.use(cors());
    //this.app.use('/', express.static(STATIC_ROOT))
    this.app.use(bodyParser.raw({limit: '100mb', type : '*/octet-stream'}));
    this.app.use(bodyParser.json({limit: '50mb'}));
    this.app.use(bodyParser.urlencoded({limit: '50mb', extended: false}));
    this.app.use(serveStatic(this.localDirectoryPath),this.handleRequestAll.bind(this));

    this.server = null;
    this.route = config.route;
    console.log("config object = ", config);
    console.log("route path = ", this.route +':path');

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

    this.server = createServer({
}, this.app).listen(this.config.port);


    return e2p(this.server, 'listening').then(() => {
      this.connection = this.server.address();
      this.url = `http://${getLocalIpAddress()}:${this.connection.port}`;
      console.log('given url : ' ,this.url);
      return this.server;
    })
  }

  stop() {
    if (this.server) {
      this.server.close();
      this.server = null;
      this.connection = null;
    }
  }

  private async handleRequestAll(request,response){
    // parsing the path and the request parameters
    request.url = (decodeURIComponent(request.url));
    var str2 = this.route.slice(0, -1) + '';
    const temp = request.url.split(str2);
    console.log("temp",temp);
    if(request.query.prefix !== undefined)
      request.params.path = join(request.query.prefix,temp[0]);
    else{
      if(temp[1] !== undefined)
        request.params.path = temp[1].split('?')[0];
      else // change for IOS as no bucket name is present in the original url
        request.params.path = temp[0].split('?')[0];
    }
    console.log("path",request.params.path);


    if(request.method === 'PUT'){
      this.handleRequestPut(request,response);
    }

    if(request.method === 'GET'){
      if(request.params.path.indexOf('.') === -1){
        this.handleRequestList(request,response);
      }
      else{
        this.handleRequestGet(request,response);
      }
    }
    if(request.method === 'DELETE'){
      this.handleRequestDelete(request,response);
    }
  }

  private async handleRequestGet(request, response) {
    // fill in  this content
    console.log("enter get");
    readFile(join(this.localDirectoryPath,request.params.path),(err,data)=>{
      if(err) throw err;
      response.send(data);
    });
  }

  private async handleRequestList(request, response) {
    // fill in  this content
    console.log("enter list");
    var object={};
    var key = 'Contents';
    object[key]=[];
    // getting folders recursively
    const dirPath = join(this.localDirectoryPath,request.params.path);
    console.log("dirPath",dirPath);
    let files =glob.sync(dirPath+ '/**/*');
      for(let file in files){
        if(!statSync(files[file]).isDirectory()){
          object[key].push({"Key" : files[file].split(dirPath)[1],
        });
          console.log(files[file].split(dirPath)[1]);
        }
      }
      response.set('Content-Type', 'text/xml');
      response.send(o2x({
                '?xml version="1.0" encoding="utf-8"?' : null,
                object
      }));
   }

  private async handleRequestDelete(request, response) {
    // fill in  this content
    console.log("enter delete");
    unlink(join(this.localDirectoryPath,request.params.path), (err) => {
      if (err) throw err;
      response.send(xml(convert.json2xml(JSON.stringify(request.params.id + 'was deleted'))));
    });

  }

  private async handleRequestPut(request, response) {
    // fill in  this content
    console.log("put entered");
    const directoryPath =  join(String(this.localDirectoryPath),String(request.params.path)); 
    ensureFileSync(directoryPath);
    writeFile(directoryPath,request.body, function(err) {
      if(err) {
          return console.log(err);
      }
      console.log("The file was saved!");
    });
    response.send(xml(convert.json2xml(JSON.stringify('upload success'))));
  }
}



