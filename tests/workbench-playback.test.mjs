import test from 'node:test';
import assert from 'node:assert/strict';
import {setupWorkbench} from '../src/workbench.mjs';
import {CONTAINERS} from '../src/engine.mjs';
import {intersects} from '../src/engine.mjs';

// Exercise the real adapter with DOM controls and a deterministic RAF queue.
// Rendering is intentionally absent: these tests verify state transitions,
// cargo preservation and button semantics independently from screenshot QA.
function setup({section='cargo',flow='unload',doorMode='strict',storageUnavailable=false,placements:customPlacements}={}) {
  class Element {
    constructor(id='') {this.id=id;this.dataset={};this.attributes={};this.listeners=new Map();this.disabled=false;this.textContent='';this.innerHTML='';this.value='';this.open=false;this.classes=new Set();this.classList={contains:value=>this.classes.has(value),add:value=>this.classes.add(value),remove:value=>this.classes.delete(value),toggle:(value,force)=>{const yes=force??!this.classes.has(value);if(yes)this.classes.add(value);else this.classes.delete(value);return yes;}};}
    setAttribute(name,value) {this.attributes[name]=String(value);}
    removeAttribute(name) {delete this.attributes[name];}
    getAttribute(name) {return this.attributes[name]??null;}
    querySelectorAll() {return [];}
    addEventListener(type,callback) {const list=this.listeners.get(type)||[];list.push(callback);this.listeners.set(type,list);}
    click() {if(this.disabled)return;this.dispatch('click');}
    dispatch(type,extra={}) {const event={target:this,currentTarget:this,...extra};this[`on${type}`]?.(event);for(const callback of this.listeners.get(type)||[])callback(event);}
    contains(target) {return target===this;}
    closest() {return null;}
  }
  const elements=new Map();
  const get=id=>{if(!elements.has(id))elements.set(id,new Element(id));return elements.get(id);};
  const modeButtons=['load','unload'].map(mode=>{const element=new Element();element.dataset.playbackMode=mode;return element;});
  const documentListeners=new Map();
  globalThis.document={
    getElementById:get,
    querySelectorAll:selector=>selector==='button[data-playback-mode]'?modeButtons:[],
    addEventListener:(name,fn)=>documentListeners.set(name,fn),
    hidden:false
  };
  globalThis.matchMedia=()=>({matches:false,addEventListener(){}});
  globalThis.localStorage={getItem(){if(storageUnavailable)throw new Error('Storage is unavailable');return null;},setItem(){}};
  let rafId=0,now=0;
  const pending=new Map();
  globalThis.requestAnimationFrame=callback=>{const id=++rafId;pending.set(id,callback);return id;};
  globalThis.cancelAnimationFrame=id=>pending.delete(id);
  const placements=customPlacements??[500,1800,3500].map((x,index)=>({id:`QA#${index+1}`,skuId:'QA',name:'测试纸箱',kind:'carton',x,y:100,z:0,L:600,W:600,H:500,weight:20,priority:'normal'}));
  const skus=[{id:'QA',name:'测试纸箱',kind:'carton',L:600,W:600,H:500,weight:20,qty:3,stackLimit:3,rotate:false}];
  const state={placements,skus,box:{...CONTAINERS['20GP']},section,unloadFlow:flow,unloadRemoved:[],unloadDoorMode:doorMode,unloadClearance:0,selected:null,step:null};
  const notifications=[];let adapter=null;
  adapter=setupWorkbench({state:()=>state,paint:()=>adapter?.sync(),draw(){},notify:message=>notifications.push(message),fit(){},addOne(){},auto(){}});
  adapter.sync();
  const rig={state,adapter,pending,get,modeButtons,notifications,
    frame(delta=16) {now+=delta;const batch=[...pending.values()];pending.clear();for(const callback of batch)callback(now);},
    finish(limit=500) {for(let i=0;pending.size&&i<limit;i++)this.frame();assert.equal(pending.size,0,'animation must finish');},
    mode(value) {modeButtons.find(button=>button.dataset.playbackMode===value).click();}
  };
  return rig;
}

