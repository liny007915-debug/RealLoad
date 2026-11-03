import test from 'node:test';
import assert from 'node:assert/strict';
import {PACKAGE_GEOMETRY,ENHANCED_PACKAGES,packageParts,packagePartModel} from '../src/package-geometry.mjs';
const cubeCorners=[-.5,.5].flatMap(x=>[-.5,.5].flatMap(y=>[-.5,.5].map(z=>[x,y,z])));
const vertices=shape=>{const mesh=PACKAGE_GEOMETRY[shape];return mesh?Array.from({length:mesh.length/8},(_,i)=>Array.from(mesh.slice(i*8,i*8+3))):cubeCorners};
const world=(m,p)=>[m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12],m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13],m[2]*p[0]+m[6]*p[1]+m[10]*p[2]+m[14]];

test('authored packaging primitives have finite normals and remain in a normalized envelope',()=>{
 for(const [name,mesh] of Object.entries(PACKAGE_GEOMETRY)){
  assert.equal(mesh.length%24,0,name);
  for(let i=0;i<mesh.length;i+=8){
   for(let j=0;j<8;j++)assert.ok(Number.isFinite(mesh[i+j]),`${name}: nonfinite vertex component`);
   for(let j=0;j<3;j++)assert.ok(Math.abs(mesh[i+j])<=.500001,`${name}: primitive crossed normalized envelope`);
   assert.ok(Math.hypot(mesh[i+3],mesh[i+4],mesh[i+5])>.9,`${name}: invalid normal`);
  }
 }
});

test('every enhanced package mesh stays inside its declared millimetre envelope at all four headings',()=>{
 for(const kind of ENHANCED_PACKAGES)for(const [L,W,H] of [[800,600,600],[5000,1200,1000],[17,23,11],[1200.125,985.75,1450.5]])for(const heading of [0,90,180,270]){
  const p=Object.freeze({id:kind,kind,x:300.125,y:700.75,z:150.5,L,W,H,heading}),snapshot=JSON.stringify(p);
  const lo=[p.x/1000,p.z/1000,p.y/1000],hi=[(p.x+p.L)/1000,(p.z+p.H)/1000,(p.y+p.W)/1000];
  for(const part of packageParts(p)){
   const m=packagePartModel(p,part);
   for(const v of vertices(part.shape)){
    const q=world(m,v);
    assert.ok(q.every((n,j)=>n>=lo[j]-1e-6&&n<=hi[j]+1e-6),`${kind} ${heading}° ${part.material}/${part.shape} crossed envelope: ${q}`);
   }
  }
  assert.equal(JSON.stringify(p),snapshot);
 }
});

test('non-symmetric equipment profile rotates as a rigid visual assembly with its real envelope centre',()=>{
 const base={kind:'irregular',x:800,y:700,z:0,L:1600,W:1000,H:1450,heading:0},cx=(base.x+base.L/2)/1000,cz=(base.y+base.W/2)/1000,original=packageParts(base);
 for(const heading of [90,180,270]){
  const p={...base,heading,L:heading%180?base.W:base.L,W:heading%180?base.L:base.W};p.x=cx*1000-p.L/2;p.y=cz*1000-p.W/2;
  const rotated=packageParts(p),theta=heading*Math.PI/180;
  assert.equal(rotated.length,original.length);
  for(let i=0;i<original.length;i++)for(const v of cubeCorners){
   const a=world(packagePartModel(base,original[i]),v),b=world(packagePartModel(p,rotated[i]),v),dx=a[0]-cx,dz=a[2]-cz;
   const expected=[cx+dx*Math.cos(theta)-dz*Math.sin(theta),a[1],cz+dx*Math.sin(theta)+dz*Math.cos(theta)];
   assert.ok(b.every((n,j)=>Math.abs(n-expected[j])<1e-6));
  }
 }
 const bodies=original.filter(p=>p.material==='machine');
 assert.ok(new Set(bodies.map(p=>p.y+p.h/2)).size>=3,'equipment silhouette needs distinct heights');
 assert.ok(bodies.some(p=>p.x<-.2)&&bodies.some(p=>p.x>.1),'equipment must be visibly asymmetric');
});

test('pallet illustration separates interlocked cartons while preserving a single handling-unit input',()=>{
 const item=Object.freeze({kind:'pallet',L:1200,W:1000,H:1500}),parts=packageParts(item),cartons=parts.filter(p=>p.material==='carton');
 assert.equal(cartons.length,14);
 assert.equal(new Set(cartons.map(p=>p.y)).size,3);
 assert.ok(parts.some(p=>p.material==='wrap'&&p.alpha<.2));
 assert.ok(new Set(cartons.map(p=>p.w)).size>1,'alternate layer should have an interlocked seam pattern');
 assert.deepEqual(item,{kind:'pallet',L:1200,W:1000,H:1500});
});

test('roll and reel centre holes are genuine open geometry rather than painted discs',()=>{
 for(const name of ['tube','core']){
  const data=PACKAGE_GEOMETRY[name];let caps=0;
  for(let i=0;i<data.length;i+=24){
   const a=Array.from(data.slice(i,i+3)),b=Array.from(data.slice(i+8,i+11)),c=Array.from(data.slice(i+16,i+19));
   if(Math.abs(a[1]-b[1])>1e-6||Math.abs(a[1]-c[1])>1e-6)continue;
   caps++;
   const sign=(p,q)=>p[0]*q[2]-p[2]*q[0],s=[sign(a,b),sign(b,c),sign(c,a)];
   assert.ok(!(s.every(v=>v>=-1e-8)||s.every(v=>v<=1e-8)),`${name}: a cap triangle covers the open centre`);
  }
  assert.ok(caps>0);
 }
});

test('soft bags have shoulders and bulging sides, with fitted label and lifting-loop geometry',()=>{
 const bag=packageParts({kind:'bag',L:1000,W:1000,H:1200}),sack=packageParts({kind:'sack',L:750,W:500,H:700});
 assert.equal(bag.filter(p=>p.shape==='handleZ').length,4);
 assert.ok(bag.some(p=>p.shape==='bagStraps'));
 assert.ok(bag.some(p=>p.shape==='bagLabel'));
 assert.ok(sack.some(p=>p.shape==='sackLabel'));
 for(const shape of ['softBag','softSack']){
  const pts=vertices(shape),top=pts.filter(p=>p[1]>.30),middle=pts.filter(p=>Math.abs(p[1])<.3);
  assert.ok(Math.max(...middle.map(p=>Math.abs(p[0])))>Math.max(...top.map(p=>Math.abs(p[0]))));
 }
});
