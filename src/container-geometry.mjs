/** Original illustrative dry-container construction. Input clearances are mm;
 * render parts are metres. Frame profiles, corrugation and fittings are visual
 * approximations, NOT measured outside dimensions or structural specifications.
 * General construction reference: Container Handbook, section 3.1.
 * No part changes the authoritative inner box, door opening or collision model.
 */
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const paint=[.88,.96,1],frame=[.68,.79,.87],zinc=[.92,.94,.96];

export function resolveContainerAppearance(opts={}){
 const amount=Number(opts.wallOpacity);
 return{opacity:opts.walls===false?0:clamp(Number.isFinite(amount)?amount:.35,0,1),doorAngle:clamp(Number.isFinite(Number(opts.doorAngle))?Number(opts.doorAngle):112,0,150),containerView:opts.containerView==='cutaway'?'cutaway':'complete'};
}

export function containerParts(box,{doorAngle=112,containerView='complete',eye=null}={}){
 const L=box.L/1000,W=box.W/1000,H=box.H/1000;
 const dw=box.doorW/1000,dh=box.doorH/1000,left=(W-dw)/2;
 if(![L,W,H,dw,dh].every(n=>Number.isFinite(n)&&n>0)||dw>W+.000001||dh>H+.000001)throw Error('箱体与门洞尺寸无效');
 const parts=[],add=(name,x,y,z,w,h,d,material='containerPaint',tint=paint,shape='box',group='shell',yaw=0)=>{
  if(w>0&&h>0&&d>0)parts.push({name,x,y,z,w,h,d,material,tint,shape,group,yaw});
 };
 // All skin lies outside the declared clear interior.
 const cut=containerView==='cutaway',nearPositive=!eye||eye[2]>=W/2;
 if(!cut||nearPositive)add('left-wall',L/2,H/2,-.033,L,H,.062,'containerPaint',paint,'corrugatedSide');
 if(!cut||!nearPositive)add('right-wall',L/2,H/2,W+.033,L,H,.062,'containerPaint',paint,'corrugatedSide');
 add('front-wall',-.033,H/2,W/2,.062,H,W,'containerPaint',paint,'corrugatedEnd');
 if(!cut)add('roof',L/2,H+.025,W/2,L,.047,W,'containerPaint',[.96,1,1],'corrugatedRoof');
 for(const z of [-.052,W+.052])for(const y of [-.071,H+.043])
  add('side-rail',L/2,y,z,L+.12,.083,.09,'containerPaint',frame,'beveledBox','frame');
 for(const x of [-.053,L+.053])for(const z of [-.052,W+.052])
  add('corner-post',x,H/2,z,.105,H+.13,.105,'containerPaint',frame,'beveledBox','frame');
 for(const x of [-.052,L+.053])for(const y of [-.073,H+.045])
  add('end-rail',x,y,W/2,.11,.09,W+.18,'containerPaint',frame,'beveledBox','frame');
 for(const x of [-.055,L+.055])for(const z of [-.058,W+.058])for(const y of [-.088,H+.074]){
  add('corner-casting',x,y,z,.15,.13,.15,'zinc',[.78,.82,.85],'beveledBox','frame');
  // Recessed socket faces, rather than painted outline cubes.
  add('casting-socket',x,y+.066,z,.075,.0015,.042,'rubber',[.66,.68,.69],'beveledBox','frame');
  add('casting-socket',x+(x<0?-.076:.076),y,z,.0015,.040,.073,'rubber',[.62,.64,.65],'beveledBox','frame');
 }
 for(let x=.28;x<L-.14;x+=.45)add('floor-crossmember',x,-.115,W/2,.065,.10,W+.03,'containerPaint',frame,'box','base');
 for(const z of [-.065,W+.065])for(const x of [L*.32,L*.68]){
  add('vent',x,H*.88,z,.19,.10,.012,'zinc',[.80,.82,.83],'beveledBox');
  for(let row=0;row<4;row++)add('vent-slot',x,H*.88-.032+row*.021,z+(z<0?-.008:.008),.145,.006,.003,'rubber',[.68,.70,.72]);
 }
 // Measured opening determines the visible jambs; surplus width/height is infill.
 for(const z of [left-.020,left+dw+.020])add('door-jamb',L+.037,dh/2,z,.068,dh,.040,'zinc',zinc,'beveledBox','frame');
 add('door-header',L+.037,dh+.0225,W/2,.068,.045,dw+.04,'zinc',zinc,'beveledBox','frame');
 add('door-sill',L+.025,-.018,W/2,.13,.035,dw+.04,'zinc',[.75,.78,.80],'beveledBox','base');
 if(left>.005)for(const z of [left/2,W-left/2])add('door-side-infill',L+.025,H/2,z,.05,H,left,'containerPaint',frame);
 if(H-dh>.005)add('door-top-infill',L+.025,(H+dh)/2,W/2,.05,H-dh,dw,'containerPaint',frame);
 const theta=clamp(Number(doorAngle)||0,0,150)*Math.PI/180,leaf=dw/2-.009;
 for(const side of [0,1]){
  const sign=side===0?1:-1,hingeZ=side===0?left:left+dw,yaw=sign*theta;
  const door=(name,dx,y,z,w,h,d,mat='containerPaint',tint=paint,shape='box')=>{
   const c=Math.cos(yaw),s=Math.sin(yaw);
   add(name,L+.071+dx*c+z*s,y,hingeZ-dx*s+z*c,w,h,d,mat,tint,shape,'door',yaw);
  };
  door('door-leaf',0,dh/2,sign*leaf/2,.042,dh-.026,leaf,'containerPaint',paint,'corrugatedEnd');
  for(const z of [sign*.014,sign*(leaf-.014)])door('door-gasket',.025,dh/2,z,.015,dh-.012,.022,'rubber',[1,1,1]);
  for(const y of [.014,dh-.014])door('door-gasket',.025,y,sign*leaf/2,.015,.023,leaf,'rubber',[1,1,1]);
  for(const y of [.032,dh-.032])door('door-horizontal-rail',.032,y,sign*leaf/2,.036,.042,leaf-.018,'containerPaint',frame,'beveledBox');
  for(const z of [.24,.73]){
   const rodZ=sign*leaf*z;
   door('locking-rod',.057,dh/2,rodZ,.026,dh-.09,.026,'zinc',zinc,'cylinder');
   for(const y of [.12,dh*.42,dh*.75,dh-.12])door('rod-bracket',.066,y,rodZ,.036,.035,.075,'zinc',[.76,.80,.83],'beveledBox');
   door('locking-handle',.084,dh*.39,rodZ+sign*.073,.025,.027,.17,'zinc',zinc,'beveledBox');
   door('latch',.079,dh*.39,rodZ,.048,.080,.055,'containerPaint',frame,'beveledBox');
  }
  for(const y of [.22,dh*.39,dh*.68,dh-.22]){
   door('hinge-strap',.022,y,sign*.06,.037,.065,.16,'zinc',[.80,.83,.85],'beveledBox');
   door('hinge-pin',.025,y,0,.041,.091,.041,'zinc',zinc,'cylinder');
  }
  door('visual-door-marking',.024,dh*.77,sign*leaf*.54,.003,dh*.12,leaf*.54,'containerMark',[1,1,1]);
 }
 return parts;
}