test('workbench: whole loading preview preserves the real plan and exposes all cargo at completion',()=>{
  const r=setup(),before=structuredClone(r.state.placements);
  r.get('workflow-play').click();
  assert.equal(r.get('stage').dataset.playbackState,'running');
  r.finish();
  assert.equal(r.get('stage').dataset.playbackState,'complete');
  assert.equal(r.get('workflow-count').textContent,'3 / 3 件');
  assert.deepEqual(r.adapter.frameItems(),r.state.placements);
  assert.deepEqual(r.state.placements,before);
  assert.deepEqual(r.state.unloadRemoved,[]);
});

test('workbench: pause keeps the transient cargo stationary and resume continues its progress',()=>{
  const r=setup();
  r.get('workflow-play').click();r.frame();r.frame();
  const moving=structuredClone(r.adapter.frameItems());
  r.get('workflow-play').click();
  assert.equal(r.get('stage').dataset.playbackState,'paused');
  assert.equal(r.pending.size,0);
  r.frame(100000);
  assert.deepEqual(r.adapter.frameItems(),moving);
  r.get('workflow-play').click();r.finish();
  assert.equal(r.get('stage').dataset.playbackState,'complete');
});

test('workbench: pausing at the first zero-progress frame cannot make the staged cargo disappear',()=>{
  const r=setup();
  r.get('workflow-play').click();r.frame();
  const moving=structuredClone(r.adapter.frameItems()),motionId=r.adapter.motionId;
  assert.equal(moving.length,1);
  assert.ok(moving[0].x>r.state.box.L);
  assert.ok(motionId);
  r.get('workflow-play').click();
  assert.equal(r.get('stage').dataset.playbackState,'paused');
  assert.deepEqual(r.adapter.frameItems(),moving);
  assert.equal(r.adapter.motionId,motionId);
  assert.equal(r.pending.size,0);
});

test('workbench: full unload uses door-first order and keeps the source placements unchanged',()=>{
  const r=setup(),before=structuredClone(r.state.placements);
  r.mode('unload');r.get('workflow-play').click();r.finish();
  assert.deepEqual(r.state.unloadRemoved,['QA#3','QA#2','QA#1']);
  assert.deepEqual(r.adapter.frameItems(),[]);
  assert.deepEqual(r.state.placements,before);
  assert.equal(r.get('workflow-count').textContent,'3 / 3 件');
});

test('workbench smart playback actually moves sideways, follows the verified path and preserves source coordinates',()=>{
  const placements=[{id:'QA#1',skuId:'QA',name:'测试纸箱',kind:'carton',x:5000,y:0,z:0,L:600,W:600,H:500,weight:20,priority:'normal'}];
  const r=setup({doorMode:'smart',placements}),before=structuredClone(placements);r.mode('unload');r.get('workflow-play').click();
  const observed=[];while(r.pending.size){r.frame();const moving=r.adapter.frameItems().find(p=>p.id==='QA#1');if(moving)observed.push(moving);}
  assert.ok(observed.some(p=>p.y>0),'actual preview items perform the door alignment');
  assert.ok(observed.some(p=>p.x>r.state.box.L),'actual preview crosses the door');
  assert.deepEqual(r.state.unloadRemoved,['QA#1']);assert.deepEqual(r.state.placements,before);
});

test('workbench smart requested unload previews prerequisite blockers before the requested cargo',()=>{
  const placements=[{id:'QA#1',skuId:'QA',name:'后件',kind:'carton',x:500,y:100,z:0,L:600,W:600,H:500,weight:20,priority:'urgent'},
    {id:'QA#2',skuId:'QA',name:'前件',kind:'carton',x:3500,y:100,z:0,L:600,W:600,H:500,weight:20,priority:'normal'}];
  const r=setup({doorMode:'smart',placements});
  // A narrow measured interior blocks both a lateral bypass and lifting.
  Object.assign(r.state.box,{W:700,H:600,doorW:700,doorH:600});
  assert.equal(r.adapter.unload('QA#1'),true);
  assert.match(r.notifications.at(-1),/先卸出 1 件/);
  while(r.pending.size){r.frame();const items=r.adapter.frameItems();for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++)assert.equal(intersects(items[i],items[j]),false);}
  assert.deepEqual(r.state.unloadRemoved,['QA#2','QA#1']);
  assert.equal(r.get('stage').dataset.playbackState,'complete');
});

