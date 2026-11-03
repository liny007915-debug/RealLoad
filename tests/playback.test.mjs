import test from 'node:test';
import assert from 'node:assert/strict';
import {createPlayback, motionPosition} from '../src/playback.mjs';

function rig(hooks={}) {
  let nextId=1, now=0, maximumPending=0;
  const pending=new Map(), history=new Map(), frames=[], commits=[], states=[];
  const playback=createPlayback({
    requestFrame(fn) {const id=nextId++; pending.set(id,fn); history.set(id,fn); maximumPending=Math.max(maximumPending,pending.size); return id;},
    cancelFrame(id) {pending.delete(id);},
    onFrame(state) {frames.push(state); hooks.onFrame?.(state,playback);},
    onCommit(commit) {commits.push(commit); hooks.onCommit?.(commit,playback);},
    onState(state) {states.push(state); hooks.onState?.(state,playback);}
  });
  return {playback,pending,history,frames,commits,states,
    get maximumPending(){return maximumPending;},
    frame(delta=16) {now+=delta; const batch=[...pending.values()]; pending.clear(); for(const callback of batch) callback(now);},
    finish(limit=300) {for(let i=0;pending.size&&i<limit;i++) this.frame(); assert.equal(pending.size,0,'animation must finish within a bounded number of frames');}
  };
}

test('playback: one clock commits each physical item exactly once in supplied order',()=>{
  const r=rig(),order=['rear-base','rear-top','door-cargo'];
  r.playback.start({order,mode:'load',duration:64});
  order.reverse();
  r.playback.resume(); r.playback.resume();
  r.finish();
  assert.equal(r.maximumPending,1);
  assert.deepEqual(r.commits.map(c=>c.id),['rear-base','rear-top','door-cargo']);
  assert.deepEqual(r.commits.map(c=>c.index),[1,2,3]);
  assert.ok(r.commits.every(c=>c.mode==='load'&&c.total===3));
  assert.equal(r.playback.state.status,'complete');
  assert.equal(r.playback.state.id,null);
  assert.equal(r.playback.state.index,3);
});

test('playback: pausing preserves progress and resuming excludes wall-clock time spent paused',()=>{
  const r=rig();
  r.playback.start({order:['A'],duration:64});
  r.frame(); r.frame();
  const progress=r.playback.state.progress;
  assert.equal(progress,.25);
  r.playback.pause(); r.playback.pause();
  assert.equal(r.pending.size,0);
  r.frame(100000);
  assert.equal(r.playback.state.progress,progress);
  assert.equal(r.commits.length,0);
  r.playback.resume(); r.frame();
  assert.equal(r.playback.state.progress,progress,'first resumed frame establishes a fresh timestamp');
  r.frame();
  assert.equal(r.playback.state.progress,.5);
  r.finish();
  assert.deepEqual(r.commits.map(c=>c.id),['A']);
  assert.equal(r.maximumPending,1);
});

test('playback: single-step animates exactly one cargo then pauses before the next',()=>{
  const r=rig();
  r.playback.start({order:['A','B'],mode:'unload',autoplay:false,duration:32});
  assert.equal(r.pending.size,0);
  assert.equal(r.playback.step(),true);
  assert.equal(r.playback.step(),false,'cannot start an overlapping single-step');
  r.finish();
  assert.equal(r.playback.state.status,'paused');
  assert.equal(r.playback.state.id,'B');
  assert.deepEqual(r.commits.map(c=>c.id),['A']);
  assert.equal(r.playback.step(),true);
  r.finish();
  assert.equal(r.playback.state.status,'complete');
  assert.deepEqual(r.commits.map(c=>c.id),['A','B']);
  assert.equal(r.playback.step(),false);
});

test('playback: seek clamps bounds, stops the clock, and never commits skipped cargo',()=>{
  const r=rig();
  r.playback.start({order:['A','B','C'],duration:64});
  r.frame(); r.frame();
  for(const [value,index,status] of [[1.9,1,'paused'],[-40,0,'paused'],[999,3,'complete'],[NaN,0,'paused']]) {
    r.playback.seek(value);
    assert.equal(r.playback.state.index,index);
    assert.equal(r.playback.state.status,status);
    assert.equal(r.playback.state.progress,0);
    assert.equal(r.pending.size,0);
    assert.equal(r.commits.length,0);
  }
  r.playback.seek(2); r.playback.resume(); r.finish();
  assert.deepEqual(r.commits.map(c=>c.id),['C']);
});

test('playback: background timestamp jumps cannot instantly skip a cargo',()=>{
  const r=rig();
  r.playback.start({order:['A','B'],duration:1000});
  r.frame(); r.frame(100000);
  assert.ok(r.playback.state.progress>0&&r.playback.state.progress<=.08);
  assert.equal(r.playback.state.index,0);
  assert.equal(r.commits.length,0);
  r.playback.setDuration(32);
  r.finish();
  assert.deepEqual(r.commits.map(c=>c.id),['A','B']);
});

