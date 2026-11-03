import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseDelimited,autoMap,buildImport} from '../src/importer.mjs';
import {groupSummary,makeNumbering,unitNumber,decoratePlacements} from '../src/manifest.mjs';
const importCSV=(csv)=>{const rows=parseDelimited(csv);return buildImport(rows,autoMap(rows[0]));};
test('a zero-stock template renders without inventing or generating a unit number',()=>{
 const empty={id:'EMPTY',name:'零库存模板',kind:'carton',qty:0};
 assert.equal(unitNumber(empty,1),'');
 assert.equal(unitNumber(empty,0),'');
 assert.equal(unitNumber(empty,NaN),'');
});
test('a warehouse record ID does not replace the declared physical serial in unit labels',()=>{
 const sku={id:'SKU-A',qty:4,kind:'carton',numbering:{mode:'range',prefix:'BOX-',start:101,width:3,source:'source-provided'}};
 const [unit]=decoratePlacements([{id:'WAREHOUSE-PHYSICAL-3',skuId:sku.id,ordinal:3}], [sku]);
 assert.equal(unit.unitCode,'BOX-103');
 assert.equal(unit.id,'WAREHOUSE-PHYSICAL-3');
 assert.equal(unit.ordinal,3);
});
test('maps PO/group/carton/pallet/lot/destination separately from SKU',()=>{
 const r=importCSV('订单号,货物组,SKU,品名,外箱号,托盘号,批次号,目的地,长(cm),宽(cm),高(cm),单件毛重(kg),箱数,包装类型\nPO-A,G01,BX-01,五层瓦楞纸箱,CT-001~CT-003,,LOT-23,横滨,60.25,40,35,18.375,3,纸箱');
 assert.deepEqual(r.errors,[]);const a=r.skus[0];assert.equal(a.skuCode,'BX-01');assert.equal(a.orderNo,'PO-A');assert.equal(a.groupId,'G01');assert.equal(a.cartonNo,'CT-001~CT-003');assert.equal(a.batchNo,'LOT-23');assert.equal(a.destination,'横滨');assert.equal(a.L,602.5);assert.equal(a.weight,18.375);assert.deepEqual([1,2,3].map(n=>unitNumber(a,n)),['CT-001','CT-002','CT-003']);
});
test('same SKU in different groups creates separate records with preserved external code',()=>{
 const r=importCSV('SKU,货物组,外箱号,长(mm),宽(mm),高(mm),单件毛重(kg),数量\nSKU-A,红色订单,BOX-001,600,400,300,10,1\nSKU-A,蓝色订单,BOX-002,600,400,300,10,1');
 assert.equal(r.errors.length,0);assert.equal(r.skus.length,2);assert.notEqual(r.skus[0].id,r.skus[1].id);assert.equal(r.skus[1].skuCode,'SKU-A');assert.equal(groupSummary(r.skus).length,2);
});
test('reject reused physical carton number even across different SKU and group',()=>{
 const r=importCSV('SKU,货物组,外箱号,长(mm),宽(mm),高(mm),单件毛重(kg),数量\nA,一组,CT-21,600,400,300,10,1\nB,二组,CT-21,600,400,300,10,1');
 assert.equal(r.errors.length,1);assert.match(r.errors[0].message,/重复/);assert.equal(r.skus.length,1);
});
test('single box number with quantity more than 1 is rejected rather than cloned',()=>{
 const r=importCSV('SKU,外箱号,长(mm),宽(mm),高(mm),单件毛重(kg),数量\nA,CT-009,600,400,300,10,6');
 assert.equal(r.skus.length,0);assert.match(r.errors[0].message,/只标识单件/);
});
test('number range quantity mismatch blocked',()=>{
 assert.throws(()=>makeNumbering({external:'CT-001~CT-005',quantity:4}),/不匹配/);
});
test('planned labels are marked and never described as a verified GS1 number',()=>{
 const r=importCSV('SKU,货物组,长(mm),宽(mm),高(mm),单件毛重(kg),数量\nA,客户A,600,400,300,10,4');
 const a=r.skus[0];assert.equal(a.numbering.source,'system-planned');assert.match(unitNumber(a,1),/^PLAN-/);assert.notEqual(unitNumber(a,1),unitNumber(a,2));
 const p=decoratePlacements([{id:'A#2',skuId:'A',x:0,y:0,z:0,L:600,W:400,H:300,weight:10}],r.skus)[0];assert.equal(p.unitCode,unitNumber(a,2));assert.equal(p.groupId,'客户A');
});
test('source-compatible app contains grouped UI, scene labels and traceable export',()=>{
 const root=new URL('../',import.meta.url);const html=readFileSync(new URL('index.html',root),'utf8'),app=readFileSync(new URL('src/app.mjs',root),'utf8'),gl=readFileSync(new URL('src/webgl.mjs',root),'utf8');
 for(const id of ['group-filter','group-overview','import-preview-body'])assert.ok(html.includes(id));
 assert.match(app,/groupSummary/);assert.match(app,/decoratePlacements/);assert.match(gl,/unitCode/);
});
test('two records for the same SKU and group have distinct planned unit numbers',()=>{
 const r=importCSV('SKU,货物组,批次号,长(mm),宽(mm),高(mm),单件毛重(kg),数量\nA,G,LOT-1,600,400,300,10,2\nA,G,LOT-2,600,400,300,10,2');
 assert.equal(r.errors.length,0);assert.notEqual(unitNumber(r.skus[0],1),unitNumber(r.skus[1],1));
});
test('unsupported packaging type is not silently portrayed as corrugated carton',()=>{
 const r=importCSV('SKU,包装类型,长(mm),宽(mm),高(mm),单件毛重(kg),数量\nA,IBC罐,600,400,300,10,1');
 assert.equal(r.skus.length,0);assert.match(r.errors[0].message,/不在当前支持/);
});
