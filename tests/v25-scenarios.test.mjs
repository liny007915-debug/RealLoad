import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {autoMap,buildImport,parseDelimited} from '../src/importer.mjs';
import {autoPack,validate,CONTAINERS} from '../src/engine.mjs';
import {suggestUnloadOrder} from '../src/unloading.mjs';
import {decoratePlacements} from '../src/manifest.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const names=fs.readdirSync(path.join(root,'V115-多场景测试表单')).filter(n=>n.endsWith('.csv')&&!n.startsWith('V115-'));
const types=['20GP','40GP','40HC'];
for(const file of names)test(`scenario ${file} parses and produces non-colliding plans for all three container types`,()=>{
 const raw=fs.readFileSync(path.join(root,'V115-多场景测试表单',file),'utf8');
 const rows=parseDelimited(raw),result=buildImport(rows,autoMap(rows[0]));
 assert.equal(result.errors.length,0,`${file}: ${JSON.stringify(result.errors)}`);
 assert.ok(result.skus.length>0);
 for(const type of types){const pack=autoPack(result.skus,CONTAINERS[type]);
  const report=validate(pack.placements,CONTAINERS[type],result.skus);
  assert.equal(report.valid,true,`${file} ${type}: ${JSON.stringify(report.issues)}`);
  const decorated=decoratePlacements(pack.placements,result.skus);
  const unload=suggestUnloadOrder(decorated,CONTAINERS[type],[],{doorMode:'strict'});
  assert.ok(unload.order.length<=decorated.length);
  assert.ok(unload.order.every(id=>decorated.some(p=>p.id===id)));
  assert.equal(new Set(unload.order).size,unload.order.length);
 }
});
