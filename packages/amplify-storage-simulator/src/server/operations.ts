import * as express from 'express';
import * as cors from 'cors';
import { join } from 'path';
import { createServer, request } from 'http';
import { writeFile ,readdir ,readFile ,unlink ,readdirSync, statSync, ensureFileSync ,writeFileSync} from 'fs-extra';
import * as xml from 'xml';
import * as bodyParser from 'body-parser';
import * as convert from 'xml-js';
import { address as getLocalIpAddress } from 'ip';
import * as e2p from 'event-to-promise';
import * as serveStatic from "serve-static";
import * as glob from 'glob';
import * as o2x from 'object-to-xml';
import * as uuid from 'uuid';
 
import { StorageSimulatorServerConfig} from '../index';
import { fstat } from 'fs';

const directoryPath = join(__dirname, 'bucket'); // get bucket througb parameters remove afterwards
//console.log(directoryPath);
var corsOptions = {
  maxAge : 20000,
  exposedHeaders: ['x-amz-server-side-encryption', 'x-amz-request-id', 'x-amz-id-2', 'ETag']
}
export class StorageServer {
  private app;
  private server;
  private connection;
  private route; // bucket name get from the CFN parser
  url: string;
  private uploadId;
  private localDirectoryPath : string;

  constructor(
    private config: StorageSimulatorServerConfig,
  ) {
    this.localDirectoryPath = config.localDirS3;
    console.log("path file",this.localDirectoryPath);
    this.app = express();
    this.app.use(express.json());
    this.app.use(cors(corsOptions));
    //this.app.set('etag', false);
    //this.app.use('/', express.static(STATIC_ROOT))
    this.app.use(bodyParser.raw({limit: '100mb', type : '*/*'}));
    this.app.use(bodyParser.json({limit: '50mb',type : '*/*'}));
    this.app.use(bodyParser.urlencoded({limit: '50mb', extended: false ,type : '*/*'}));
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
      //this.url = `http://${getLocalIpAddress()}:${this.connection.port}`;
      this.url = `http://localhost:${this.connection.port}`;
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
    console.log("request",request.method);

    if(request.method === 'PUT'){
      this.handleRequestPut(request,response);
    }

    if(request.method === 'POST'){
      this.handleRequestPost(request,response);
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
    console.log("orig1",request.headers);
    console.log("request",request.body);
    //var new_data= stripChunkSignaturev2(request.body);
    //console.log('final',new_data);
    writeFile(directoryPath,request.body, function(err) {
      if(err) {
          return console.log(err);
      }
      console.log("The file was saved!");
    });
    // get the data from the file and convert it into exact format
    //response.header("Access-Control-Expose-Headers", "Etag");
    response.send(xml(convert.json2xml(JSON.stringify('upload success'))));
  }
  private async handleRequestPost(request, response) {
    // fill in  this content
    console.log("post entered");
    console.log("request",request.query);

    if(request.query.uploads !== undefined){
      console.log("uploads");
      this.uploadId = uuid();
      //response.set('Content-Type', 'text/xml');
      response.send(o2x({
        '?xml version="1.0" encoding="utf-8"?' : null,
        InitiateMultipartUploadResult:{
          "Bucket" : this.route ,
          "Key" : request.params.path,
          "UploadId" : this.uploadId
          }
      }));
    }
    if(request.query.uploadId === this.uploadId ){
      console.log("uploadsId");
      response.set('Content-Type', 'text/xml');
      response.send(o2x({
                '?xml version="1.0" encoding="utf-8"?' : null,
                CompleteMultipartUploadResult:{
                 "Location": request.url,
                 "Bucket" : this.route ,
                 "Key" : request.params.path,
                 "Etag" : "33a64df551425fcc55e4d42a148795d9f25f89d4" //hardcoded etag chnage with request etag
                }
      }));     
    }
  }
}
/*
  function stripChunkSignature(data : String){
    var regex_list = [/^[A-Fa-f0-9]+;chunk-signature=[0-9a-f]{64}/ ,/^[A-Fa-f0-9]+;chunk-signature=[0-9a-f]{64}/] ;
    var new_data = data;
    for(let regex in regex_list){
      new_data = new_data.replace(regex,'');
      console.log('test1',data);
    }
    console.log("test",data);
    return Buffer.from(String(data));
  }
*/
  function stripChunkSignature(buf : Buffer){
    let str = buf.toString();
    var regex = /^[A-Fa-f0-9]+;chunk-signature=[0-9a-f]{64}/gm;
    var regex_list = [/^[A-Fa-f0-9]/gm , /^[A-Fa-f0-9]+;chunk-signature=[0-9a-f]{64}/gm];
    let m;
    while ((m = regex.exec(str)) !== null) {
      // This is necessary to avoid infinite loops with zero-width matches
      if (m.index === regex.lastIndex) {
          regex.lastIndex++;
      }
      
      // The result can be accessed through the `m`-variable.
      str = str.replace(regex,'');
      //str = str.replace(/\n|\r/gm, '');
      str = str.trim();
      console.log("str",str);
    }

    return Buffer.from(str);
  }
  function stripChunkSignaturev2(buf : Buffer){
    var content_size=[];
    var sig_size=[];
    var new_data=buf;
    let str = buf.toString();
    console.log("check",buf);
    var regex1 = /^[A-Fa-f0-9]+;chunk-signature=[0-9a-f]{64}/gm;
    //var regex_list = [/^[A-Fa-f0-9]/gm , /^[A-Fa-f0-9]+;chunk-signature=[0-9a-f]{64}/gm];
    let m;
    let offset=[];
    let start=[]
    while ((m = regex1.exec(str)) !== null) {
      // This is necessary to avoid infinite loops with zero-width matches
      if (m.index === regex1.lastIndex) {
        regex1.lastIndex++;
      }
      m.forEach((match, groupIndex ,index) => {
        start.push(str.indexOf(match));
        offset.push(Buffer.from(match).byteLength);
        console.log(`Found match, group ${groupIndex}: ${match}`);
        //buf = buf.slice(start+offset);
      });
    }
    
    console.log('start',start);
    console.log('offet',offset);
    //buf  = buf.slice(0,start[1]);
    //buf  = buf.slice(offset[0]+1);
    var new_buf= buf.slice(86,85+11044);
    /*
    console.log("final1",buf.toString());
    buf  = buf.slice(offset[0]);
    console.log("final2",buf.toString());
    // remove it from original buffer
    */
    return new_buf;
    
  }


/*
  function stripChunkSignaturev3(buf : Buffer){
    const result = [];
    let ch = [];
    let str = '';
    let skip: boolean;
    for(let i of buf.entries()) {
      let foo = [];
      
      const char = i.toString();
      if(char === '\n') {
        skip = false;
      }
      if(char === ';') {
        skip = true;
      }
      if(!skip) {
        result.append()
      }
    }
    return new_buf;
    
  }
  */


