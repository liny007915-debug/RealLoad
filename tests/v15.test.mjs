import {ENHANCED_PACKAGES,packageParts} from '../src/package-geometry.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CARGO_TYPES,dropCandidate,verifyDrop} from '../src/free-studio.mjs';
import {MATERIALS} from '../src/materials.mjs';
import {makeNumbering,unitNumber} from '../src/manifest.mjs';
import {autoMap,parseDelimited,buildImport} from '../src/importer.mjs';
import {CONTAINERS,validate} from '../src/engine.mjs';
const root=new URL('../',import.meta.url);
const read=(path)=>readFileSync(new URL(path,root),'utf8');
const newer=['plastic_crate','sack','machine','reel','bundle','coolbox'];
const labels=['塑料周转筐','编织袋','机械设备','电缆盘','管材捆','保温箱'];
const box=CONTAINERS['20GP'];
test('16 types have unique visible labels and proper material settings',()=>{
 assert.equal(Object.keys(CARGO_TYPES).length,16);
 assert.equal(new Set(Object.values(CARGO_TYPES).map(x=>x.label)).size,16);
 for(const k of newer){assert.ok(MATERIALS[k]); assert.equal(typeof MATERIALS[k].roughness,'number');assert.ok(CARGO_TYPES[k].note)}
});
test('new visual types still use precise outside dimensions and independent unit IDs',()=>{
 for(const k of newer){const s={id:k,name:k,kind:k,L:480.25,W:320.5,H:350.75,weight:25.125,qty:1,rotate:true,allowTilt:false,stackLimit:1};const q=dropCandidate(s,[],box,{x:480.25/2,y:320.5/2},{step:0.01});assert.equal(q.ok,true,k); assert.equal(q.candidate.x,0,k);assert.equal(q.candidate.y,0,k);const v=verifyDrop(q.candidate,[],box,[s]);assert.ok(v.ok,k);assert.equal(validate(v.placements,box,[s]).valid,true,k);const num=makeNumbering({quantity:1,kind:k,group:'A',code:k});assert.match(unitNumber({...s,numbering:num},1),/^PLAN-/)}
});
test('import aliases map 6 kinds with decimal cm and weights',()=>{
 const h=['订单号','货物组','SKU','货物名称','外箱号','托盘号','批次号','长(cm)','宽(cm)','高(cm)','毛重(kg)','数量','包装类型','目的地'];
 const rows=[h,...newer.map((kind,i)=>['PO-1','G'+i,kind,kind,`EXT${i}-001`,'','LOT-X','60.25','40.5','35.75','18.125','1',labels[i],'东京'])];
 const r=buildImport(rows,autoMap(h),{length:'mm',weight:'kg'}); assert.deepEqual(r.errors,[]); assert.deepEqual(r.skus.map(x=>x.kind),newer);assert.equal(r.skus[0].L,602.5);assert.equal(r.skus[0].weight,18.125);
});
test('new 3D geometry and category-specific fallback visuals exist',()=>{
 const webgl=read('src/webgl.mjs'),fallback=read('src/fallback-render.mjs');
 for(const k of newer){assert.ok(ENHANCED_PACKAGES.includes(k),k);assert.ok(packageParts({kind:k,L:800,W:600,H:600}).length>0,k);assert.match(fallback,new RegExp(k),k)}
 assert.match(webgl,/makeCylinderX/);
 assert.match(webgl,/shape==='cylinderX'/);
});
test('import template and packaging guide are included in project',()=>{
 const csv=read('表单与检验/02-可导入-14类示例.csv');const rows=parseDelimited(csv);const results=buildImport(rows,autoMap(rows[0]));assert.deepEqual(results.errors,[]);assert.equal(results.skus.length,14);
});
test('UI collapses 14-type guide and preserves editable material selection',()=>{
 const html=read('index.html');assert.match(html,/kind-guide/);assert.match(html,/16 类包装材质/);assert.match(read('src/app.mjs'),/renderKinds/);
});
test('Excel created from the shipping form imports all 14 categories with XML namespaces',async()=>{
 const {parseXlsx}=await import('../src/importer.mjs');
 const buffer=readFileSync(new URL('../表单与检验/RealLoad-货物表单与校验.xlsx',import.meta.url));
 const rows=await parseXlsx(buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength));
 const result=buildImport(rows,autoMap(rows[0]));assert.equal(result.errors.length,0);assert.equal(result.skus.length,14);
 assert.equal(result.skus[0].L,602.5);assert.equal(result.skus[0].weight,16.375);
});
test('new cargo kinds retain conservative collision behavior when touching walls',()=>{
 const original={id:'M-1',name:'运输机械',kind:'machine',L:980,W:800,H:1200,weight:450,qty:2,stackLimit:1,rotate:false,allowTilt:false};
 const first=dropCandidate(original,[],box,{x:490,y:400},{step:5});assert.equal(first.ok,true);
 const second=dropCandidate(original,[first.candidate],box,{x:1470,y:400},{step:5});assert.equal(second.ok,true);
 assert.equal(verifyDrop(second.candidate,[first.candidate],box,[original]).ok,true);
 const overlapping=dropCandidate(original,[first.candidate],box,{x:1000,y:400},{step:5});assert.equal(overlapping.ok,true);
 assert.equal(verifyDrop(overlapping.candidate,[first.candidate],box,[original]).ok,false);
});
test('formatted but empty Excel rows are not mistaken for shipment data',async()=>{
 const {parseXlsx}=await import('../src/importer.mjs');
 const bin=readFileSync(new URL('../表单与检验/RealLoad-货物表单与校验.xlsx',import.meta.url));
 const rows=await parseXlsx(bin.buffer.slice(bin.byteOffset,bin.byteOffset+bin.byteLength));
 assert.equal(rows.length,15);
});
test('malformed placement arrays produce a validation issue rather than crashing the app',()=>{
 const s={id:'V',name:'test',kind:'carton',L:400,W:300,H:200,weight:10,qty:2,stackLimit:1,rotate:true};
 const result=validate([null,{id:'V#1',skuId:'V',kind:'carton',x:0,y:0,z:0,L:400,W:300,H:200,weight:10}],box,[s]);
 assert.equal(result.valid,false);assert.match(result.issues[0].text,/坐标|编号/);
});
test('imported JSON layouts are pre-validated and unsafe CSV fields escaped',()=>{
 const app=read('src/app.mjs');assert.match(app,/importedCheck=validate\(data.placements/);assert.match(app,/safe=\/\^\\s\*\[=\+@-\]/);
});