test('workbench: a single manual unload leaves the remaining safe next step available',()=>{
  const r=setup();
  assert.equal(r.adapter.unload('QA#3'),true);r.finish();
  assert.deepEqual(r.state.unloadRemoved,['QA#3']);
  assert.equal(r.get('workflow-next').disabled,false,'other removable cargo remains');
  assert.doesNotMatch(r.get('workflow-status').textContent,/其余货物受阻/);
  r.get('workflow-next').click();r.finish();
  assert.deepEqual(r.state.unloadRemoved,['QA#3','QA#2']);
});

test('workbench: play after one manual unload continues the remaining cargo without reloading completed cargo',()=>{
  const r=setup();
  r.adapter.unload('QA#3');r.finish();
  r.get('workflow-play').click();
  assert.deepEqual(r.state.unloadRemoved,['QA#3'],'completed removal must survive starting the remaining queue');
  r.finish();
  assert.deepEqual(r.state.unloadRemoved,['QA#3','QA#2','QA#1']);
});

test('workbench: restoring the unload page initializes both mode buttons and preview in the saved direction',()=>{
  const r=setup({section:'unload',flow:'unload'});
  assert.equal(r.get('stage').dataset.playbackMode,'unload');
  assert.equal(r.modeButtons.find(button=>button.dataset.playbackMode==='unload').getAttribute('aria-pressed'),'true');
  r.get('workflow-play').click();r.finish();
  assert.deepEqual(r.state.unloadRemoved,['QA#3','QA#2','QA#1']);
});

test('workbench: nominal door assumptions cannot start an animation that pretends to be a strict straight path',()=>{
  const r=setup({doorMode:'nominal'});
  r.get('workflow-play').click();
  assert.equal(r.pending.size,0);
  assert.equal(r.adapter.active,false);
  assert.equal(r.adapter.frameItems(),null);
  assert.match(r.notifications.at(-1),/严格直线/);
});

test('workbench: a saved upper cargo with its support removed cannot be loaded into empty space',()=>{
  const placements=[{id:'QA#2',skuId:'QA',name:'失去支撑的上层纸箱',kind:'carton',x:500,y:100,z:500,L:600,W:600,H:500,weight:20,priority:'normal'}];
  const r=setup({placements});
  r.get('workflow-play').click();
  assert.equal(r.pending.size,0,'unsupported target layout must not start loading');
  assert.equal(r.adapter.active,false);
  assert.equal(r.adapter.frameItems(),null);
  assert.match(r.notifications.at(-1),/支撑|几何/);
  assert.deepEqual(r.state.placements,placements);
});

test('workbench: changing clearance cancels an in-flight preview while preserving cargo positions',()=>{
  const r=setup(),before=structuredClone(r.state.placements);
  r.get('workflow-play').click();r.frame();r.frame();
  r.state.unloadClearance=10;
  r.get('unload-clearance').dispatch('change');
  assert.equal(r.pending.size,0);
  assert.equal(r.adapter.active,false);
  assert.equal(r.adapter.frameItems(),null);
  assert.deepEqual(r.state.placements,before);
});

test('workbench: unavailable browser storage does not prevent controls from initializing',()=>{
  let r;
  assert.doesNotThrow(()=>{r=setup({storageUnavailable:true});});
  r.get('workflow-play').click();r.finish();
  assert.equal(r.get('stage').dataset.playbackState,'complete');
});

for(const mode of ['load','unload'])test(`workbench: selecting a ${mode} step pauses at a state where its cargo is visible`,()=>{
  const r=setup(),before=structuredClone(r.state.placements);
  r.mode(mode);r.get('workflow-play').click();r.frame();r.frame();
  const button={dataset:{playbackIndex:'1',playbackId:'QA#2'}};
  r.get('workflow-steps').dispatch('click',{target:{closest:()=>button}});
  assert.equal(r.pending.size,0,'step inspection must stop the running clock');
  assert.equal(r.get('stage').dataset.playbackState,'paused');
  assert.equal(r.get('stage').dataset.playbackIndex,mode==='load'?2:1);
  assert.equal(r.state.selected,'QA#2');
  assert.ok(r.adapter.frameItems().some(p=>p.id==='QA#2'),'selected cargo must be visible');
  assert.equal(r.adapter.motionId,null,'old moving highlight must not override selection');
  assert.deepEqual(r.state.placements,before);
});
