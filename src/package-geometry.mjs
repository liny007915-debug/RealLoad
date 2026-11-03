/** Authored illustrative packaging meshes. Millimetre placement envelopes remain authoritative.
 * Inner cartons, stitches and equipment components are visual examples, never measured profiles.
 * Every primitive is bounded by [-.5,.5] on each axis; parts stay inside that same package box.
 */
const TAU=Math.PI*2;
const unit=v=>{const n=Math.hypot(...v)||1;return v.map(x=>x/n)};
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const vertex=(data,p,n,uv)=>data.push(...p,...n,...uv);

/** Small real chamfers catch light along packaging edges without enlarging it. */
function beveledBox(radius=.009){
 const data=[],steps=[-.5,-.5+radius,.5-radius,.5];
 const rounded=p=>{const inner=p.map(v=>Math.max(-.5+radius,Math.min(.5-radius,v))),delta=p.map((v,i)=>v-inner[i]),n=unit(delta);return{p:inner.map((v,i)=>v+n[i]*radius),n};};
 for(let axis=0;axis<3;axis++)for(const side of [-1,1])for(let a=0;a<3;a++)for(let b=0;b<3;b++){
  const u=(axis+1)%3,v=(axis+2)%3,points=[[a,b],[a+1,b],[a+1,b+1],[a,b+1]];
  for(const k of (side>0?[0,1,2,0,2,3]:[0,2,1,0,3,2])){
   const p=[0,0,0];p[axis]=side*.5;p[u]=steps[points[k][0]];p[v]=steps[points[k][1]];
   const q=rounded(p);vertex(data,q.p,q.n,[p[u]+.5,.5-p[v]]);
  }
 }
 return new Float32Array(data);
}
function shadowPlane(){const data=[],pts=[[-.5,0,-.5],[-.5,0,.5],[.5,0,.5],[.5,0,-.5]],uv=[[0,0],[0,1],[1,1],[1,0]];for(const k of [0,1,2,0,2,3])vertex(data,pts[k],[0,1,0],uv[k]);return new Float32Array(data);}