test('playback: rapid restarts cancel old queues and stale callbacks cannot drive a new run',()=>{
  const r=rig();
  r.playback.start({order:['old-A','old-B'],duration:16});
  const oldCallback=[...r.history.values()][0];
  r.playback.start({order:['new-A'],mode:'unload',duration:32});
  const framesBefore=r.frames.length;
  oldCallback(9999);
  assert.equal(r.frames.length,framesBefore,'cancelled old callbacks are inert');
  assert.equal(r.pending.size,1);
  r.finish();
  assert.deepEqual(r.commits.map(c=>c.id),['new-A']);
  assert.equal(r.maximumPending,1);
});

test('playback: cancelling inside a frame emits no commit and leaves no scheduled work',()=>{
  const r=rig({onFrame:(_state,p)=>p.cancel()});
  r.playback.start({order:['A'],duration:16});
  r.frame();
  assert.equal(r.playback.state.status,'idle');
  assert.equal(r.pending.size,0);
  assert.equal(r.commits.length,0);
});

test('playback: cancelling from the running state callback cannot schedule a zombie frame',()=>{
  const r=rig({onState:(state,p)=>{if(state.status==='running')p.cancel();}});
  r.playback.start({order:['A'],duration:16});
  assert.equal(r.playback.state.status,'idle');
  assert.equal(r.pending.size,0);
  assert.equal(r.frames.length,0);
});

test('playback: reentrant start from onState still owns exactly one animation clock',()=>{
  let restarted=false;
  const r=rig({onState:(state,p)=>{
    if(state.status==='running'&&!restarted) {restarted=true; p.start({order:['replacement'],duration:32});}
  }});
  r.playback.start({order:['discarded'],duration:32});
  assert.equal(r.pending.size,1);
  r.finish();
  assert.equal(r.maximumPending,1);
  assert.deepEqual(r.commits.map(c=>c.id),['replacement']);
});

test('playback: reentrant start after a completed item does not duplicate the next clock',()=>{
  let restarted=false;
  const r=rig({onState:(state,p)=>{
    if(state.status==='complete'&&!restarted) {restarted=true; p.start({order:['second-run'],duration:32});}
  }});
  r.playback.start({order:['first-run'],duration:32});
  r.finish();
  assert.equal(r.maximumPending,1);
  assert.deepEqual(r.commits.map(c=>c.id),['first-run','second-run']);
});

test('playback: cancelling inside commit cannot advance or schedule the following cargo',()=>{
  const r=rig({onCommit:(_commit,p)=>p.cancel()});
  r.playback.start({order:['A','B'],duration:16});
  r.finish();
  assert.equal(r.playback.state.status,'idle');
  assert.deepEqual(r.commits.map(c=>c.id),['A']);
  assert.equal(r.pending.size,0);
});

test('playback: empty queues and invalid numeric options produce a finite terminal or playable state',()=>{
  const r=rig();
  r.playback.start({order:[]});
  assert.equal(r.playback.state.status,'complete');
  assert.equal(r.pending.size,0);
  r.playback.start({order:['A'],index:'invalid',duration:Infinity});
  assert.equal(r.playback.state.index,0);
  assert.equal(r.playback.state.id,'A');
  r.finish();
  assert.deepEqual(r.commits.map(c=>c.id),['A']);
});

test('playback: snapshots cannot mutate the internal queue and cancellation is idempotent',()=>{
  const r=rig();
  r.playback.start({order:['A','B'],autoplay:false});
  const state=r.playback.state;
  state.order.pop(); state.index=99;
  assert.deepEqual(r.playback.state.order,['A','B']);
  assert.equal(r.playback.state.index,0);
  r.playback.cancel(); r.playback.cancel(); r.playback.resume();
  assert.equal(r.pending.size,0);
  assert.equal(r.playback.state.status,'idle');
  assert.deepEqual(r.playback.state.order,[]);
});

test('motionPosition: fixed-axis travel is reversible, clamped and never mutates cargo dimensions',()=>{
  const item=Object.freeze({id:'unit-1',x:500,y:120,z:250,L:1200,W:800,H:500,weight:100});
  const box=Object.freeze({L:5900});
  const outside=box.L+Math.max(80,box.L*.03);
  assert.equal(motionPosition(item,box,0,'load').x,outside);
  assert.equal(motionPosition(item,box,1,'load').x,item.x);
  assert.equal(motionPosition(item,box,0,'unload').x,item.x);
  assert.equal(motionPosition(item,box,1,'unload').x,outside);
  for(const t of [-1,0,.1,.25,.5,.75,.9,1,2]) {
    const loaded=motionPosition(item,box,t,'load');
    const reversed=motionPosition(item,box,1-t,'unload');
    assert.ok(Math.abs(loaded.x-reversed.x)<1e-8);
    assert.ok(loaded.x>=item.x&&loaded.x<=outside);
    for(const field of ['y','z','L','W','H','weight','id']) assert.equal(loaded[field],item[field]);
    assert.notEqual(loaded,item);
  }
  assert.equal(item.x,500);
});
