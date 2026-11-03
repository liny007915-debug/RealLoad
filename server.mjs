import http from 'node:http';import {readFile,stat,realpath} from 'node:fs/promises';import {resolve,extname,sep,dirname} from 'node:path';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';
const root=await realpath(dirname(fileURLToPath(import.meta.url)));const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.ico':'image/x-icon'};
const instance=createHash('sha256').update(root).digest('hex');
const port=Number(process.env.PORT||4202);
if(!Number.isSafeInteger(port)||port<1||port>65535)throw Error('PORT 必须是 1 至 65535 的整数');
const server=http.createServer(async(req,res)=>{
 try{
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{'Allow':'GET, HEAD'});res.end();return;}
  const path=decodeURI(new URL(req.url,'http://localhost').pathname);
  if(path==='/__realload__/identity'){
   const {version}=JSON.parse(await readFile(resolve(root,'package.json'),'utf8'));
   const bytes=JSON.stringify({product:'RealLoad Studio',instance,version,pid:process.pid});
   res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(req.method==='HEAD'?undefined:bytes);return;
  }
  const file=resolve(root,'.'+(path==='/'?'/index.html':path));if(!(file===root||file.startsWith(root+sep)))throw new Error('Forbidden');
  const physical=await realpath(file);if(!(physical===root||physical.startsWith(root+sep)))throw new Error('Forbidden');
  const s=await stat(physical);if(!s.isFile())throw new Error('Not found');const bytes=await readFile(physical);res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','Cache-Control':'no-cache'});res.end(req.method==='HEAD'?undefined:bytes);
 }catch{res.writeHead(404);res.end('Not found')}
});
server.on('error',error=>{console.error(error.code==='EADDRINUSE'?`端口 ${port} 已被占用，请重新运行启动器。`:error.message);process.exitCode=1;});
server.listen(port,'127.0.0.1',()=>console.log(`RealLoad Studio: http://localhost:${port}`));
