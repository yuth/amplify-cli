import * as express from 'express';
import * as cors from 'cors';
import { join } from 'path';
import { createServer } from 'http';
import { writeFile ,readdir ,readFile ,unlink ,readdirSync, statSync, ensureFileSync} from 'fs-extra';
import * as xml from 'xml';
import * as bodyParser from 'body-parser';
import * as convert from 'xml-js';
import { address as getLocalIpAddress } from 'ip';
import * as e2p from 'event-to-promise';
import * as serveStatic from "serve-static";
import * as glob from 'glob';
 
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
    this.app.use(bodyParser.json({limit: '50mb'}));
    this.app.use(bodyParser.urlencoded({limit: '50mb', extended: true}));
    this.app.use(bodyParser.raw({limit: '100mb'}));
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
    const path = request.url.split(this.route);
    if(request.method === 'PUT'){
      request.params.path = String(path[1]).split('?')[0];
      this.handleRequestPut(request,response);
    }

    if(request.method === 'GET'){
      if(String(path[1]) === 'undefined'){
        request.params.path = path[1];
        this.handleRequestList(request,response);
      }
      else{
        request.params.path = String(path[1]).split('?')[0];
        this.handleRequestGet(request,response);
      }
    }

    if(request.method === 'DELETE'){
      request.params.path = path[1];
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
    var result=[];
    // getting folders recursively
    
    let files =glob.sync(this.localDirectoryPath + '/**/*');
      console.log("files",files);
      for(let file in files){
        if(!statSync(files[file]).isDirectory()){
          console.log('files in dir',files[file].split(this.localDirectoryPath)[1]);
          result.push(files[file].split(this.localDirectoryPath)[1]);
        }
      }
    response.send(xml(convert.json2xml(JSON.stringify(result))));
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
    console.log("put enetered");
    const directoryPath =  join(String(this.localDirectoryPath),String(request.params.path)); 
    console.log(request.headers);
    console.log(Object.keys(request.body)[0]);
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



