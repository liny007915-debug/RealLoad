import {readWorkspace} from '../src/workspace-storage.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {displayNumber} from '../src/precision.mjs';
import {parseMeasured,buildImport} from '../src/importer.mjs';
import {validate,CONTAINERS} from '../src/engine.mjs';
import {readFileSync} from 'node:fs';
const root=new URL('../',import.meta.url);
test('display precision 0 to 4 places, values never mutated',()=>{
 const n=1234.56789;
 assert.equal(displayNumber(n,0),'1,235');
 assert.equal(displayNumber(n,2),'1,234.57');
 assert.equal(displayNumber(n,4),'1,234.5679');
 assert.equal(n,1234.56789);
 assert.equal(displayNumber(0,2),'0.00');
});
test('imports fractional centimetres, inches and pounds without truncation',()=>{
 assert.equal(parseMeasured('12.34567','L','cm'),123.4567);
 assert.equal(parseMeasured('3.25','H','in'),82.55);
 assert.equal(parseMeasured('1.125','weight','lb'),.45359237*1.125);
});
test('unit originals are included in imported SKU for audit',()=>{
 const rows=[['货号','长(cm)','宽(mm)','高(in)','单件毛重(kg)'],['A-01','21.25','480.04','8.5','14.125']];
 const mapping={id:0,L:1,W:2,H:3,weight:4,qty:-1,kind:-1,name:-1};
 const r=buildImport(rows,mapping,{length:'mm',weight:'kg'});
 assert.equal(r.errors.length,0);
 assert.equal(r.skus[0].L,212.5);
 assert.ok(Math.abs(r.skus[0].H-215.9)<1e-10);
 assert.equal(r.skus[0].sourceMeasurements.L.raw,'21.25');
 assert.equal(r.skus[0].sourceMeasurements.H.unit,'in');
});
test('decimal placement is checked without snapping to integer',()=>{
 const b=CONTAINERS['20GP'];
 const sku={id:'D',name:'Fractional test',kind:'carton',L:300.125,W:200.5,H:120.25,qty:1,weight:1.375,stackLimit:2,rotate:true};
 const p={id:'D#1',skuId:'D',kind:'carton',x:0.375,y:0.125,z:0,L:300.125,W:200.5,H:120.25,weight:1.375};
 const report=validate([p],b,[sku]);
 assert.equal(report.valid,true);
 assert.equal(report.center.x,150.4375);
});
test('V0.7 maintains visible toggles, precision menu and progressive workbench',()=>{
 const html=readFileSync(new URL('index.html',root),'utf8');
 const css=readFileSync(new URL('src/v07.css',root),'utf8');
 const app=readFileSync(new URL('src/app.mjs',root),'utf8');
 for(const id of ['precision-select','scene-readout','axis-legend','coords-scope','library-cargo','library-edit','viewport-tabs'])assert.ok(html.includes(id));
 assert.match(css,/grid-template-columns:minmax\(260px,282px\)/);
 const legacy={box:{...CONTAINERS['20GP']},skus:[],placements:[],project:'旧版规划'};
 const restored=readWorkspace({getItem:key=>key==='realload-v06'?JSON.stringify(legacy):null},{opts:{},quote:{},mode:'iso',section:'cargo'});
 assert.equal(restored.state.project,'旧版规划');assert.equal(restored.recovery,null);
 assert.match(app,/e\.shiftKey/);
});