function tube(inner=.12,segments=40){
 const data=[];
 for(let i=0;i<segments;i++){
  const a=i/segments*TAU,b=(i+1)/segments*TAU;
  for(const [r,inside] of [[.5,false],[inner,true]]){
   const pts=[[r*Math.cos(a),-.5,r*Math.sin(a)],[r*Math.cos(b),-.5,r*Math.sin(b)],[r*Math.cos(b),.5,r*Math.sin(b)],[r*Math.cos(a),.5,r*Math.sin(a)]];
   for(const k of [0,1,2,0,2,3]){const t=k===0||k===3?a:b,n=[Math.cos(t)*(inside?-1:1),0,Math.sin(t)*(inside?-1:1)];vertex(data,pts[k],n,[[i/segments,0],[(i+1)/segments,0],[(i+1)/segments,1],[i/segments,1]][k]);}
  }
  for(const y of [-.5,.5]){
   const pts=[[.5*Math.cos(a),y,.5*Math.sin(a)],[.5*Math.cos(b),y,.5*Math.sin(b)],[inner*Math.cos(b),y,inner*Math.sin(b)],[inner*Math.cos(a),y,inner*Math.sin(a)]];
   for(const k of [0,1,2,0,2,3])vertex(data,pts[k],[0,Math.sign(y),0],[pts[k][0]+.5,.5-pts[k][2]]);
  }
 }
 return new Float32Array(data);
}
function alongX(src){const out=new Float32Array(src.length);for(let i=0;i<src.length;i+=8){out[i]=src[i+1];out[i+1]=-src[i];out[i+2]=src[i+2];out[i+3]=src[i+4];out[i+4]=-src[i+3];out[i+5]=src[i+5];out[i+6]=src[i+6];out[i+7]=src[i+7];}return out;}
function alongZ(src){const out=new Float32Array(src.length);for(let i=0;i<src.length;i+=8){out[i]=src[i];out[i+1]=-src[i+2];out[i+2]=src[i+1];out[i+3]=src[i+3];out[i+4]=-src[i+5];out[i+5]=src[i+4];out[i+6]=src[i+6];out[i+7]=src[i+7];}return out;}
function torus(segments=40,sides=8){
 const data=[],point=(a,b)=>[(.45+.05*Math.cos(b))*Math.cos(a),.5*Math.sin(b),(.45+.05*Math.cos(b))*Math.sin(a)];
 for(let i=0;i<segments;i++)for(let j=0;j<sides;j++){
  const a=i/segments*TAU,A=(i+1)/segments*TAU,b=j/sides*TAU,B=(j+1)/sides*TAU,angles=[[a,b],[A,b],[A,B],[a,B]];
  for(const k of [0,1,2,0,2,3]){const [u,v]=angles[k];vertex(data,point(u,v),unit([Math.cos(u)*Math.cos(v)/.05,Math.sin(v)/.5,Math.sin(u)*Math.cos(v)/.05]),[u/TAU,v/TAU]);}
 }
 return new Float32Array(data);
}
function softVolume(profile,power=.55,segments=32){
 const data=[],signed=n=>Math.sign(n)*Math.abs(n)**power;
 const pos=(i,t)=>{const [y,rx,rz]=profile[i],crease=1+.008*Math.sin(t*6+y*13);return[rx*signed(Math.cos(t))*crease,y,rz*signed(Math.sin(t))*crease]};
 const normal=(i,t)=>{const a=pos(i,t-.002),b=pos(i,t+.002),up=pos(Math.min(profile.length-1,i+1),t),down=pos(Math.max(0,i-1),t);return unit(cross(up.map((v,k)=>v-down[k]),b.map((v,k)=>v-a[k])))};
 for(let row=0;row<profile.length-1;row++)for(let i=0;i<segments;i++){
  const a=i/segments*TAU,b=(i+1)/segments*TAU,points=[[row,a],[row,b],[row+1,b],[row+1,a]];
  for(const k of [0,1,2,0,2,3]){const [r,t]=points[k];vertex(data,pos(r,t),normal(r,t),[t/TAU,(profile[r][0]+.5)]);}
 }
 for(const r of [0,profile.length-1])for(let i=0;i<segments;i++){const a=i/segments*TAU,b=(i+1)/segments*TAU,y=profile[r][0];for(const p of [[0,y,0],pos(r,a),pos(r,b)])vertex(data,p,[0,r===0?-1:1,0],[p[0]+.5,p[2]+.5]);}
 return new Float32Array(data);
}
function labelPatch(segments=16){
 const data=[];
 for(let i=0;i<segments;i++){
  const a=Math.PI/2-.34+i/segments*.68,b=Math.PI/2-.34+(i+1)/segments*.68,pts=[[a,-.5],[b,-.5],[b,.5],[a,.5]];
  for(const k of [0,1,2,0,2,3]){const [t,y]=pts[k];vertex(data,[.5*Math.cos(t),y,.5*Math.sin(t)],[Math.cos(t),0,Math.sin(t)],[1-(t-(Math.PI/2-.34))/.68,.5-y]);}
 }
 return new Float32Array(data);
}
function labelPlane(){const data=[],pts=[[.5,-.5,.5],[.5,.5,.5],[-.5,.5,.5],[-.5,-.5,.5]],uv=[[1,1],[1,0],[0,0],[0,1]];for(const k of [0,1,2,0,2,3])vertex(data,pts[k],[0,0,1],uv[k]);return new Float32Array(data);}
const bagProfile=[[-.49,.33,.32],[-.44,.44,.43],[-.28,.49,.48],[.12,.485,.49],[.31,.43,.42],[.39,.31,.30]];
const sackProfile=[[-.49,.20,.18],[-.43,.37,.34],[-.22,.49,.46],[.09,.475,.49],[.32,.34,.32],[.44,.12,.10]];
function softPatch(profile,power,a,b,minY,maxY){
 const data=[],signed=v=>Math.sign(v)*Math.abs(v)**power;
 const point=(y,t)=>{const i=Math.max(0,Math.min(profile.length-2,profile.findIndex((p,n)=>n<profile.length-1&&y<=profile[n+1][0]))),f=(y-profile[i][0])/(profile[i+1][0]-profile[i][0]),rx=profile[i][1]*(1-f)+profile[i+1][1]*f,rz=profile[i][2]*(1-f)+profile[i+1][2]*f,offset=1.008+.008*Math.sin(t*6+y*13);return[rx*signed(Math.cos(t))*offset,y,rz*signed(Math.sin(t))*offset]};
 const rows=[minY,...profile.map(p=>p[0]).filter(y=>y>minY&&y<maxY),maxY];
 for(let r=0;r<rows.length-1;r++)for(let i=0;i<12;i++){
  const t=a+(b-a)*i/12,T=a+(b-a)*(i+1)/12,pts=[[rows[r],t],[rows[r],T],[rows[r+1],T],[rows[r+1],t]];
  for(const k of [0,1,2,0,2,3]){const [y,u]=pts[k],p=point(y,u),pa=point(y,u-.002),pb=point(y,u+.002),py0=point(Math.max(profile[0][0],y-.001),u),py1=point(Math.min(profile.at(-1)[0],y+.001),u);vertex(data,p,unit(cross(py1.map((v,j)=>v-py0[j]),pb.map((v,j)=>v-pa[j]))),[1-(u-a)/(b-a),1-(y-minY)/(maxY-minY)]);}
 }
 return new Float32Array(data);
}
const bagRibbonVertices=new Float32Array([.25,.75,1.25,1.75].flatMap(v=>Array.from(softPatch(bagProfile,.55,Math.PI*v-.027,Math.PI*v+.027,-.44,.33))));
const tubeY=tube(),coreY=tube(.35),rimY=torus();
export const PACKAGE_GEOMETRY=Object.freeze({
 beveledBox:beveledBox(),shadowPlane:shadowPlane(),
 tube:tubeY,tubeX:alongX(tubeY),core:coreY,coreX:alongX(coreY),handleZ:alongZ(coreY),
 rim:rimY,rimX:alongX(rimY),labelPatch:labelPatch(),labelPlane:labelPlane(),
 softBag:softVolume(bagProfile),softSack:softVolume(sackProfile,.72),bagStraps:bagRibbonVertices,
 bagLabel:softPatch(bagProfile,.55,Math.PI/2-.35,Math.PI/2+.35,-.18,.07),
 sackLabel:softPatch(sackProfile,.72,Math.PI/2-.37,Math.PI/2+.37,-.18,.08)
});
export const ENHANCED_PACKAGES=Object.freeze(['carton','pallet','drum','roll','reel','bag','sack','irregular','crate','ibc','machine','bundle','plastic_crate','coolbox','round_pack','board']);

