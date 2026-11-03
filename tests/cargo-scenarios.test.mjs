import {snapshotPlacement} from '../src/cargo-spec.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {scenarios, getCargoScenario} from '../src/cargo-scenarios.mjs';
import {CONTAINERS, validate, intersects, supportOf, positiveInput} from '../src/engine.mjs';
import {autoPackThroughDoor} from '../src/door-packing.mjs';
import {CARGO_TYPES, rotateSelection, verifyDrop} from '../src/free-studio.mjs';
import {doorOpeningStatus, extractionBlockers, suggestLoadOrder, suggestUnloadOrder, unloadOne} from '../src/unloading.mjs';
import {motionPosition} from '../src/playback.mjs';
import {autoMap, buildImport, parseDelimited} from '../src/importer.mjs';
import {decoratePlacements} from '../src/manifest.mjs';

const strict = {doorMode:'strict', clearance:0};
const copy = value => JSON.parse(JSON.stringify(value));
const reportText = report => JSON.stringify(report.issues);
const cargo = (id, kind, extra = {}) => ({id, name:`${id}模拟`, kind, L:1000,W:800,H:600,
  weight:30,qty:1,rotate:true,allowTilt:false,stackLimit:1,...extra});
const position = (s, extra = {}) => ({id:`${s.id}#1`,skuId:s.id,kind:s.kind,
  L:s.L,W:s.W,H:s.H,weight:s.weight,stackLimit:s.stackLimit,x:0,y:50,z:0,heading:0,...extra});

test('scenario catalogue is frozen and each editable clone is independent', () => {
  assert.deepEqual(scenarios.map(s => s.id),['daily-mixed','irregular-equipment','door-support-boundaries']);
  assert.equal(Object.isFrozen(scenarios),true);
  assert.equal(Object.isFrozen(scenarios[0].skus[0].numbering),true);
  assert.throws(() => {scenarios[0].placements[0].x = 999;},TypeError);
  const first=getCargoScenario(),second=getCargoScenario('daily-mixed');
  first.skus[0].L=1;first.placements[0].x=999;first.notes.push('edited');
  assert.equal(second.skus[0].L,600);
  assert.equal(second.placements[0].x,200);
  assert.notDeepEqual(first.notes,second.notes);
  assert.throws(() => getCargoScenario('missing'),RangeError);
});

test('samples disclose simulated measurements and default soft or irregular cargo to one layer', () => {
  for(const s of scenarios){
    assert.ok(s.source.includes('非厂家规格'));
    assert.equal(s.skus.reduce((n,item)=>n+item.qty,0),s.placements.length);
    for(const item of s.skus){
      assert.equal(positiveInput(item),true);
      assert.equal(item.sampleOnly,true);
      assert.ok(item.name.includes('模拟，非厂家规格'));
      assert.equal(item.allowTilt,false);
      assert.equal(item.numbering.source,'system-planned');
      if(['bag','sack','irregular'].includes(item.kind))assert.equal(item.stackLimit,1);
    }
  }
  for(const kind of ['bag','sack','irregular']){
    assert.equal(CARGO_TYPES[kind].defaultStackLimit,1);
    assert.equal(CARGO_TYPES[kind].supportsStack,false);
  }
});

