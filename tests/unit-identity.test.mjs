import test from 'node:test';
import assert from 'node:assert/strict';
import {unitOrdinal,knownUnitOrdinal,withUnitOrdinals,availableUnitId} from '../src/unit-identity.mjs';

test('known ordinal uses a declared positive safe integer independently of an editable SKU code',()=>{
 const p={id:'OLD-CODE#3',skuId:'RENAMED-CODE',ordinal:7};
 assert.equal(knownUnitOrdinal(p),7);assert.equal(knownUnitOrdinal({...p,skuId:'RENAMED-AGAIN'}),7);
});

test('a valid # suffix supports legacy and renamed physical records without requiring the current SKU prefix',()=>{
 for(const [id,expected]of [['SKU#1',1],['OLD-CODE#12',12],['SKU~2#3',3],['EXT#batch#004',4],['#9',9]])assert.equal(knownUnitOrdinal({id,skuId:'NEW'}),expected,id);
});

test('source IDs and malformed suffixes do not silently become serial one',()=>{
 for(const id of ['SOURCE-PALLET','123','A#0','A#-1','A#1.5','A#1e3','A#+3','A# 2','A#2 ','A#2\n','A#NaN','A#','A#9007199254740992',''])assert.equal(knownUnitOrdinal({id}),null,id);
 for(const p of [null,undefined,{}, {id:3}])assert.equal(knownUnitOrdinal(p),null);
});

test('invalid declared serials stay invalid even when the ID has a numeric suffix',()=>{
 for(const ordinal of [0,-1,1.5,'2',NaN,Infinity,Number.MAX_SAFE_INTEGER+1,null,undefined])assert.equal(knownUnitOrdinal({id:'A#2',ordinal}),null,String(ordinal));
});

test('legacy migration allocates smallest gaps after reserving later known serials per SKU',()=>{
 const original=[{id:'SOURCE-A',skuId:'A'},{id:'A#1',skuId:'A'},{id:'SOURCE-B',skuId:'A'},{id:'A#4',skuId:'A'},{id:'SOURCE-C',skuId:'A'},{id:'SOURCE-D',skuId:'B'}],before=structuredClone(original);
 const migrated=withUnitOrdinals(original);
 assert.deepEqual(migrated.map(knownUnitOrdinal),[2,1,3,4,5,1]);assert.deepEqual(original,before);
 assert.equal(migrated[1],original[1]);assert.equal(migrated[3],original[3]);assert.notEqual(migrated[0],original[0]);
});

test('migration preserves explicit serials, duplicate serials and invalid values for validation',()=>{
 const original=[{id:'EXPLICIT',skuId:'A',ordinal:2},{id:'DUPLICATE',skuId:'A',ordinal:2},{id:'INVALID#3',skuId:'A',ordinal:0},{id:'UNDEFINED',skuId:'A',ordinal:undefined},{id:'A#bad',skuId:'A'},{id:'LEGACY',skuId:'A'}];
 const migrated=withUnitOrdinals(original);
 for(let i=0;i<5;i++)assert.equal(migrated[i],original[i]);
 assert.equal(migrated[5].ordinal,1);assert.equal(migrated[2].ordinal,0);assert.equal(Object.hasOwn(migrated[3],'ordinal'),true);
 assert.equal(knownUnitOrdinal(migrated[0]),2);assert.equal(knownUnitOrdinal(migrated[1]),2);assert.equal(knownUnitOrdinal(migrated[2]),null);
});

test('migration is stable on a second pass and can fill a new missing legacy record',()=>{
 const first=withUnitOrdinals([{id:'ORIGINAL#2',skuId:'RENAMED'},{id:'warehouse-A',skuId:'RENAMED'}]),second=withUnitOrdinals(first);
 assert.deepEqual(second,first);assert.equal(second[0],first[0]);assert.equal(second[1],first[1]);
 const later=withUnitOrdinals([...second,{id:'warehouse-B',skuId:'RENAMED'}]);assert.deepEqual(later.map(knownUnitOrdinal),[2,1,3]);
});

test('a conflicting ID suffix does not override the record declared serial during gap allocation',()=>{
 const migrated=withUnitOrdinals([{id:'A#1',skuId:'A',ordinal:4},{id:'legacy',skuId:'A'}]);
 assert.equal(knownUnitOrdinal(migrated[0]),4);assert.equal(migrated[1].ordinal,1);
});

test('nonobject records remain untouched for the schema validator',()=>{
 const invalid=[null,undefined,7,'legacy',[]];assert.deepEqual(withUnitOrdinals(invalid),invalid);
});

test('large legacy manifests allocate distinct serials without changing source record IDs',()=>{
 const old=Array.from({length:10000},(_,i)=>({id:`warehouse-${i}`,skuId:'A'})),migrated=withUnitOrdinals([{id:'A#2',skuId:'A'},...old]);
 assert.equal(migrated.length,10001);assert.equal(migrated[1].ordinal,1);assert.equal(migrated[2].ordinal,3);assert.equal(migrated.at(-1).ordinal,10001);
 assert.equal(new Set(migrated.map(knownUnitOrdinal)).size,10001);assert.deepEqual(migrated.slice(1).map(p=>p.id),old.map(p=>p.id));assert.equal(Object.hasOwn(old[0],'ordinal'),false);
});

test('the existing unitOrdinal fallback API and collision-free generated IDs remain compatible',()=>{
 assert.equal(unitOrdinal({id:'legacy'}),1);assert.equal(unitOrdinal({id:'123'}),123);assert.equal(unitOrdinal({id:'OLD#4',ordinal:2}),2);
 const placements=[{id:'A#1'},{id:'A~2#1'}];assert.equal(availableUnitId('A',1,placements),'A~3#1');assert.equal(availableUnitId('A',2,placements),'A#2');
});
