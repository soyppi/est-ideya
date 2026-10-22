// Dependency-free local preview; binds only to this computer.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.md':'text/plain'};
http.createServer((req,res)=>{
 const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
 const file=path.resolve(__dirname,'.'+(name==='/'?'/index.html':name));
 if(!file.startsWith(__dirname+path.sep)){res.writeHead(403).end();return}
 fs.readFile(file,(error,data)=>{res.writeHead(error?404:200,{'Content-Type':(mime[path.extname(file)]||'application/octet-stream')+'; charset=utf-8'});res.end(error?'Not found':data)});
}).listen(8780,'127.0.0.1',()=>console.log('Open http://127.0.0.1:8780'));
