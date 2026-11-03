import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseXlsx, parseDelimited, autoMap,buildImport} from '../src/importer.mjs';
const root=new URL('../',import.meta.url);
const read=name=>readFileSync(new URL(name,root));
function asArrayBuffer(buffer){return buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength)}
test('V1.16 urgent Excel parses and maps consistent priorities and package geometry',async()=>{
 const rows=await parseXlsx(asArrayBuffer(read('templates/RealLoad-V116-急件装箱单-兼容版.xlsx')));
 const r=buildImport(rows,autoMap(rows[0]),{unit:'mm'});
 assert.equal(r.errors.length,0);
 assert.equal(r.skus.length,5);
 assert.deepEqual(r.skus.map(s=>s.priority),['urgent','urgent','high','normal','low']);
 assert.equal(r.skus.find(s=>s.id==='URG-PALLET').H,1150);
 assert.equal(r.skus.find(s=>s.id==='URG-PALLET').weight,350);
 assert.equal(r.skus.reduce((n,s)=>n+s.qty,0),17);
});
test('CSV fallback retains same SKUs and urgency labels',async()=>{
 const rows=parseDelimited(read('templates/RealLoad-V116-急件装箱单-备用.csv').toString('utf8'));
 const r=buildImport(rows,autoMap(rows[0]),{unit:'mm'});
 assert.equal(r.errors.length,0);
 assert.deepEqual(r.skus.map(x=>x.priority),['urgent','urgent','high','normal','low']);
 assert.equal(r.skus[0].qty,4);
});
test('Onboarding dock never obscures the 3D stage and guide modal is opt-in',()=>{
 const css=read('src/v26.css').toString();const app=read('src/app.mjs').toString();
 assert.match(css,/\.v116-empty-dock\{position:relative!important/);
 assert.match(app,/stage\.before\(empty\)/);
 assert.doesNotMatch(app,/if\(GUIDE_FIRST_LAUNCH\)openGuide\(0\)/);
});
test('Unloading camera controls remain wired to the viewport focus and zoom APIs',()=>{
 const app=read('src/app.mjs').toString(),html=read('index.html').toString();
 for(const id of ['v116-zoom-in','v116-zoom-out','v116-fit','v116-focus']){
  assert.ok(html.includes(`id="${id}"`));assert.ok(app.includes(`$('${id}')`));
 }
 assert.match(app,/v\.zoomBy\(1\.24\)/);
 assert.match(app,/v\.zoomBy\(1\/1\.24\)/);
 assert.match(app,/v\.focusItem\(row\)/);
 // Viewport behavior tests verify fitting by real cargo dimensions. A fixed
 // post-focus zoom would invalidate that fit and crop large or narrow cargo.
 assert.doesNotMatch(app,/v\.zoom=2\.15/);
});
test('Unloading path marker is view-dependent and non-certifying',()=>{
 const web=read('src/webgl.mjs').toString();
 assert.match(web,/v116-path-vector/);
 assert.match(web,/Math\.hypot\(pt\.x-\(pos\.x\+dx\)/);
 assert.match(web,/not a forklift trajectory/);
});
