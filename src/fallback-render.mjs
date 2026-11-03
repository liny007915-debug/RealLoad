import {containerParts,containerPartModel} from './container-geometry.mjs';
import {paintProjectedMaterial} from './material-texture.mjs';
import {packageParts,packagePartModel} from './package-geometry.mjs';
/** 3D projected geometry renderer. All geometry uses exact mm-space input.
 * The visual material is illustrative: no physical simulation or photogrammetry. */
const mix=(a,b,t)=>a.map((v,i)=>v*(1-t)+b[i]*t);
const palettes={round_pack:[185,161,118],irregular:[178,156,138],carton:[198,157,111],crate:[173,125,81],woodbase:[153,119,78],board:[201,155,106],pallet:[171,145,103],ibc:[207,216,207],drum:[73,119,143],bag:[197,187,149],roll:[204,193,172],plastic:[207,220,208],plastic_crate:[70,120,110],sack:[216,194,159],machine:[109,120,114],reel:[175,137,94],bundle:[119,141,151],coolbox:[222,233,225],other:[152,164,155]};
const c3=(v)=>`rgb(${v.map(x=>Math.round(Math.max(0,Math.min(255,x)))).join(',')})`;
const faces=[
 {normal:[1,0,0],ids:[1,2,6,5],shading:.68,key:'front'},
 {normal:[-1,0,0],ids:[0,4,7,3],shading:.68,key:'rear'},
 {normal:[0,1,0],ids:[2,3,7,6],shading:.79,key:'right'},
 {normal:[0,-1,0],ids:[0,1,5,4],shading:.76,key:'left'},
 {normal:[0,0,1],ids:[4,5,6,7],shading:1.10,key:'top'},
 {normal:[0,0,-1],ids:[0,3,2,1],shading:.5,key:'bottom'}
];
const p3=(x,y,z)=>({x,y,z});
function verts(b){return [p3(b.x,b.y,b.z),p3(b.x+b.L,b.y,b.z),p3(b.x+b.L,b.y+b.W,b.z),p3(b.x,b.y+b.W,b.z),p3(b.x,b.y,b.z+b.H),p3(b.x+b.L,b.y,b.z+b.H),p3(b.x+b.L,b.y+b.W,b.z+b.H),p3(b.x,b.y+b.W,b.z+b.H)];}
const average=pts=>p3(pts.reduce((s,p)=>s+p.x,0)/pts.length,pts.reduce((s,p)=>s+p.y,0)/pts.length,pts.reduce((s,p)=>s+p.z,0)/pts.length);
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
export function projectFactory(box,cam,w,h){
 const yaw=cam.yaw,pitch=Math.max(.004,Math.min(1.567,cam.pitch));
 const right=[-Math.sin(yaw),Math.cos(yaw),0];
 const up=[-Math.sin(pitch)*Math.cos(yaw),-Math.sin(pitch)*Math.sin(yaw),Math.cos(pitch)];
 const toward=[Math.cos(pitch)*Math.cos(yaw),Math.cos(pitch)*Math.sin(yaw),Math.sin(pitch)];
 const fit=cam.dimensions||box;
 const center=cam.center?[cam.center.x,cam.center.y,cam.center.z]:[box.L/2,box.W/2,box.H/2],dist=Math.max(box.L,box.W,box.H,fit.L,fit.W,fit.H)*1.75;
 function raw(p){const r=[p.x-center[0],p.y-center[1],p.z-center[2]];const d=dot(r,toward);const perspective=cam.persp?dist/(dist-d):1;return {x:dot(r,right)*perspective,y:dot(r,up)*perspective,depth:d};}
 const fitCenter=cam.dimensions?center:[box.L/2,box.W/2,box.H/2];
 const v=verts({x:fitCenter[0]-fit.L/2,y:fitCenter[1]-fit.W/2,z:fitCenter[2]-fit.H/2,L:fit.L,W:fit.W,H:fit.H}).map(raw);
 const minX=Math.min(...v.map(q=>q.x)),maxX=Math.max(...v.map(q=>q.x)),minY=Math.min(...v.map(q=>q.y)),maxY=Math.max(...v.map(q=>q.y));
 const scale=Math.max(.00001,Math.min(Math.max(8,w-42)/Math.max(1,maxX-minX),Math.max(8,h-74)/Math.max(1,maxY-minY)))*cam.zoom;
 const cx=cam.center?w/2:w/2-(minX+maxX)/2*scale,cy=cam.center?h/2+4:h/2+(minY+maxY)/2*scale+4;
 const point=p=>{const t=raw(p);return{x:cx+t.x*scale,y:cy-t.y*scale,depth:t.depth};};
 return {point,raw,scale,right,up,toward,pitch,yaw,cx,cy};
}
function polygon(ctx,pts,fill,stroke='#00000011',width=.65){ctx.beginPath();ctx.moveTo(pts[0].x,pts[0].y);pts.slice(1).forEach(v=>ctx.lineTo(v.x,v.y));ctx.closePath();if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.lineWidth=width;ctx.strokeStyle=stroke;ctx.stroke();}}
function line(ctx,a,b,color='#809f8f',lw=1,dash=[]){ctx.setLineDash(dash);ctx.strokeStyle=color;ctx.lineWidth=lw;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();ctx.setLineDash([]);}
function text(ctx,s,p,size=10,color='#62766a',align='center'){ctx.font=`${size}px -apple-system, BlinkMacSystemFont, sans-serif`;ctx.fillStyle=color;ctx.textAlign=align;ctx.textBaseline='middle';ctx.fillText(s,p.x,p.y);}
function drawFloor(ctx,proj,box,grid){const pl=(x,y,z=0)=>proj.point({x,y,z});const floorGrad=ctx.createLinearGradient(pl(0,0).x,pl(0,0).y,pl(0,box.W).x,pl(0,box.W).y);floorGrad.addColorStop(0,'#9c7b59');floorGrad.addColorStop(.46,'#c7a57c');floorGrad.addColorStop(1,'#9e7d5a');polygon(ctx,[pl(0,0),pl(box.L,0),pl(box.L,box.W),pl(0,box.W)],floorGrad,'#88775d',1.1);
 // The boards approximate a wood container floor. Board count follows true width;
 // thickness/finish is a visual depiction and never a structural rating.
 const boards=Math.max(8,Math.min(18,Math.round(box.W/145)));
 for(let i=1;i<boards;i++)line(ctx,pl(0,box.W*i/boards,.7),pl(box.L,box.W*i/boards,.7),'#765a3a75',.9);
 for(let i=0;i<boards;i+=3)line(ctx,pl(0,box.W*(i+.20)/boards,.8),pl(box.L,box.W*(i+.20)/boards,.8),'#d6b99550',.5);
 line(ctx,pl(box.L,0,2),pl(box.L,box.W,2),'#5b777c',5);
 // Seams, occasional nail points and fine grain that follow the measured floor axes.
 for(let i=0;i<boards;i++){
   const y=box.W*(i+.5)/boards;
   for(let x=420+(i%3)*130;x<box.L-220;x+=810){
     const a=pl(x,y,1.1),b=pl(Math.min(box.L,x+130+((i*29+x)%110)),y+8*Math.sin(x*.012+i),1.1);
     line(ctx,a,b,i%4===0?'rgba(60,44,35,.15)':'rgba(244,222,177,.20)',.65);
   }
   for(const x of [180,box.L-180]){
     const b=pl(x,y,2.0);if(Number.isFinite(b.x)&&Number.isFinite(b.y)){
       ctx.beginPath();ctx.arc(b.x,b.y,Math.min(1.4,Math.max(.5,proj.scale*24)),0,Math.PI*2);ctx.fillStyle='#493b31a4';ctx.fill();
     }
   }
 }


 if(!grid)return;for(let x=0;x<=box.L;x+=1000)line(ctx,pl(x,0),pl(x,box.W),'#a6b6a640',.8);for(let y=0;y<=box.W;y+=500)line(ctx,pl(0,y),pl(box.L,y),'#a6b6a638',.8);
}
function surfaceParts(p){
 if(p.kind==='irregular')return packageParts(p).filter(part=>part.shape==='box'||part.shape==='beveledBox'||part.shape==='cylinderX').map(part=>{
  const m=packagePartModel(p,part),points=[-.5,.5].flatMap(x=>[-.5,.5].flatMap(y=>[-.5,.5].map(z=>[
   (m[0]*x+m[4]*y+m[8]*z+m[12])*1000,
   (m[2]*x+m[6]*y+m[10]*z+m[14])*1000,
   (m[1]*x+m[5]*y+m[9]*z+m[13])*1000
  ])));
  const lo=[0,1,2].map(i=>Math.min(...points.map(q=>q[i]))),hi=[0,1,2].map(i=>Math.max(...points.map(q=>q[i])));
  return {...p,x:lo[0],y:lo[1],z:lo[2],L:hi[0]-lo[0],W:hi[1]-lo[1],H:hi[2]-lo[2],kind:part.material==='pallet'||part.material==='board'?'woodbase':part.material==='cable'?'machine':part.material,tag:'equipment-part',renderCylinder:part.shape==='cylinderX',illustration:true};
 });
 if(p.kind==='pallet'&&p.H>180){const base=Math.min(144,p.H*.20);return [{...p,H:base,kind:'woodbase',tag:'wood'},{...p,z:p.z+base,H:p.H-base,kind:'carton',tag:'wrapped'}];}
 return[{...p,tag:p.kind}];
}
function faceDetail(ctx,p,f,project,brightness,showLabels){
 const X=p.x,Y=p.y,Z=p.z,L=p.L,W=p.W,H=p.H;
 const P=(x,y,z)=>project({x,y,z});
 if(f.key==='top' && (p.tag==='carton'||p.tag==='wrapped')){
  // Printed carton flute seams and a broad packing-tape strip. Visual only; dimensions remain unchanged.
  for(let t=.12;t<.95;t+=.18){
   line(ctx,P(X+L*t,Y+W*.04,Z+H+.16),P(X+L*t,Y+W*.15,Z+H+.16),'#88663e37',.7);
  }
  const tapeW=Math.min(65,W*.12);
  polygon(ctx,[P(X,Y+W/2-tapeW/2,Z+H+.15),P(X+L,Y+W/2-tapeW/2,Z+H+.15),P(X+L,Y+W/2+tapeW/2,Z+H+.15),P(X,Y+W/2+tapeW/2,Z+H+.15)],'rgba(232,211,168,.70)',null);
  line(ctx,P(X,Y+W/2,Z+H+.35),P(X+L,Y+W/2,Z+H+.35),'#957e5b66',.8);
 }
 // Distinct packaging silhouettes/details in the Canvas fallback used by browser environments without WebGL2.
 if(p.tag==='drum'||p.tag==='roll'){
   const topZ=Z+H+.7,center=P(X+L/2,Y+W/2,topZ);const wide=P(X+L*.91,Y+W/2,topZ),side=P(X+L/2,Y+W*.91,topZ);
   const rx=Math.max(2,Math.hypot(center.x-wide.x,center.y-wide.y)),ry=Math.max(1.6,Math.hypot(center.x-side.x,center.y-side.y)*.72);
   if(f.key==='top'&&rx<240){ctx.save();ctx.beginPath();ctx.ellipse(center.x,center.y,rx,ry,0,0,Math.PI*2);ctx.fillStyle=p.tag==='drum'?'rgba(139,164,170,.85)':'rgba(243,234,208,.92)';ctx.fill();ctx.strokeStyle=p.tag==='drum'?'#466f84':'#9d8364';ctx.lineWidth=2;ctx.stroke();ctx.beginPath();ctx.ellipse(center.x,center.y,rx*.60,ry*.60,0,0,Math.PI*2);ctx.strokeStyle=p.tag==='drum'?'#577789':'#beaa8b';ctx.stroke();if(p.tag==='roll'){ctx.beginPath();ctx.ellipse(center.x,center.y,rx*.19,ry*.19,0,0,Math.PI*2);ctx.fillStyle='#73644c';ctx.fill();}ctx.restore();}
   if(f.key==='front'||f.key==='right'){
    const edge=f.key==='front'?X+L+.5:Y+W+.5;
    const strip=(z)=>f.key==='front'?line(ctx,P(edge,Y+W*.07,z),P(edge,Y+W*.93,z),'rgba(217,228,229,.78)',2.2):line(ctx,P(X+L*.07,edge,z),P(X+L*.93,edge,z),'rgba(217,228,229,.78)',2.2);
    if(p.tag==='drum')for(const t of [.18,.5,.84])strip(Z+H*t);
    if(p.tag==='roll')for(const t of [.09,.93])strip(Z+H*t);
   }
 }
 if(p.tag==='ibc'){
   if(['front','right'].includes(f.key)){
     const x=f.key==='front'?X+L+.5:null,y=f.key==='right'?Y+W+.5:null;
     for(const t of [.18,.39,.61,.82]){
       if(x!==null)line(ctx,P(x,Y+W*t,Z+H*.13),P(x,Y+W*t,Z+H*.90),'#5b6f6f9c',1.4);
       else line(ctx,P(X+L*t,y,Z+H*.13),P(X+L*t,y,Z+H*.90),'#5b6f6f9c',1.4);
     }
     for(const t of [.18,.47,.76,.91]){
       if(x!==null)line(ctx,P(x,Y+W*.06,Z+H*t),P(x,Y+W*.94,Z+H*t),'#6879789c',1.4);
       else line(ctx,P(X+L*.06,y,Z+H*t),P(X+L*.94,y,Z+H*t),'#6879789c',1.4);
     }
   }
   if(f.key==='top'){const c=P(X+L*.5,Y+W*.5,Z+H+.7);ctx.fillStyle='#495c60';ctx.beginPath();ctx.arc(c.x,c.y,Math.max(2,Math.min(6,brightness*.008)),0,Math.PI*2);ctx.fill();}
 }
 if(p.tag==='bag'&&['front','right'].includes(f.key)){
  const side=f.key==='front'?X+L+.7:Y+W+.7;
  for(const a of [.20,.76]){
    if(f.key==='front')line(ctx,P(side,Y+W*a,Z+H*.13),P(side,Y+W*a,Z+H*.96),'#d8caa17c',2.8);
    else line(ctx,P(X+L*a,side,Z+H*.13),P(X+L*a,side,Z+H*.96),'#d8caa17c',2.8);
  }
  const p1=f.key==='front'?P(side,Y+W*.20,Z+H*.96):P(X+L*.2,side,Z+H*.96);
  const p2=f.key==='front'?P(side,Y+W*.34,Z+H*1.07):P(X+L*.34,side,Z+H*1.07);
  line(ctx,p1,p2,'#dbcca4',3);
 }
 if(p.tag==='plastic_crate'&&['front','right'].includes(f.key)){
  const edge=f.key==='front'?X+L+.6:Y+W+.6;
  for(let i=1;i<5;i++)for(let j=1;j<4;j++){
   const A=f.key==='front'?P(edge,Y+W*i/5,Z+H*j/4):P(X+L*i/5,edge,Z+H*j/4);
   ctx.beginPath();ctx.arc(A.x,A.y,Math.min(3.2,Math.max(1.2,brightness*.006)),0,Math.PI*2);ctx.fillStyle='#2a5b4d9c';ctx.fill();
  }
 }
 if(p.tag==='reel'&&f.key==='front'){
  const x=X+L+.7,c=P(x,Y+W/2,Z+H/2),a=P(x,Y+W*.91,Z+H/2),b=P(x,Y+W/2,Z+H*.91),rx=Math.hypot(a.x-c.x,a.y-c.y),ry=Math.hypot(b.x-c.x,b.y-c.y);
  if(rx>2&&ry>2){ctx.beginPath();ctx.ellipse(c.x,c.y,rx,ry,0,0,2*Math.PI);ctx.fillStyle='#e1bf91';ctx.fill();ctx.strokeStyle='#775835';ctx.lineWidth=2;ctx.stroke();for(let i=0;i<6;i++){const t=i*Math.PI/3;line(ctx,c,{x:c.x+rx*Math.cos(t),y:c.y+ry*Math.sin(t)},'#947047a9',2)}ctx.beginPath();ctx.arc(c.x,c.y,Math.max(2,Math.min(rx,ry)*.18),0,2*Math.PI);ctx.fillStyle='#677477';ctx.fill();}
 }
 if(p.tag==='machine'&&['front','right'].includes(f.key)){
  const x=f.key==='front'?X+L+.7:null,y=f.key==='right'?Y+W+.7:null;
  for(let j=0;j<5;j++){
   if(x!==null)line(ctx,P(x,Y+W*.13,Z+H*(.17+j*.085)),P(x,Y+W*.51,Z+H*(.17+j*.085)),'#263d3d99',1.7);
   else line(ctx,P(X+L*.13,y,Z+H*(.17+j*.085)),P(X+L*.51,y,Z+H*(.17+j*.085)),'#263d3d99',1.7);
  }
 }
 if(p.tag==='bundle'&&f.key==='front'){
  const x=X+L+.5;for(const i of [.28,.5,.72])for(const j of [.27,.69]){
   const c=P(x,Y+W*i,Z+H*j);ctx.beginPath();ctx.arc(c.x,c.y,Math.max(1.5,Math.min(8,brightness*.009)),0,2*Math.PI);ctx.strokeStyle='#4f6065';ctx.lineWidth=1.6;ctx.stroke();
  }
 }
 if(p.tag==='coolbox'&&f.key==='top'){
  const z=Z+H+.4;polygon(ctx,[P(X+L*.08,Y+W*.08,z),P(X+L*.92,Y+W*.08,z),P(X+L*.92,Y+W*.92,z),P(X+L*.08,Y+W*.92,z)],'rgba(245,250,244,.75)','#8b9992',1.4);
 }
 if(p.tag==='sack'&&['front','right'].includes(f.key)){
  for(let i=0;i<7;i++){const v=.12+i*.11;if(f.key==='front')line(ctx,P(X+L+.8,Y+W*.08,Z+H*v),P(X+L+.8,Y+W*.92,Z+H*v),'#9c87646b',.8);else line(ctx,P(X+L*.08,Y+W+.8,Z+H*v),P(X+L*.92,Y+W+.8,Z+H*v),'#9c87646b',.8)}
 }
 if(p.tag==='board'){
   // Long wood grain lines on flat board faces; variable size reflects the true input geometry.
   if(f.key==='top'){
    for(let t=.13;t<.96;t+=.13){
     const wobble=Math.sin(t*37)*W*.014;
     line(ctx,P(X+L*.03,Y+W*t+wobble,Z+H+.24),P(X+L*.97,Y+W*t-wobble,Z+H+.24),t%.26<.15?'#7a4c2758':'#e9bc855c',Math.max(.55,brightness*.65));
    }
    line(ctx,P(X+L*.05,Y+W*.08,Z+H+.26),P(X+L*.83,Y+W*.08,Z+H+.26),'#edc79789',1);
   }else if(f.key==='front'||f.key==='rear'){
     const fx=f.key==='front'?X+L:X;
     for(let t=.24;t<1;t+=.26)line(ctx,P(fx,Y+W*t,Z+H*.15),P(fx,Y+W*t,Z+H*.88),'#7c532a56',.8);
   }else if(f.key==='left'||f.key==='right'){
     const fy=f.key==='right'?Y+W:Y;
     for(let t=.16;t<1;t+=.19)line(ctx,P(X+L*t,fy,Z+H*.16),P(X+L*t,fy,Z+H*.86),'#78502c4a',.75);
   }
  }
  if(p.tag==='carton'||p.tag==='wrapped'){
    // Cardboard vertical flute texture, intentionally understated.
    if(f.key==='front'||f.key==='rear'){
     const fx=f.key==='front'?X+L:X;
     for(let t=.12;t<.96;t+=.13)line(ctx,P(fx,Y+W*t,Z+H*.04),P(fx,Y+W*t,Z+H*.96),'#805a3650',.45);
    }else if(f.key==='left'||f.key==='right'){
     const fy=f.key==='right'?Y+W:Y;
     for(let t=.11;t<.96;t+=.13)line(ctx,P(X+L*t,fy,Z+H*.04),P(X+L*t,fy,Z+H*.96),'#805a3640',.45);
    }
  }
 if(f.key!=='top'&&(p.tag==='crate'||p.tag==='woodbase')){
  const horizontal=f.key==='front'||f.key==='rear'?W:L;
  const sideX=f.key==='front'?X+L:f.key==='rear'?X:f.key==='right'?null:null;
  if(f.key==='front'||f.key==='rear'){
   const x=sideX;
   for(let a=.14;a<1;a+=.32)line(ctx,P(x,Y+W*a,Z),P(x,Y+W*a,Z+H),'#6e4d355c',Math.max(1,Math.min(3,brightness*1.8)));
   line(ctx,P(x,Y,Z+H*.18),P(x,Y+W,Z+H*.18),'#f2d7a45f',3);
   line(ctx,P(x,Y,Z+H*.82),P(x,Y+W,Z+H*.82),'#f2d7a45f',3);
   if(p.tag==='crate')line(ctx,P(x,Y+W*.1,Z+H*.13),P(x,Y+W*.9,Z+H*.88),'#75512f9c',Math.max(2,Math.min(5,brightness*2)));
  }else if(f.key==='left'||f.key==='right'){
   const y=f.key==='right'?Y+W:Y;
   for(let a=.16;a<1;a+=.24)line(ctx,P(X+L*a,y,Z),P(X+L*a,y,Z+H),'#624a2f66',1.2);
   line(ctx,P(X,y,Z+H*.18),P(X+L,y,Z+H*.18),'#f2d7a45f',3);
   line(ctx,P(X,y,Z+H*.82),P(X+L,y,Z+H*.82),'#f2d7a45f',3);
   if(p.tag==='crate')line(ctx,P(X+L*.1,y,Z+H*.12),P(X+L*.9,y,Z+H*.88),'#75512f9c',Math.max(2,Math.min(5,brightness*2)));
  }
 }
 if(p.tag==='wood'&&(f.key==='front'||f.key==='rear'||f.key==='left'||f.key==='right')){
  // Pallet runners and slat gaps; the pallet still occupies its true outer envelope.
  if(f.key==='front'||f.key==='rear'){
   const fx=f.key==='front'?X+L:X;
   for(const t of [.16,.5,.84])line(ctx,P(fx,Y+W*t,Z+H*.16),P(fx,Y+W*t,Z+H*.86),'#5d41298e',Math.min(4,brightness*2));
  }else{
   const fy=f.key==='right'?Y+W:Y;
   for(const t of [.16,.5,.84])line(ctx,P(X+L*t,fy,Z+H*.16),P(X+L*t,fy,Z+H*.86),'#5d41298e',Math.min(4,brightness*2));
  }
 }
 // Packaging-handling marks and tension strips; appearance only, not load certification.
 if(p.tag==='carton'&&f.key==='front'){
  const fx=X+L+.9;
  for(const t of [.15,.85]){
   const x=P(fx,Y+W*t,Z+H*.18),up=P(fx,Y+W*t,Z+H*.38);
   line(ctx,x,up,'#624e3b99',Math.max(.8,brightness*.004));
   const l=P(fx,Y+W*(t-.055),Z+H*.31),r=P(fx,Y+W*(t+.055),Z+H*.31);
   line(ctx,l,up,'#624e3b99',.8);line(ctx,r,up,'#624e3b99',.8);
  }
  for(const t of [.13,.87])line(ctx,P(fx,Y+W*t,Z+H*.03),P(fx,Y+W*t,Z+H*.97),'rgba(87,60,36,.22)',1);
 }
 if(p.tag==='wrapped'&&['front','right'].includes(f.key)){
  const edge=f.key==='front'?X+L+1:Y+W+1;
  for(let i=1;i<=5;i++){
   const z=Z+H*i/6;
   if(f.key==='front')line(ctx,P(edge,Y+W*.03,z),P(edge,Y+W*.97,z),'rgba(248,251,247,.46)',Math.max(.5,brightness*.002));
   else line(ctx,P(X+L*.03,edge,z),P(X+L*.97,edge,z),'rgba(248,251,247,.46)',Math.max(.5,brightness*.002));
  }
 }
 if((f.key==='front'||f.key==='right')&&showLabels&&p.tag!=='woodbase'){
  let a,b,c,d;
  if(f.key==='front'){const x=X+L+.7; a=P(x,Y+W*.22,Z+H*.62);b=P(x,Y+W*.65,Z+H*.62);c=P(x,Y+W*.65,Z+H*.89);d=P(x,Y+W*.22,Z+H*.89);}
  else{const y=Y+W+.7; a=P(X+L*.22,y,Z+H*.62);b=P(X+L*.65,y,Z+H*.62);c=P(X+L*.65,y,Z+H*.89);d=P(X+L*.22,y,Z+H*.89);}
  const poly=[a,b,c,d];if(Math.hypot(a.x-b.x,a.y-b.y)>9 && Math.hypot(b.x-c.x,b.y-c.y)>7){polygon(ctx,poly,'rgba(252,251,245,.92)','#6b5c4e55',.5);const mid={x:(a.x+c.x)/2,y:(a.y+c.y)/2};if(Math.abs(a.x-b.x)>38)text(ctx,(p.unitCode||p.id||'PKG').slice(0,18),mid,7,'#4d584b');}
 }
}
export function drawScene(canvas,box,items,opts={}){
 const ctx=canvas.getContext('2d');if(!ctx)return null;const dpr=Math.min(1.8,window.devicePixelRatio||1);const bounds=canvas.getBoundingClientRect();const w=Math.max(30,bounds.width),h=Math.max(30,bounds.height);
 if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}
 ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
 const cam=opts.cam||{yaw:.8,pitch:.54,zoom:1,persp:true};const basis=projectFactory(box,cam,w,h);const P=basis.point;
 const g=ctx.createLinearGradient(0,0,0,h);g.addColorStop(0,'#eceef0');g.addColorStop(1,'#eceef0');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
 // ambient ground shadow and floor
 const floor=verts({x:0,y:0,z:0,L:box.L,W:box.W,H:0});const projected=floor.map(P);
 polygon(ctx,[projected[0],projected[1],projected[2],projected[3]],'rgba(37,92,65,.09)',null);
 drawFloor(ctx,basis,box,opts.grid!==false);
 if(opts.axes!==false){
  // True X / Y / Z axes in millimetres, not a decorative compass overlay.
  const origin=P({x:0,y:0,z:0});const length=Math.min(900,box.L*.22);const axes=[{key:'X',p:{x:length,y:0,z:0},color:'#cc593f'},{key:'Y',p:{x:0,y:Math.min(length,box.W*.6),z:0},color:'#387fc3'},{key:'Z',p:{x:0,y:0,z:Math.min(length,box.H*.55)},color:'#2b917d'}];
  for(const axis of axes){const to=P(axis.p);line(ctx,origin,to,axis.color,2.4);if(Math.hypot(to.x-origin.x,to.y-origin.y)>12)text(ctx,axis.key,to,11,axis.color);}
 }
 const visible=typeof opts.step==='number'?items.slice(0,opts.step):items;
 const primitives=[];
 visible.forEach(p=>{for(const piece of surfaceParts(p)){
  // Faceted cylinders are illustrated with their real envelope axes, while collision
  // and load certification remain governed by engine checks.
  const vert=['drum','roll','round_pack'].includes(piece.kind),horiz=piece.renderCylinder||['reel','bundle'].includes(piece.kind),sideways=horiz&&((Number(piece.heading)||0)%180===90);
  if(vert||horiz){
   const facets=18,base=palettes[piece.kind]||palettes.other,cx=piece.x+piece.L/2,cy=piece.y+piece.W/2,cz=piece.z+piece.H/2;
   const ring=(t,far)=>{const a=t*Math.PI*2;
    return vert?p3(cx+piece.L/2*Math.cos(a),cy+piece.W/2*Math.sin(a),piece.z+(far?piece.H:0)):
     (sideways?p3(cx+piece.L/2*Math.cos(a),piece.y+(far?piece.W:0),cz+piece.H/2*Math.sin(a)):p3(piece.x+(far?piece.L:0),cy+piece.W/2*Math.cos(a),cz+piece.H/2*Math.sin(a)));};
   for(let j=0;j<facets;j++){
    const u=j/facets,v=(j+1)/facets,mid=(u+v)*Math.PI,normal=vert?[Math.cos(mid),Math.sin(mid),0]:sideways?[Math.cos(mid),0,Math.sin(mid)]:[0,Math.cos(mid),Math.sin(mid)];
    if(dot(normal,basis.toward)<.005)continue;
    const verts4=[ring(u,false),ring(v,false),ring(v,true),ring(u,true)];
    const brightness=.74+.22*Math.max(-.2,dot(normal,basis.toward));
    primitives.push({p,piece,f:{key:'curve'},v:verts4,depth:basis.raw(average(verts4)).depth,color:c3(mix([30,30,34],base,brightness))});
   }
   const capVisible=vert?basis.toward[2]>.005:Math.abs(sideways?basis.toward[1]:basis.toward[0])>.005;
   if(capVisible){const high=vert||(sideways?basis.toward[1]:basis.toward[0])>0,cap=Array.from({length:facets},(_,k)=>ring(k/facets,high));
    primitives.push({p,piece,f:{key:'cap'},v:cap,depth:basis.raw(average(cap)).depth,color:c3(mix([28,30,32],base,.98))});}
   continue;
  }
  for(const f of faces){if(dot(f.normal,basis.toward)<.004)continue;const all=verts(piece);const v=f.ids.map(i=>all[i]);const center=average(v);const base=palettes[piece.kind]||palettes.other;const bright=f.shading;const color=c3(mix([19,36,28],base,Math.min(1.0,bright)));
   const depth=basis.raw(center).depth;
   primitives.push({p,piece,f,v,depth,color});
  }
 }});
 primitives.sort((a,b)=>a.depth-b.depth);
 // Contact-shadow approximation: grounded cargo leaves diffuse pools on wood flooring.
 // Not a light-transport solver or load-bearing model.
 for(const p of visible){if(p.z>20)continue;const z=.55,quad=[P({x:p.x+19,y:p.y+14,z}),P({x:p.x+p.L+11,y:p.y+14,z}),P({x:p.x+p.L+11,y:p.y+p.W+9,z}),P({x:p.x+19,y:p.y+p.W+9,z})];ctx.save();ctx.shadowColor='rgba(51,40,28,.13)';ctx.shadowBlur=11;polygon(ctx,quad,'rgba(44,39,28,.065)',null);ctx.restore();}
 const hits=[];
 for(const o of primitives){const pts=o.v.map(P);ctx.globalAlpha=opts.locatorFocus&&opts.focusId&&o.p.id!==opts.focusId ? .22 : 1;polygon(ctx,pts,o.color,'#40392f45',.7);if(opts.pbr!==false&&o.f.key!=='curve')paintProjectedMaterial(ctx,pts,o.piece.kind,.50);
  const selected=opts.selected===o.p.id||opts.motionId===o.p.id;
  if(opts.unloadMode){const blockers=opts.unloadBlockerIds||[],ready=opts.unloadReadyIds||[];
   if(blockers.includes(o.p.id))polygon(ctx,pts,'rgba(226,123,60,.08)','#cf7b43',1.7);
   else if(ready.includes(o.p.id))polygon(ctx,pts,'rgba(108,96,186,.06)','#8a79cd',1.15);
  }
  if(selected){ctx.globalAlpha=1;polygon(ctx,pts,'rgba(44,125,80,.09)','#246c4a',1.9);} 
  const screenArea=pts.length>=3?Math.abs((pts[1].x-pts[0].x)*(pts[2].y-pts[0].y)-(pts[1].y-pts[0].y)*(pts[2].x-pts[0].x)):0;
  if(!opts.lowDetail&&(selected||screenArea>140)) faceDetail(ctx,{...o.piece,id:o.p.id,unitCode:o.p.unitCode},o.f,P,basis.scale*o.p.L,opts.labels!==false&&!o.piece.illustration);
  ctx.globalAlpha=1;hits.push({pts,id:o.p.id,depth:o.depth});
 }
 const edges=[[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];
 // Container shell is optional; floor/reference still visible in shell-free mode.
 const shellVisible=opts.xray!==false && Number(opts.transparency??85)<100;
 if(shellVisible){
 const shellAlpha=(100-(opts.transparency??85))/100;
 const solidShell=shellAlpha>=.48;
 const parts=containerParts(box,{doorAngle:opts.doorAngle??112,containerView:opts.containerView||'complete',eye:[basis.toward[0]*100,basis.toward[2]*100,basis.toward[1]*100]});
 const surfaces=[];
 for(const part of parts){
  const m=containerPartModel(part),c=Math.cos(part.yaw),s=Math.sin(part.yaw);
  const world=v=>{const x=v.x-.5,y=v.z-.5,z=v.y-.5;return{x:(m[0]*x+m[4]*y+m[8]*z+m[12])*1000,y:(m[2]*x+m[6]*y+m[10]*z+m[14])*1000,z:(m[1]*x+m[5]*y+m[9]*z+m[13])*1000};};
  const corners=verts({x:0,y:0,z:0,L:1,W:1,H:1}).map(world);
  for(const face of faces){
   const n=[c*face.normal[0]+s*face.normal[1],-s*face.normal[0]+c*face.normal[1],face.normal[2]];
   if(dot(n,basis.toward)<.004)continue;
   const v=face.ids.map(i=>corners[i]),base=part.material==='zinc'?[167,176,181]:part.material==='rubber'?[37,44,49]:part.material==='containerMark'?[219,227,225]:[61,101,125];
   surfaces.push({v,part,face,depth:basis.raw(average(v)).depth,color:c3(base.map((value,i)=>value*part.tint[i]*face.shading))});
  }
 }
 surfaces.sort((a,b)=>a.depth-b.depth);
 ctx.save();ctx.globalAlpha=shellAlpha;
 for(const surface of surfaces){
  const pts=surface.v.map(P);polygon(ctx,pts,surface.color,solidShell?'#273e4a44':null,.6);
  if(surface.part.shape.startsWith('corrugated')&&pts.length===4){
   const at=(a,b,t)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
   const count=surface.part.name.includes('wall')&&surface.part.w>1?32:12;
   for(let i=1;i<count;i++){const t=i/count;line(ctx,at(pts[0],pts[1],t),at(pts[3],pts[2],t),'#c9e1e62e',.8);}
  }
 }
 ctx.restore();
 } // end optional container shell
 // Permanent measured envelope and doorway, independent of wall visibility.
 const envelope=verts({x:0,y:0,z:0,L:box.L,W:box.W,H:box.H});
 if(!shellVisible||opts.dims)for(const [i,j] of edges)line(ctx,P(envelope[i]),P(envelope[j]),'rgba(72,94,119,.55)',1.1);
 const openingLeft=(box.W-box.doorW)/2;
 const opening=[{x:box.L,y:openingLeft,z:0},{x:box.L,y:openingLeft+box.doorW,z:0},{x:box.L,y:openingLeft+box.doorW,z:box.doorH},{x:box.L,y:openingLeft,z:box.doorH}].map(P);
 if(!shellVisible||opts.dims)for(let i=0;i<4;i++)line(ctx,opening[i],opening[(i+1)%4],'#b97a1c',2.5);

 // selected cargo bounding and ground anchor
 const selected=visible.find(p=>p.id===opts.selected);
 if(selected){let points=verts(selected).map(P);for(const [i,j] of edges)line(ctx,points[i],points[j],opts.invalidIds?.includes(selected.id)?'#a33923':'#303e35',2);let anchor=P({x:selected.x+selected.L/2,y:selected.y+selected.W/2,z:selected.z+selected.H});
  ctx.beginPath();ctx.arc(anchor.x,anchor.y,4,0,Math.PI*2);ctx.fillStyle='#7463d3';ctx.fill();if(w>280){ctx.fillStyle='#3a3556e8';ctx.font='11px -apple-system,sans-serif';const label=`${selected.unitCode||selected.id}  ${selected.L}×${selected.W}×${selected.H} mm`;const textWidth=ctx.measureText(label).width;const bx=Math.max(6,Math.min(w-textWidth-18,anchor.x-textWidth/2-7)),by=Math.max(24,anchor.y-31);ctx.fillRect(bx,by-15,textWidth+14,22);ctx.fillStyle='#fff';ctx.fillText(label,bx+7,by);}
 }
 // Surface heading arrows are a visual reference for 90/180/270 degree facing changes.
 for(const item of visible){if(!item.heading)continue;
  const angle=item.heading*Math.PI/180,len=Math.max(10,Math.min(item.L,item.W)*.24),cx=item.x+item.L/2,cy=item.y+item.W/2,z=item.z+item.H+2;
  const a=P({x:cx-Math.cos(angle)*len*.6,y:cy-Math.sin(angle)*len*.6,z});
  const b=P({x:cx+Math.cos(angle)*len*.6,y:cy+Math.sin(angle)*len*.6,z});
  line(ctx,a,b,'#d67d32',2.4);const dx=b.x-a.x,dy=b.y-a.y,mag=Math.hypot(dx,dy)||1;
  line(ctx,b,{x:b.x-dx/mag*7-dy/mag*4,y:b.y-dy/mag*7+dx/mag*4},'#d67d32',2);
  line(ctx,b,{x:b.x-dx/mag*7+dy/mag*4,y:b.y-dy/mag*7-dx/mag*4},'#d67d32',2);
 }
 // dimension labels at container reference edges
 const wire=verts({x:0,y:0,z:0,L:box.L,W:box.W,H:box.H});
 const dims=[{label:`L ${box.L.toLocaleString()} mm`,a:wire[0],b:wire[1]},{label:`W ${box.W.toLocaleString()} mm`,a:wire[1],b:wire[2]},{label:`H ${box.H.toLocaleString()} mm`,a:wire[2],b:wire[6]}];
 if(opts.dims!==false && w>240)for(const d of dims){const a=P(d.a),b=P(d.b);const mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2};if(Math.hypot(a.x-b.x,a.y-b.y)>50)text(ctx,d.label,{x:mid.x,y:mid.y+10},10,'#578576');}
 return {...basis,hits,viewport:{w,h},project:P};
}
export function hitTest(scene,x,y){if(!scene)return null;for(let i=scene.hits.length-1;i>=0;i--){const {pts,id}=scene.hits[i];let inside=false;for(let j=0,k=pts.length-1;j<pts.length;k=j++)if((pts[j].y>y)!==(pts[k].y>y)&&(x<(pts[k].x-pts[j].x)*(y-pts[j].y)/(pts[k].y-pts[j].y)+pts[j].x))inside=!inside;if(inside)return id;}return null;}
/** Orthographic approximation for drag on constant Z plane, precise input always available in the inspector. */
export function dragDelta(scene,dx,dy){if(!scene||Math.sin(scene.pitch)<.1)return{x:0,y:0};const a=dx/scene.scale,b=-dy/scene.scale;const k=-b/Math.sin(scene.pitch);return{x:Math.cos(scene.yaw)*k-Math.sin(scene.yaw)*a,y:Math.sin(scene.yaw)*k+Math.cos(scene.yaw)*a};}
export const CAMERA_PRESETS={iso:{yaw:.75,pitch:.55,zoom:1,persp:true},top:{yaw:-Math.PI/2,pitch:1.566,zoom:1,persp:false},door:{yaw:0,pitch:.005,zoom:1,persp:false},side:{yaw:Math.PI/2,pitch:.005,zoom:1,persp:false}};
