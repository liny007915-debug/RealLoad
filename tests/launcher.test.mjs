import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,copyFile,writeFile,readFile,rm,symlink,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:net';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {directoryIdentity,serverIdentity,discoverServer,ensureServer,stopServer} from '../launcher.mjs';

const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function freePort(){const server=createServer();server.listen(0,'127.0.0.1');await once(server,'listening');const port=server.address().port;await new Promise(resolve=>server.close(resolve));return port;}
async function fixture(t){const root=await mkdtemp(join(tmpdir(),'realload-launcher-'));t.after(()=>rm(root,{recursive:true,force:true}));await copyFile(new URL('../server.mjs',import.meta.url),join(root,'server.mjs'));await writeFile(join(root,'package.json'),JSON.stringify({version:'1.27.0-beta.1',type:'module'}));await writeFile(join(root,'index.html'),'<title>RealLoad Studio 1.27 Beta 1</title>');await mkdir(join(root,'src'));await writeFile(join(root,'src','fixture.mjs'),'export const value=27;');return root;}
async function start(t,root,port){const child=spawn(process.execPath,[join(root,'server.mjs')],{env:{...process.env,PORT:String(port)},stdio:['ignore','pipe','pipe']});t.after(()=>{if(child.exitCode===null)child.kill();});let errors='';child.stderr.on('data',chunk=>errors+=chunk);for(let i=0;i<80;i++){if(await serverIdentity(port))return child;if(child.exitCode!==null)throw Error(errors);await pause(25);}throw Error('test server readiness timeout');}

test('launcher reuses a same-directory service even when a lower port is free',async t=>{
 const root=await fixture(t),port=await freePort(),unused=await freePort();await start(t,root,port);
 const found=await discoverServer(root,[unused,port]);assert.equal(found.reused,true);assert.equal(found.port,port);
 const reused=await ensureServer(root,{ports:[unused,port],logPath:join(root,'service.log')});assert.equal(reused.reused,true);assert.equal(reused.port,port);assert.equal((await readFile(join(root,'.realload-server.port'),'utf8')).trim(),String(port));
 assert.equal(await directoryIdentity(root),reused.identity.instance);
});

test('directory identity resolves aliases and never reuses another extracted copy',async t=>{
 const root=await fixture(t),other=await fixture(t),port=await freePort(),unused=await freePort();await start(t,root,port);
 const alias=join(other,'alias');await symlink(root,alias,'dir');assert.equal(await directoryIdentity(alias),await directoryIdentity(root));
 const found=await discoverServer(other,[port,unused]);assert.equal(found.reused,false);assert.equal(found.port,unused);
});

test('HTTP service identifies its process without disclosing local paths and serves HEAD correctly',async t=>{
 const root=await fixture(t),port=await freePort(),child=await start(t,root,port),base=`http://127.0.0.1:${port}`;
 const identity=await serverIdentity(port);assert.deepEqual(identity,{product:'RealLoad Studio',instance:await directoryIdentity(root),version:'1.27.0-beta.1',pid:child.pid});assert.equal(JSON.stringify(identity).includes(root),false);
 const module=await fetch(base+'/src/fixture.mjs');assert.equal(module.status,200);assert.match(module.headers.get('content-type'),/javascript/);assert.equal(await module.text(),'export const value=27;');
 const head=await fetch(base+'/',{method:'HEAD'});assert.equal(head.status,200);assert.equal(await head.text(),'');
 const rejected=await fetch(base+'/',{method:'POST'});assert.equal(rejected.status,405);assert.equal(rejected.headers.get('allow'),'GET, HEAD');
 assert.equal((await fetch(base+'/missing')).status,404);
});

test('HTTP service rejects traversal and symlinks that leave its own directory',async t=>{
 const root=await fixture(t),outside=await fixture(t),port=await freePort();await writeFile(join(outside,'private.txt'),'must not be served');await symlink(join(outside,'private.txt'),join(root,'escaped.txt'));await start(t,root,port);
 const base=`http://127.0.0.1:${port}`;assert.equal((await fetch(base+'/escaped.txt')).status,404);assert.equal((await fetch(base+'/%2e%2e%2fprivate.txt')).status,404);assert.equal((await fetch(base+'/%')).status,404);
});

test('shared launcher starts once, reuses the same origin, and stops only its own recorded PID',async t=>{
 const root=await fixture(t),port=await freePort(),unused=await freePort();let owned;
 t.after(async()=>{if(owned){try{process.kill(owned.identity.pid);}catch{}}});
 owned=await ensureServer(root,{ports:[port],logPath:join(root,'service.log')});assert.equal(owned.reused,false);assert.equal(owned.identity.instance,await directoryIdentity(root));assert.equal(owned.url,`http://localhost:${port}/`);
 const next=await ensureServer(root,{ports:[unused,port],logPath:join(root,'service.log')});assert.equal(next.reused,true);assert.equal(next.identity.pid,owned.identity.pid);assert.equal(next.url,owned.url);
 await writeFile(join(root,'.realload-server.pid'),String(owned.identity.pid+1));assert.equal((await stopServer(root)).stopped,false);assert.ok(await serverIdentity(port));
 await writeFile(join(root,'.realload-server.pid'),String(owned.identity.pid));assert.equal((await stopServer(root)).stopped,true);
 for(let i=0;i<30&&await serverIdentity(port);i++)await pause(20);assert.equal(await serverIdentity(port),null);owned=null;
});

test('occupied foreign services and malformed PID records are never stopped or overwritten',async t=>{
 const root=await fixture(t),other=await fixture(t),port=await freePort(),child=await start(t,other,port);
 await writeFile(join(root,'.realload-server.pid'),String(child.pid));await writeFile(join(root,'.realload-server.port'),String(port));
 assert.equal((await stopServer(root)).stopped,false);assert.equal((await serverIdentity(port)).pid,child.pid);
 await assert.rejects(ensureServer(root,{ports:[port],logPath:join(root,'service.log')}),/占用/);assert.equal((await serverIdentity(port)).pid,child.pid);
 await writeFile(join(root,'.realload-server.pid'),'not a PID');assert.equal((await stopServer(root)).stopped,false);
});

test('server rejects invalid port input with an actionable error',async t=>{
 const root=await fixture(t),child=spawn(process.execPath,[join(root,'server.mjs')],{env:{...process.env,PORT:'not-a-port'},stdio:['ignore','ignore','pipe']});let text='';child.stderr.on('data',chunk=>text+=chunk);const [code]=await once(child,'exit');assert.equal(code,1);assert.match(text,/PORT 必须是/);
});