for(const fixture of scenarios){
  test(`${fixture.id}: authored placements are legal and every item fits the strict door`, () => {
    const s=getCargoScenario(fixture.id),before=copy(s);
    const audit=validate(s.placements,s.container,s.skus);
    assert.equal(audit.valid,true,reportText(audit));
    for(const p of s.placements){
      assert.equal(doorOpeningStatus(p,s.container,strict).ok,true,p.id);
      assert.ok(p.unitCode.startsWith('PLAN-'));
    }
    assert.deepEqual(s,before);
  });

  test(`${fixture.id}: complete unload preserves support and reversed loading has clear sampled paths`, () => {
    const s=getCargoScenario(fixture.id),before=copy(s);
    const unloading=suggestUnloadOrder(s.placements,s.container,[],strict);
    const loading=suggestLoadOrder(s.placements,s.container,strict);
    assert.equal(unloading.complete,true);
    assert.equal(loading.complete,true);
    assert.equal(new Set(unloading.order).size,s.placements.length);
    assert.deepEqual(loading.order,[...unloading.order].reverse());
    let removed=[];
    for(const id of unloading.order){
      const remaining=s.placements.filter(p=>!removed.includes(p.id));
      const item=remaining.find(p=>p.id===id);
      assert.deepEqual(extractionBlockers(item,remaining,s.container,strict),[],id);
      const next=unloadOne(s.placements,s.container,removed,id,strict);
      assert.equal(next.ok,true,next.reason);
      removed=next.removed;
      const report=validate(s.placements.filter(p=>!removed.includes(p.id)),s.container,s.skus);
      assert.equal(report.valid,true,reportText(report));
    }
    const loaded=[];
    for(const id of loading.order){
      const item=s.placements.find(p=>p.id===id);
      for(const progress of [0,.25,.5,.75,1]){
        const moving=motionPosition(item,s.container,progress,'load');
        assert.equal(loaded.some(p=>intersects(p,moving)),false,`${id} progress ${progress}`);
      }
      loaded.push(item);
      const report=validate(loaded,s.container,s.skus);
      assert.equal(report.valid,true,reportText(report));
    }
    assert.deepEqual(s,before);
  });

  test(`${fixture.id}: shipped JSON and CSV preserve cargo type, dimensions and quantity`, () => {
    const json=JSON.parse(readFileSync(new URL(`../examples/v119-${fixture.id}.json`,import.meta.url),'utf8'));
    assert.equal(json.schemaVersion,2);
    assert.equal(json.sampleOnly,true);
    assert.equal(json.scenarioId,fixture.id);
    assert.equal(json.skus.every(positiveInput),true);
    assert.deepEqual(json.skus,fixture.skus);
    assert.deepEqual(json.placements.map(p=>snapshotPlacement(p,json.skus.find(s=>s.id===p.skuId))),fixture.placements);
    const restored=decoratePlacements(JSON.parse(JSON.stringify(json.placements)),json.skus);
    const audit=validate(restored,json.container,json.skus);
    assert.equal(audit.valid,true,reportText(audit));
    assert.equal(suggestUnloadOrder(restored,json.container,[],strict).complete,true);
    const rows=parseDelimited(readFileSync(new URL(`../examples/v119-${fixture.id}.csv`,import.meta.url),'utf8'));
    const imported=buildImport(rows,autoMap(rows[0]));
    assert.deepEqual(imported.errors,[]);
    for(const original of fixture.skus){
      const item=imported.skus.find(s=>s.id===original.id);
      assert.ok(item,original.id);
      assert.deepEqual([item.kind,item.L,item.W,item.H,item.weight,item.qty],
        [original.kind,original.L,original.W,original.H,original.weight,original.qty]);
      assert.equal(item.stackLimit,1);
      assert.equal(item.numbering.source,'system-planned');
    }
  });
}

test('all three cargo manifests repack completely in each supported container without mutating input', () => {
  for(const fixture of scenarios)for(const box of Object.values(CONTAINERS)){
    const s=getCargoScenario(fixture.id),before=copy(s.skus);
    const packed=autoPackThroughDoor(s.skus,box);
    assert.equal(packed.placements.length,s.placements.length,`${fixture.id} ${box.id}`);
    assert.deepEqual(packed.unplaced,[]);
    assert.equal(packed.validation.valid,true,reportText(packed.validation));
    assert.equal(suggestUnloadOrder(packed.placements,box,[],strict).complete,true);
    assert.equal(suggestLoadOrder(packed.placements,box,strict).complete,true);
    assert.deepEqual(s.skus,before);
  }
});

