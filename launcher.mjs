/** Shared local launcher. A directory owns its server; other copies are never stopped. */
import {createHash} from 'node:crypto';
import {open,mkdir,readFile,writeFile,realpath,unlink} from 'node:fs/promises';
import {createServer} from 'node:net';
import {spawn} from 'node:child_process';
import {dirname,resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {homedir} from 'node:os';

export const PORTS=Array.from({length:14},(_,i)=>4202+i);
export async function directoryIdentity(root){return createHash('sha256').update(await realpath(root)).digest('hex');}
export async function serverIdentity(port){
 try{const r=await fetch(`http://127.0.0.1:${port}/__realload__/identity`,{signal:AbortSignal.timeout(700),redirect:'error'});if(!r.ok)return null;const data=await r.json();return data.product==='RealLoad Studio'&&typeof data.instance==='string'&&Number.isSafeInteger(data.pid)&&data.pid>0?data:null;}catch{return null;}
}
async function available(port){return await new Promise(resolve=>{const server=createServer();server.once('error',()=>resolve(false));server.listen(port,'127.0.0.1',()=>server.close(()=>resolve(true)));});}
export async function discoverServer(root,ports=PORTS){
 const instance=await directoryIdentity(root);let free=null;
 for(const port of ports){const identity=await serverIdentity(port);if(identity?.instance===instance)return{port,identity,reused:true};if(free===null&&await available(port))free=port;}
 return free===null?null:{port:free,instance,reused:false};
}
async function record(root,pid,port){await writeFile(join(root,'.realload-server.pid'),String(pid)+'\n');await writeFile(join(root,'.realload-server.port'),String(port)+'\n');}
export async function ensureServer(root,{ports=PORTS,logPath}={}){
 root=await realpath(root);const found=await discoverServer(root,ports);
 if(!found)throw Error('本地端口 4202–4215 均已占用。请关闭不用的 RealLoad 副本后重试。');
 if(found.reused){await record(root,found.identity.pid,found.port);return{...found,url:`http://localhost:${found.port}/`};}
 logPath ||= join(homedir(),process.platform==='darwin'?'Library/Logs':'RealLoad','RealLoad-Studio.log');await mkdir(dirname(logPath),{recursive:true});
 const log=await open(logPath,'a');let child,spawnError;
 try{child=spawn(process.execPath,[join(root,'server.mjs')],{cwd:root,env:{...process.env,PORT:String(found.port)},detached:true,stdio:['ignore',log.fd,log.fd],windowsHide:true});child.once('error',error=>{spawnError=error;});child.unref();}finally{await log.close();}
 for(let i=0;i<45;i++){
  if(spawnError)throw spawnError;
  const identity=await serverIdentity(found.port);
  if(identity?.instance===found.instance&&identity.pid===child.pid){await record(root,identity.pid,found.port);return{port:found.port,identity,reused:false,url:`http://localhost:${found.port}/`,logPath};}
  if(child.exitCode!==null)break;
  await new Promise(resolve=>setTimeout(resolve,100));
 }
 throw Error(`服务没有启动，请查看日志：${logPath}`);
}
export async function stopServer(root){
 const instance=await directoryIdentity(root);let pid,port;
 try{pid=Number((await readFile(join(root,'.realload-server.pid'),'utf8')).trim());port=Number((await readFile(join(root,'.realload-server.port'),'utf8')).trim());}catch{return{stopped:false,reason:'没有找到本目录的完整启动记录。'};}
 const identity=Number.isSafeInteger(port)&&port>0&&port<65536?await serverIdentity(port):null;
 if(!identity||identity.instance!==instance||identity.pid!==pid)return{stopped:false,reason:'启动记录与本目录的服务不符，未停止任何进程。'};
 try{process.kill(pid,'SIGTERM');await Promise.all(['.realload-server.pid','.realload-server.port'].map(name=>unlink(join(root,name)).catch(()=>{})));return{stopped:true,port};}catch{return{stopped:false,reason:'服务已经退出，或系统不允许停止。'};}
}
export async function openBrowser(url){
 const command=process.platform==='darwin'?'/usr/bin/open':process.platform==='win32'?'cmd':'xdg-open';
 const args=process.platform==='win32'?['/c','start','',url]:[url];
 await new Promise((resolve,reject)=>{const child=spawn(command,args,{stdio:'ignore',windowsHide:true});child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error('浏览器未能自动打开，请手动访问上方地址。')));});
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  if(Number(process.versions.node.split('.')[0])<20)throw Error('请安装 Node.js 20 或更新版本。');
  const root=dirname(fileURLToPath(import.meta.url));
  if(process.argv.includes('--stop')){const result=await stopServer(root);console.log(result.stopped?'本目录的 RealLoad 服务已停止。':result.reason);}
  else{const result=await ensureServer(root);console.log(`${result.reused?'继续使用已运行的本目录服务':'已启动 RealLoad'}：${result.url}`);console.log('规划保存在这个浏览器地址中。迁移目录或更换浏览器前，请导出完整 JSON 备份。');await openBrowser(result.url);}
 }catch(error){console.error(error.message);process.exitCode=1;}
}
