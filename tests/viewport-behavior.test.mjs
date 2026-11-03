import test from 'node:test';
import assert from 'node:assert/strict';
import {projectFactory, drawScene} from '../src/fallback-render.mjs';
import {Viewport} from '../src/webgl.mjs';

const box={L:12032,W:2350,H:2698,doorW:2340,doorH:2585};
const item={id:'UNIT-01',unitCode:'CT-001',kind:'carton',x:2400,y:200,z:0,L:600,W:500,H:400,weight:12};
const corners=b=>[0,b.L].flatMap(x=>[0,b.W].flatMap(y=>[0,b.H].map(z=>({x,y,z}))));

function browserStub(width=800,height=420){
 let captures=0;
 const gradient={addColorStop(){}};
 const ctx=new Proxy({measureText:s=>({width:String(s).length*6}),createLinearGradient:()=>gradient,createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)})},{get:(o,k)=>k in o?o[k]:()=>{},set:(o,k,v)=>(o[k]=v,true)});
 class Element{
  constructor(tag){this.tagName=tag.toUpperCase();this.style={};this.dataset={};this.children=[];this.events=new Map();this.attrs={};this.className='';this.clientWidth=width;this.clientHeight=height;this.width=width;this.height=height;}
  append(...nodes){for(const n of nodes){n.remove?.();n.parentNode=this;this.children.push(n);}}
  prepend(node){node.parentNode=this;this.children.unshift(node);}
  insertBefore(node,before){node.parentNode=this;this.children.splice(Math.max(0,this.children.indexOf(before)),0,node);}
  remove(){if(this.parentNode){this.parentNode.children=this.parentNode.children.filter(n=>n!==this);this.parentNode=null;}}
  replaceChildren(...nodes){for(const n of [...this.children])n.remove();this.append(...nodes);}
  setAttribute(key,value){this.attrs[key]=String(value);}
  getAttribute(key){return this.attrs[key];}
  addEventListener(key,fn){this.events.set(key,fn);}
  setPointerCapture(){captures++;}
  getBoundingClientRect(){return{width,height,left:0,top:0};}
  getContext(kind){return kind==='2d'?ctx:null;}
  dispatch(type,event){this.events.get(type)?.(event);}
 }
 const body={classList:{contains:()=>false}};
 globalThis.document={createElement:tag=>new Element(tag),body};
 globalThis.window={devicePixelRatio:1,innerWidth:width,innerHeight:height,addEventListener(){},removeEventListener(){}};
 globalThis.ResizeObserver=class{observe(){}disconnect(){}};
 return {Element,body,parent:new Element('div'),captures:()=>captures};
}

// Numerical checks, independent of browser screenshot dimensions or CSS declarations.
test('Canvas camera fits all eight real container corners at narrow, short and large viewports',()=>{
 for(const [w,h] of [[320,280],[390,220],[820,250],[1440,680]]){
  const camera=projectFactory(box,{yaw:.75,pitch:.45,zoom:1,persp:true},w,h);
  for(const c of corners(box)){const p=camera.point(c);assert.ok(p.x>=20&&p.x<=w-20,`${w}x${h} cropped horizontally`);assert.ok(p.y>=25&&p.y<=h-25,`${w}x${h} cropped vertically`);}
 }
});

test('Canvas focus fits the selected cargo dimensions and remains zoomable after focus',()=>{
 const center={x:item.x+item.L/2,y:item.y+item.W/2,z:item.z+item.H/2};
 const normal=projectFactory(box,{yaw:.75,pitch:.45,zoom:1,persp:true},800,420);
 const focus=projectFactory(box,{yaw:.75,pitch:.45,zoom:1,persp:true,center,dimensions:item},800,420);
 assert.ok(focus.scale>normal.scale*5);
 const middle=focus.point(center);assert.equal(middle.x,400);assert.equal(middle.y,214);
 const zoomed=projectFactory(box,{yaw:.75,pitch:.45,zoom:1.2,persp:true,center,dimensions:item},800,420);
 assert.ok(Math.abs(zoomed.scale/focus.scale-1.2)<1e-12);
});