/** Package-local coordinates use X=length, Y=height, Z=width, normalized to the envelope. */
export function packageParts(item){
 const kind=item.kind||'carton',parts=[];
 const part=(x,y,z,w,h,d,material=kind,shape='box',tint=[1,1,1],alpha=1)=>parts.push({x,y,z,w,h,d,material,shape:material==='shippingLabel'&&shape==='box'?'labelPlane':shape==='box'&&['carton','machine','irregular','plastic','coolbox','plastic_crate'].includes(material)?'beveledBox':shape,tint,alpha});
 const heading=((Number(item.heading)||0)%360+360)%360,quarter=Math.round(heading/90)%4;
 const L=quarter%2?item.W:item.L,W=quarter%2?item.L:item.W,H=item.H;
 if(kind==='carton'){
  const inset=Math.min(3,Math.min(L,W,H)*.006),ix=inset/L,iy=inset/H,iz=inset/W,bw=1-2*ix,bh=1-2*iy,bd=1-2*iz,tape=Math.min(42/L,bw*.14),th=iy*.12;
  part(0,0,0,bw,bh,bd,'carton');
  part(0,bh/2+iy*.34,0,tape,th,bd*.98,'tape');
  for(const z of [0,bd*.405,-bd*.405])part(0,bh/2+iy*.68,z,bw*.98,th,Math.min(36/W,bd*.075),'tape');
  for(const sign of [-1,1])part(0,0,sign*(bd/2+iz*.34),tape,bh*.96,iz*.12,'tape');
  part(bw*.19,bh*.14,bd/2+iz*.84,bw*.28,bh*.27,iz*.12,'shippingLabel');
  part(-bw*.25,-bh*.27,bd/2+iz*.83,bw*.27,bh*.18,iz*.10,'handlingMark','labelPlane');
  for(const x of [-bw*.455,bw*.455])part(x,bh/2+iy*.34,bd*.18,Math.min(1.2/L,bw*.004),th,bd*.40,'crease');
 }else if(kind==='pallet'){
  const base=Math.min(144/H,.17),bottom=-.5,load=1-base,loadBottom=bottom+base,loadCenter=loadBottom+load/2;
  for(const z of [-.32,0,.32])part(0,bottom+base*.23,z,.96,base*.42,.15,'pallet');
  for(const x of [-.386,-.193,0,.193,.386])part(x,bottom+base*.76,0,.158,base*.20,.97,'board');
  // Illustrative interlocked inner cartons belong to one supplied handling-unit envelope.
  const gapX=Math.min(8/L,.016),gapZ=Math.min(8/W,.016),gapY=Math.min(7/H,.012);
  for(let level=0;level<3;level++)for(let col=0;col<(level===1?3:2);col++)for(let row=0;row<2;row++){
   const cols=level===1?3:2,cell=.94/cols,x=(col-(cols-1)/2)*cell,z=(row-.5)*.47,y=loadBottom+(level+.5)*load/3,variation=(col+row+level)%3*.023;
   part(x,y,z,cell-gapX,load/3-gapY,.47-gapZ,'carton','box',[1-variation,1-variation*.8,.98-variation*.6]);
   if(level===2)part(x,y+load/6-gapY*.20,z,.035,Math.max(.0004,gapY*.28),.45-gapZ,'tape');
   if(row===1&&col===cols-1)part(x+.015,y+.015,.473,.19,load*.075,.003,'shippingLabel');
  }
  // Clear wrap is separate from the cartons, with sparse overlapping film courses.
  part(0,loadCenter,0,.975,load*.995,.975,'wrap','box',[1,1,1],.045);
  for(const v of [-.39,-.16,.08,.32])part(0,loadCenter+load*v,0,.979,load*.012,.979,'wrap','box',[1,1,1],.13);
  for(const x of [-.27,.27])part(x,loadCenter,.49,.016,load*.98,.004,'strap');
 }else if(kind==='drum'){
  part(0,-.005,0,.948,.91,.948,'drum','cylinder');
  for(const y of [-.465,.465])part(0,y,0,.982,.025,.982,'drum','rim',[.92,.96,.99]);
  for(const y of [-.22,.22])part(0,y,0,.975,.039,.975,'drum','rim',[.96,.98,1]);
  part(0,.442,0,.94,.026,.94,'drum','cylinder',[1.06,1.07,1.07]);
  for(const [x,z,r] of [[.22,.12,.105],[-.22,-.10,.064]]){
   part(x,.466,z,r,.026,r,'metal','cylinder',[.66,.71,.73]);
   part(x,.485,z,r*.76,.014,r*.76,'drum','cylinder',[.63,.72,.76]);
  }
  part(0,-.02,0,.959,.23,.959,'shippingLabel','labelPatch');
 }else if(kind==='roll'){
  part(0,0,0,.96,.95,.96,'roll','tube');
  for(const y of [-.477,.477])part(0,y,0,.962,.006,.962,'rollEnd','tube');
  part(0,0,0,.230,.96,.230,'corePaper','core');
  part(0,-.12,0,.969,.18,.969,'shippingLabel','labelPatch');
 }else if(kind==='reel'){
  part(0,0,0,.74,.40,.40,'corePaper','tubeX');
  part(0,0,0,.72,.70,.70,'cable','tubeX');
  for(let i=0;i<11;i++)part(-.32+i*.064,0,0,.012,.706,.706,'cable','rimX',[.91,.92,.93]);
  for(const x of [-.425,.425]){
   part(x,0,0,.11,.96,.96,'reel','tubeX');
   part(x,0,0,.119,.20,.20,'corePaper','coreX');
   for(let i=0;i<6;i++){const a=(i+.5)/6*TAU;part(x+Math.sign(x)*.059,.33*Math.cos(a),.33*Math.sin(a),.008,.045,.045,'metal','cylinderX',[.50,.53,.51]);}
  }
 }else if(kind==='bag'){
  part(0,0,0,.97,.99,.97,'jute','softBag');
  part(0,.405,0,.19,.07,.18,'jute','cylinder',[.93,.91,.83]);
  for(const x of [-.315,.315])for(const z of [-.30,.30])part(x,.405,z,.13,.17,.035,'strap','handleZ');
  part(0,0,0,.97,.99,.97,'strap','bagStraps');
  part(0,0,0,.97,.99,.97,'shippingLabel','bagLabel');
 }else if(kind==='sack'){
  part(0,0,0,.97,.99,.97,'sack','softSack');
  part(0,.446,0,.20,.043,.16,'sack','cylinder',[.89,.87,.78]);
  part(0,.476,0,.26,.018,.16,'strap');
  part(0,0,0,.97,.99,.97,'shippingLabel','sackLabel');
 }else if(kind==='crate'){
  part(0,0,0,.94,.94,.94,'crate');
  for(const z of [-.482,.482]){
   for(let i=0;i<6;i++)part(-.40+i*.16,0,z,.153,.94,.025,'board','box',[1-i%3*.04,.96-i%3*.03,.88]);
   for(const y of [-.37,.37])part(0,y,z,.98,.072,.030,'board');
   for(const x of [-.41,.41])for(const y of [-.37,.37])part(x,y,z+Math.sign(z)*.014,.012,.015,.006,'zinc','cylinderZ');
  }
  for(const x of [-.482,.482]){
   for(let i=0;i<5;i++)part(x,-.376+i*.188,0,.025,.18,.94,'board','box',[.96,.91,.83]);
   for(const z of [-.37,.37])part(x,0,z,.030,.98,.07,'board');
  }
  for(let i=0;i<6;i++)part(-.40+i*.16,.481,0,.153,.027,.96,'board');
  for(const x of [-.31,.31])part(x,-.478,0,.13,.035,.96,'pallet');
  part(.16,.13,.499,.25,.23,.001,'shippingLabel');
  part(-.25,-.03,.499,.20,.19,.001,'handlingMark','labelPlane');
 }else if(kind==='ibc'){
  for(const z of [-.32,.32])part(0,-.465,z,.97,.065,.15,'pallet');
  part(0,-.405,0,.96,.045,.95,'rubber');
  part(0,-.005,0,.81,.77,.81,'plastic');
  for(const z of [-.447,.447])for(let i=0;i<5;i++)part(-.41+i*.205,-.015,z,.012,.80,.015,'zinc');
  for(const x of [-.447,.447])for(const z of [-.41,0,.41])part(x,-.015,z,.015,.80,.012,'zinc');
  for(const y of [-.35,-.11,.14,.37]){
   for(const z of [-.447,.447])part(0,y,z,.91,.016,.016,'zinc');
   for(const x of [-.447,.447])part(x,y,0,.016,.016,.91,'zinc');
  }
  part(0,.401,0,.19,.042,.19,'rubber','cylinder');
  part(0,.431,0,.15,.020,.15,'drum','cylinder');
  part(0,-.30,.438,.12,.09,.09,'rubber','cylinderZ');
  part(0,-.27,.485,.15,.024,.023,'drum');
  part(.14,.10,.413,.28,.21,.002,'shippingLabel');
 }else if(kind==='machine'){
  part(0,.01,0,.93,.85,.91,'machine');
  for(const x of [-.35,.35])for(const z of [-.34,.34])part(x,-.455,z,.11,.085,.14,'rubber');
  part(.12,.02,.463,.54,.66,.012,'machine','box',[.91,.94,.92]);
  for(const x of [-.09,.35])for(const y of [-.27,.31])part(x,y,.473,.015,.015,.008,'zinc','cylinderZ');
  part(.32,.03,.478,.023,.15,.024,'zinc');
  part(-.28,.16,.466,.18,.21,.010,'rubber');
  for(let i=0;i<6;i++)part(-.28,-.16+i*.033,.468,.17,.009,.012,'rubber');
  part(-.28,.185,.476,.12,.10,.006,'drum','box',[.67,1.05,.93]);
  part(-.20,.34,.466,.041,.041,.016,'redPaint','cylinderZ');
  part(.07,-.20,.477,.20,.13,.002,'shippingLabel');
 }else if(kind==='bundle'){
  for(const z of [-.29,0,.29])for(const y of [-.19,.18])part(0,y,z,.96,.34,.265,'bundle','tubeX');
  for(const x of [-.31,.31]){
   for(const y of [-.38,.38])part(x,y,0,.028,.027,.90,'strap','box',[.44,.46,.44]);
   for(const z of [-.45,.45])part(x,0,z,.028,.78,.027,'strap','box',[.44,.46,.44]);
   part(x,-.457,0,.12,.07,.94,'pallet');
  }
 }else if(kind==='plastic_crate'){
  part(0,-.45,0,.96,.09,.96,'plastic_crate');
  for(const x of [-.44,.44])for(const z of [-.44,.44])part(x,0,z,.075,.91,.075,'plastic_crate');
  for(const y of [-.35,.34,.455]){
   for(const z of [-.46,.46])part(0,y,z,.98,.065,.065,'plastic_crate');
   for(const x of [-.46,.46])part(x,y,0,.065,.065,.98,'plastic_crate');
  }
  for(let i=-2;i<=2;i++){
   for(const z of [-.46,.46])part(i*.17,-.04,z,.026,.70,.03,'plastic_crate');
   for(const x of [-.46,.46])part(x,-.04,i*.17,.03,.70,.026,'plastic_crate');
  }
  part(.20,-.20,.478,.21,.13,.002,'shippingLabel');
 }else if(kind==='coolbox'){
  part(0,-.035,0,.95,.87,.95,'coolbox');
  part(0,.415,0,.98,.13,.98,'plastic','box',[.91,.95,.94]);
  for(const z of [-.476,.476])part(0,.34,z,.92,.016,.014,'rubber');
  for(const x of [-.32,.32]){
   part(x,.29,.482,.072,.17,.018,'rubber');
   part(x,.31,.494,.045,.10,.010,'zinc');
  }
  for(const x of [-.48,.48]){
   for(const z of [-.14,.14])part(x,.03,z,.019,.05,.04,'rubber');
   part(x,-.02,0,.022,.035,.31,'rubber');
  }
  part(0,-.16,.478,.27,.17,.002,'shippingLabel');
 }else if(kind==='round_pack'){
  part(0,0,0,.96,.96,.96,'round_pack','cylinder');
  for(const y of [-.483,.483])part(0,y,0,.98,.018,.98,'paper','cylinder');
  for(const y of [-.45,.45])part(0,y,0,.98,.028,.98,'paper','rim');
  part(0,.05,0,.969,.25,.969,'shippingLabel','labelPatch');
 }else if(kind==='board'){
  part(0,0,0,.99,.99,.99,'board');
  for(const y of [-.30,-.1,.1,.30]){
   for(const z of [-.497,.497])part(0,y,z,.98,.009,.002,'crease');
   for(const x of [-.497,.497])part(x,y,0,.002,.009,.98,'crease');
  }
 }else if(kind==='irregular'){
  for(const z of [-.34,.34])part(0,-.455,z,.96,.09,.15,'pallet');
  part(0,-.385,0,.96,.05,.93,'board');
  part(-.235,.035,-.035,.43,.80,.70,'machine');
  part(.19,-.195,.075,.43,.34,.61,'machine','box',[.84,.89,.86]);
  part(-.015,.29,-.13,.36,.13,.34,'machine','box',[.92,.96,.94]);
  part(.325,-.055,-.08,.27,.27,.30,'metal','cylinderX',[.55,.60,.58]);
  part(-.235,.15,.325,.27,.22,.018,'metal','box',[.39,.45,.43]);
  for(let i=0;i<4;i++)part(-.235,.20-i*.035,.339,.17,.009,.007,'cable');
  part(-.235,-.18,.325,.22,.16,.02,'shippingLabel');
  for(const x of [-.44,.44])for(const z of [-.405,.405])part(x,-.31,z,.055,.13,.055,'paper');
  for(const x of [-.37,.36])for(const z of [-.32,.32])part(x,-.351,z,.034,.016,.034,'metal','cylinder',[.48,.51,.48]);
 }else return null;
 return parts;
}

/** Resolve four permitted headings using the same mm envelope and placement centre as the kernel. */
export function packagePartModel(item,part){
 const q=((Math.round((Number(item.heading)||0)/90)%4)+4)%4,c=[1,0,-1,0][q],s=[0,1,0,-1][q];
 const L=(q%2?item.W:item.L)/1000,W=(q%2?item.L:item.W)/1000,H=item.H/1000;
 const x=part.x*L,z=part.z*W,w=part.w*L,h=part.h*H,d=part.d*W;
 return new Float32Array([c*w,0,s*w,0,0,h,0,0,-s*d,0,c*d,0,(item.x+item.L/2)/1000+c*x-s*z,(item.z+item.H/2)/1000+part.y*H,(item.y+item.W/2)/1000+s*x+c*z,1]);
}
