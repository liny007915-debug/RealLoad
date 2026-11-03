import test from 'node:test';
import assert from 'node:assert/strict';
import {containerParts,containerPartModel,CONTAINER_GEOMETRY,resolveContainerAppearance,containerDoorReach} from '../src/container-geometry.mjs';
import {CONTAINERS} from '../src/engine.mjs';
const box=CONTAINERS['20GP'];
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
const point=(m,[x,y,z])=>[m[0]*x+m[4]*y+m[8]*z+m[12],m[1]*x+m[5]*y+m[9]*z+m[13],m[2]*x+m[6]*y+m[10]*z+m[14]];

test('complete physical container includes all six closures, eight castings, base and door hardware',()=>{
 const parts=containerParts(box,{doorAngle:0});
 for(const name of ['left-wall','right-wall','front-wall','roof','door-sill','floor-crossmember','door-jamb','door-header','door-gasket','hinge-pin','locking-rod','locking-handle'])assert.ok(parts.some(p=>p.name===name),name);
 assert.equal(parts.filter(p=>p.name==='door-leaf').length,2);
 assert.equal(parts.filter(p=>p.name==='corner-casting').length,8);
 assert.equal(parts.filter(p=>p.name==='corner-post').length,4);
 assert.equal(parts.filter(p=>p.name==='locking-rod').length,4);
});

test('changed real clearances drive the same wall extents and exact door opening without mutating input',()=>{
 for(const dimensions of [box,{...box,L:6123.125,W:2456.75,H:2567.5,doorW:2111.25,doorH:2177.125}]){
  const before=JSON.stringify(dimensions),parts=containerParts(dimensions,{doorAngle:0});
  const left=parts.find(p=>p.name==='left-wall'),right=parts.find(p=>p.name==='right-wall'),roof=parts.find(p=>p.name==='roof');
  near(left.w,dimensions.L/1000);near(left.h,dimensions.H/1000);near(right.z-left.z,dimensions.W/1000+.066);
  assert.ok(left.z+left.d/2<=0);assert.ok(right.z-right.d/2>=dimensions.W/1000);assert.ok(roof.y-roof.h/2>=dimensions.H/1000);
  const jambs=parts.filter(p=>p.name==='door-jamb').sort((a,b)=>a.z-b.z),header=parts.find(p=>p.name==='door-header');
  near(jambs[1].z-jambs[1].d/2-(jambs[0].z+jambs[0].d/2),dimensions.doorW/1000);
  near(header.y-header.h/2,dimensions.doorH/1000);
  assert.ok(parts.filter(p=>p.group==='base').every(p=>p.y+p.h/2<=0));
  assert.equal(JSON.stringify(dimensions),before);
 }
});

test('double doors rotate rigidly about opposite hinges and do not change the stored container',()=>{
 const closed=containerParts(box,{doorAngle:0}),opened=containerParts(box,{doorAngle:112});
 assert.equal(closed.length,opened.length);
 for(let i=0;i<closed.length;i++){
  if(closed[i].group!=='door'){assert.deepEqual(closed[i],opened[i]);continue;}
  const m=containerPartModel(opened[i]),c=containerPartModel(closed[i]);
  const edge=[[.5,.5,.5],[-.5,.5,.5]];
  near(Math.hypot(...point(m,edge[0]).map((v,j)=>v-point(m,edge[1])[j])),Math.hypot(...point(c,edge[0]).map((v,j)=>v-point(c,edge[1])[j])));
 }
 assert.ok(opened.filter(p=>p.name==='door-leaf').every(p=>p.x>box.L/1000+.3));
 assert.ok(containerDoorReach(box,{walls:true,wallOpacity:1,doorAngle:112})>1);
});

test('opacity is continuous through both endpoints and independent of structural cutaway or door opening',()=>{
 for(const a of [0,.01,.18,.35,.5,.99,1])near(resolveContainerAppearance({walls:true,wallOpacity:a}).opacity,a);
 assert.equal(resolveContainerAppearance({walls:false,wallOpacity:1}).opacity,0);
 assert.equal(resolveContainerAppearance({wallOpacity:4}).opacity,1);
 assert.equal(resolveContainerAppearance({wallOpacity:-4}).opacity,0);
 const settings={wallOpacity:.65,containerView:'cutaway',doorAngle:42};
 assert.deepEqual(resolveContainerAppearance(settings),{opacity:.65,containerView:'cutaway',doorAngle:42});
 assert.deepEqual(settings,{wallOpacity:.65,containerView:'cutaway',doorAngle:42});
});

test('cutaway removes the roof and only the camera-facing side while retaining a physical door and frame',()=>{
 for(const [eye,kept] of [[[10,5,10],'left-wall'],[[10,5,-10],'right-wall']]){
  const parts=containerParts(box,{containerView:'cutaway',eye});
  assert.equal(parts.some(p=>p.name==='roof'),false);assert.ok(parts.some(p=>p.name===kept));
  assert.equal(parts.filter(p=>p.name.endsWith('-wall')).length,2);
  assert.equal(parts.filter(p=>p.name==='corner-casting').length,8);assert.equal(parts.filter(p=>p.name==='door-leaf').length,2);
 }
});

test('corrugated sheets have finite real folded surfaces and consistent winding for transparent culling',()=>{
 for(const [name,mesh] of Object.entries(CONTAINER_GEOMETRY)){
  assert.equal(mesh.length%24,0);let sloping=0;
  for(let i=0;i<mesh.length;i+=24){
   const a=Array.from(mesh.slice(i,i+3)),b=Array.from(mesh.slice(i+8,i+11)),c=Array.from(mesh.slice(i+16,i+19)),n=Array.from(mesh.slice(i+3,i+6));
   assert.ok(Array.from(mesh.slice(i,i+24)).every(Number.isFinite));assert.ok([...a,...b,...c].every(v=>Math.abs(v)<=.500001));
   const u=b.map((v,j)=>v-a[j]),v=c.map((v,j)=>v-a[j]),cross=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
   assert.ok(cross.reduce((sum,value,j)=>sum+value*n[j],0)>-1e-8,name+' inverted face');
   if(n.filter(value=>Math.abs(value)>.01).length>1)sloping++;
  }
  assert.ok(sloping>20,name+' must contain actual corrugations');
 }
});

test('impossible door dimensions fail before rendering instead of drawing a misleading aperture',()=>{
 assert.throws(()=>containerParts({...box,doorW:box.W+1}),/门洞/);
 assert.throws(()=>containerParts({...box,doorH:box.H+1}),/门洞/);
});