test('very small hidden-to-visible canvases never produce negative projection scales',()=>{
 const p=projectFactory(box,{yaw:.75,pitch:.45,zoom:1,persp:true},30,30);
 assert.ok(Number.isFinite(p.scale)&&p.scale>0);
});

test('Viewport fallback keeps selected label and gizmo DOM identities while camera moves',()=>{
 const stub=browserStub();
 const view=new Viewport(stub.parent,'iso',{draw(){}});
 const state={box,items:[item],selected:item.id,opts:{coords:true,tags:true,axes:true,grid:false,dimensions:false,walls:true,wallOpacity:.12,pbr:false}};
 view.draw(state);
 const label=view.overlayNodes.get('fallback-selected');assert.ok(label);
 const handles=[...view.overlayNodes].filter(([k])=>k.startsWith('gizmo-handle:'));
 assert.ok(handles.length>0);
 view.yaw+=.015;view.draw(state);
 assert.strictEqual(view.overlayNodes.get('fallback-selected'),label);
 for(const [key,node] of handles)assert.strictEqual(view.overlayNodes.get(key),node);
 // Screen-space handles must follow the actual Canvas projection, not a separate GL camera.
 const origin=view.project([(item.x+item.L/2)/1000,(item.z+item.H/2)/1000,(item.y+item.W/2)/1000]);
 assert.equal(origin.visible,true);
 view.draw({...state,selected:null});
 assert.equal(view.overlayNodes.has('fallback-selected'),false);
 view.dispose();
});

test('touch swipes over nonfullscreen canvas cannot move cargo; stationary taps still select',()=>{
 const stub=browserStub(390,420);let selected=0,previewed=0;
 const view=new Viewport(stub.parent,'iso',{select(){selected++;},preview(){previewed++;},draw(){}});
 view.hit=()=>item;
 const pointer=(x,y)=>({button:0,pointerType:'touch',pointerId:1,clientX:x,clientY:y});
 view.canvas.dispatch('pointerdown',pointer(100,120));
 view.canvas.dispatch('pointermove',pointer(102,220));
 view.canvas.dispatch('pointerup',pointer(102,220));
 assert.equal(previewed,0);assert.equal(selected,0);assert.equal(stub.captures(),0);
 view.canvas.dispatch('pointerdown',pointer(100,120));
 view.canvas.dispatch('pointerup',pointer(100,120));
 assert.equal(selected,1);
 view.dispose();
});

test('fallback render texture quality flag and real cargo identification survive rendering',()=>{
 const stub=browserStub();
 const result=drawScene(new stub.Element('canvas'),box,[item],{cam:{yaw:.75,pitch:.45,zoom:1,persp:true},selected:item.id,pbr:false});
 assert.ok(result.hits.some(h=>h.id===item.id));
 assert.ok(result.hits.every(h=>h.pts.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y))));
});

test('playback camera keeps a fixed doorway staging area while transient cargo moves',()=>{
 const stub=browserStub(800,420);
 const view=new Viewport(stub.parent,'iso',{draw(){}});
 const opts={coords:false,tags:false,axes:false,grid:false,dimensions:false,walls:true,wallOpacity:.12,pbr:false,playback:true,motionId:item.id,playbackClearanceMm:1600};
 view.draw({box,items:[{...item,x:box.L+80}],selected:item.id,opts});
 const firstScale=view.fallbackInfo.scale;
 for(const c of corners({L:item.L,W:item.W,H:item.H})){const p=view.fallbackInfo.project({x:box.L+80+c.x,y:item.y+c.y,z:item.z+c.z});assert.ok(p.x>=0&&p.x<=800&&p.y>=0&&p.y<=420,'doorway cargo must remain visible');}
 view.draw({box,items:[item],selected:item.id,opts});
 assert.equal(view.fallbackInfo.scale,firstScale,'moving cargo cannot reframe the camera each frame');
 view.dispose();
});