test('a visible irregular cavity remains occupied and cannot nest a carton', () => {
  const s=getCargoScenario('irregular-equipment');
  const irregular=s.placements.find(p=>p.skuId==='SIM-IRR-L');
  const small=cargo('CAVITY-BOX','carton',{L:200,W:200,H:200,weight:2});
  const nested=position(small,{x:irregular.x+850,y:irregular.y+600,z:900});
  assert.equal(intersects(irregular,nested),true);
  const result=verifyDrop(nested,s.placements,s.container,[...s.skus,small]);
  assert.equal(result.ok,false);
  assert.ok(result.issues.some(issue=>issue.kind==='collision'));
});

test('soft bags and irregular tops cannot become full support even if layer limits are raised', () => {
  for(const kind of ['bag','sack','irregular']){
    const base=cargo('BASE',kind,{stackLimit:99}),top=cargo('TOP','carton',{L:400,W:300,H:200,weight:5,stackLimit:99});
    const floor=position(base),above=position(top,{x:100,y:150,z:600});
    assert.equal(supportOf(above,[floor,above]),undefined,kind);
    const audit=validate([floor,above],CONTAINERS['20GP'],[base,top]);
    assert.equal(audit.valid,false);
    assert.ok(audit.issues.some(issue=>issue.kind==='support'),kind);
    assert.equal(verifyDrop(above,[floor],CONTAINERS['20GP'],[base,top]).ok,false);
  }
});

test('exact rectangular support accepts contact but rejects a 0.01 mm gap or overhang', () => {
  const s=getCargoScenario('door-support-boundaries');
  const base=s.placements.find(p=>p.skuId==='SIM-SUPPORT-BASE');
  const top=s.placements.find(p=>p.skuId==='SIM-SUPPORT-TOP');
  assert.equal(supportOf(top,[base,top])?.id,base.id);
  assert.ok(extractionBlockers(base,[base,top],s.container,strict).some(b=>b.kind==='support'));
  assert.equal(unloadOne([base,top],s.container,[],top.id,strict).ok,true);
  for(const changed of [{...top,z:top.z+.01},{...top,x:base.x+base.L-top.L+.01}]){
    const audit=validate([base,changed],s.container,s.skus);
    assert.equal(audit.valid,false);
    assert.ok(audit.issues.some(issue=>issue.kind==='support'));
  }
});

test('door boundary distinguishes dimension fit from fixed-coordinate access at 0.01 mm', () => {
  const s=getCargoScenario('door-support-boundaries'),item=s.placements.find(p=>p.skuId==='SIM-EDGE-DOOR');
  assert.equal(doorOpeningStatus(item,s.container,strict).ok,true);
  for(const y of [item.y-.01,item.y+.01]){
    const shifted={...item,y};
    assert.equal(validate([shifted],s.container,s.skus).valid,true);
    assert.equal(doorOpeningStatus(shifted,s.container,strict).kind,'door-position');
  }
  assert.equal(doorOpeningStatus({...item,H:item.H+.01},s.container,strict).kind,'door');
  assert.equal(doorOpeningStatus(item,s.container,{...strict,clearance:.01}).ok,false);
});

test('asymmetric cargo rotates orthogonally, preserves height and round trips heading without mutation', () => {
  const s=getCargoScenario('irregular-equipment'),id='SIM-IRR-OFFSET#1',before=copy(s.placements);
  const original=s.placements.find(p=>p.id===id);
  assert.equal(original.heading,90);
  const quarter=rotateSelection(s.placements,[id],s.container,s.skus,90);
  assert.equal(quarter.ok,true,quarter.reason);
  const q=quarter.placements.find(p=>p.id===id);
  assert.deepEqual([q.L,q.W,q.H,q.heading],[original.W,original.L,original.H,180]);
  const half=rotateSelection(s.placements,[id],s.container,s.skus,180);
  assert.equal(half.ok,true,half.reason);
  const h=half.placements.find(p=>p.id===id);
  assert.deepEqual([h.x,h.y,h.L,h.W,h.H,h.heading],[original.x,original.y,original.L,original.W,original.H,270]);
  let full=s.placements;
  for(let i=0;i<4;i++){
    const next=rotateSelection(full,[id],s.container,s.skus,90);
    assert.equal(next.ok,true,next.reason);full=next.placements;
  }
  assert.deepEqual(full.find(p=>p.id===id),original);
  const restored=JSON.parse(JSON.stringify({...s,placements:quarter.placements}));
  assert.equal(validate(restored.placements,restored.container,restored.skus).valid,true);
  assert.equal(restored.placements.find(p=>p.id===id).heading,180);
  assert.deepEqual(s.placements,before);
  assert.equal(rotateSelection(s.placements,[id],s.container,s.skus,37).ok,false);
  assert.equal(rotateSelection(s.placements,['SIM-IRR-L#1'],s.container,s.skus,90).ok,false);
});