export function containerPartModel(p){
 const c=Math.cos(p.yaw||0),s=Math.sin(p.yaw||0);
 return new Float32Array([c*p.w,0,-s*p.w,0,0,p.h,0,0,s*p.d,0,c*p.d,0,p.x,p.y,p.z,1]);
}

/** Extruded folded sheet, with real sloping normals on its corrugations.
 * The profile is illustrative. Vertex positions fit the normalized unit box.
 */
function corrugated(ribs=32){
 const data=[],profile=[0,.18,.35,.65,.82,1],height=[.05,.05,.43,.43,.05,.05];
 const vertex=(p,n,uv)=>data.push(...p,...n,...uv);
 const segment=(a,b,za,zb,back=false)=>{
  const dz=zb-za,dx=b-a,length=Math.hypot(dz,dx),n=back?[dz/length,0,-dx/length]:[-dz/length,0,dx/length];
  const pts=[[a,-.5,za],[b,-.5,zb],[b,.5,zb],[a,.5,za]];
  for(const k of (back?[0,2,1,0,3,2]:[0,1,2,0,2,3]))vertex(pts[k],n,[pts[k][0]+.5,pts[k][1]+.5]);
 };
 for(let r=0;r<ribs;r++)for(let i=0;i<profile.length-1;i++){
  const a=(r+profile[i])/ribs-.5,b=(r+profile[i+1])/ribs-.5,za=height[i],zb=height[i+1];
  segment(a,b,za,zb);segment(a,b,za-.085,zb-.085,true);
  for(const y of [-.5,.5]){
   const pts=[[a,y,za],[b,y,zb],[b,y,zb-.085],[a,y,za-.085]];
   for(const k of (y>0?[0,1,2,0,2,3]:[0,2,1,0,3,2]))vertex(pts[k],[0,Math.sign(y),0],[pts[k][0]+.5,pts[k][2]+.5]);
  }
 }
 for(const x of [-.5,.5]){
  const pts=[[x,-.5,.05],[x,.5,.05],[x,.5,-.035],[x,-.5,-.035]];
  for(const k of (x<0?[0,1,2,0,2,3]:[0,2,1,0,3,2]))vertex(pts[k],[Math.sign(x),0,0],[pts[k][1]+.5,pts[k][2]+.5]);
 }
 return new Float32Array(data);
}
const side=corrugated(32),end=corrugated(12);
function remap(mesh,axis){const out=new Float32Array(mesh.length);for(let i=0;i<mesh.length;i+=8){
 for(let j=0;j<3;j++){out[i+j]=mesh[i+axis[j]];out[i+3+j]=mesh[i+3+axis[j]];}out[i+6]=mesh[i+6];out[i+7]=mesh[i+7];
 }
 // Swapping axes reverses handedness; keep winding aligned with the normals.
 for(let i=0;i<out.length;i+=24)for(let k=0;k<8;k++){const a=out[i+8+k];out[i+8+k]=out[i+16+k];out[i+16+k]=a;}
 return out;}
export const CONTAINER_GEOMETRY=Object.freeze({corrugatedSide:side,corrugatedEnd:remap(end,[2,1,0]),corrugatedRoof:remap(side,[0,2,1])});

export function containerDoorReach(box,opts={}){
 // Reserve the hinge sweep in camera fitting. Changing transparency or opening
 // a door must not unexpectedly zoom or recenter the user's camera.
 return box.doorW/2000+.14;
}