test('CSV import rejects an unknown irregular type instead of silently turning it into a carton', () => {
  const rows=parseDelimited('货物编号,货物名称,长(mm),宽(mm),高(mm),毛重(kg),数量,包装类型\nX,模拟异形,900,700,1000,30,1,unknown-cavity');
  const imported=buildImport(rows,autoMap(rows[0]));
  assert.equal(imported.skus.length,0);
  assert.equal(imported.errors.length,1);
});

test('import validation rejects nonorthogonal or nonnumeric headings and traces the affected item', () => {
  const s=getCargoScenario('irregular-equipment');
  const item=s.placements.find(p=>p.skuId==='SIM-IRR-L');
  for(const heading of [37,'90',NaN,Infinity,null]){
    const audit=validate([{...item,heading}],s.container,s.skus);
    assert.equal(audit.valid,false,String(heading));
    const issue=audit.issues.find(i=>i.kind==='heading');
    assert.equal(issue?.id,item.id);
    assert.ok(issue.text.includes(item.id));
  }
  const square=cargo('LEGACY','irregular',{L:1000,W:1000,H:500});
  for(const heading of [0,90,180,270])assert.equal(validate([position(square,{heading})],s.container,[square]).valid,true);
  const legacy=position(square);delete legacy.heading;delete legacy.kind;
  assert.equal(validate([legacy],s.container,[square]).valid,true);
});

test('forged round placement kinds cannot bypass an irregular SKU outer envelope', () => {
  const source=cargo('IRREGULAR','irregular',{L:1000,W:1000,H:500,weight:20,qty:2});
  const placements=[position(source,{kind:'drum',y:6}),position(source,{id:'IRREGULAR#2',kind:'drum',x:750,y:756})];
  // Their AABBs overlap 250 x 250 mm although equal-diameter circles would not.
  const audit=validate(placements,CONTAINERS['20GP'],[source]);
  assert.equal(audit.valid,false);
  assert.equal(audit.issues.filter(i=>i.kind==='kind').length,2);
  assert.ok(audit.issues.some(i=>i.kind==='collision'));
  assert.ok(audit.issues.find(i=>i.kind==='kind').text.includes(source.id));
});

test('legacy missing kinds use trustworthy SKU classification and unknown kinds stay conservative', () => {
  const round=cargo('ROUND','drum',{L:1000,W:1000,H:500,weight:20,qty:2});
  const placements=[position(round,{y:6}),position(round,{id:'ROUND#2',x:750,y:756})];
  for(const p of placements){delete p.kind;delete p.heading;}
  assert.equal(validate(placements,CONTAINERS['20GP'],[round]).valid,true);
  const unknown={...round};delete unknown.kind;
  assert.ok(validate(placements,CONTAINERS['20GP'],[unknown]).issues.some(i=>i.kind==='collision'));
  const forged=placements.map(p=>({...p,kind:'drum'}));
  assert.ok(validate(forged,CONTAINERS['20GP'],[unknown]).issues.some(i=>i.kind==='collision'));
  const bag=cargo('SOFT','bag',{stackLimit:9}),top=cargo('TOP','carton',{L:200,W:200,H:200,stackLimit:9});
  const bottom=position(bag);delete bottom.kind;
  const above=position(top,{x:100,y:150,z:bag.H});
  assert.ok(validate([bottom,above],CONTAINERS['20GP'],[bag,top]).issues.some(i=>i.kind==='support'));
});
