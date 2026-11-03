/** 3D projected geometry renderer. All geometry uses exact mm-space input.
 * The visual material is illustrative: no physical simulation or photogrammetry. */
const mix=(a,b,t)=>a.map((v,i)=>v*(1-t)+b[i]*t);
const palettes={carton:[195,155,110],crate:[176,131,87],woodbase:[162,119,73],board:[196,145,91],pallet:[177,155,112],ibc:[219,222,210],drum:[93,128,154],bag:[169,161,123],roll:[208,193,157],other:[152,164,155]};
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
function projectFactory(box,cam,w,h){
 const yaw=cam.yaw,pitch=Math.max(.004,Math.min(1.567,cam.pitch));
 const right=[-Math.sin(yaw),Math.cos(yaw),0];
 const up=[-Math.sin(pitch)*Math.cos(yaw),-Math.sin(pitch)*Math.sin(yaw),Math.cos(pitch)];
 const toward=[Math.cos(pitch)*Math.cos(yaw),Math.cos(pitch)*Math.sin(yaw),Math.sin(pitch)];
 const center=[box.L/2,box.W/2,box.H/2],dist=Math.max(box.L,box.W,box.H)*1.75;
 function raw(p){const r=[p.x-center[0],p.y-center[1],p.z-center[2]];const d=dot(r,toward);const perspective=cam.persp?dist/(dist-d):1;return {x:dot(r,right)*perspective,y:dot(r,up)*perspective,depth:d};}
 const v=verts({x:0,y:0,z:0,L:box.L,W:box.W,H:box.H}).map(raw);
 const minX=Math.min(...v.map(q=>q.x)),maxX=Math.max(...v.map(q=>q.x)),minY=Math.min(...v.map(q=>q.y)),maxY=Math.max(...v.map(q=>q.y));
 const scale=Math.min((w-42)/Math.max(1,maxX-minX),(h-74)/Math.max(1,maxY-minY))*cam.zoom;
 const cx=w/2-(minX+maxX)/2*scale,cy=h/2+(minY+maxY)/2*scale+4;
 const point=p=>{const t=raw(p);return{x:cx+t.x*scale,y:cy-t.y*scale,depth:t.depth};};
 return {point,raw,scale,right,up,toward,pitch,yaw,cx,cy};
}
function polygon(ctx,pts,fill,stroke='#00000011',width=.65){ctx.beginPath();ctx.moveTo(pts[0].x,pts[0].y);pts.slice(1).forEach(v=>ctx.lineTo(v.x,v.y));ctx.closePath();if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.lineWidth=width;ctx.strokeStyle=stroke;ctx.stroke();}}
function line(ctx,a,b,color='#809f8f',lw=1,dash=[]){ctx.setLineDash(dash);ctx.strokeStyle=color;ctx.lineWidth=lw;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();ctx.setLineDash([]);}
function text(ctx,s,p,size=10,color='#62766a',align='center'){ctx.font=`${size}px -apple-system, BlinkMacSystemFont, sans-serif`;ctx.fillStyle=color;ctx.textAlign=align;ctx.textBaseline='middle';ctx.fillText(s,p.x,p.y);}
function drawFloor(ctx,proj,box,grid){const pl=(x,y,z=0)=>proj.point({x,y,z});polygon(ctx,[pl(0,0),pl(box.L,0),pl(box.L,box.W),pl(0,box.W)],'#e6ece4','#9ab4a4',1.3);
 if(!grid)return;for(let x=0;x<=box.L;x+=1000)line(ctx,pl(x,0),pl(x,box.W),'#a6b6a640',.8);for(let y=0;y<=box.W;y+=500)line(ctx,pl(0,y),pl(box.L,y),'#a6b6a638',.8);
}
function surfaceParts(p){if(p.kind==='pallet'&&p.H>180){const base=Math.min(144,p.H*.20);return [{...p,H:base,kind:'woodbase',tag:'wood'},{...p,z:p.z+base,H:p.H-base,kind:'carton',tag:'wrapped'}];}return[{...p,tag:p.kind}];}
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
 if((f.key==='front'||f.key==='right')&&showLabels&&p.tag!=='woodbase'){
  let a,b,c,d;
  if(f.key==='front'){const x=X+L+.7; a=P(x,Y+W*.22,Z+H*.62);b=P(x,Y+W*.65,Z+H*.62);c=P(x,Y+W*.65,Z+H*.89);d=P(x,Y+W*.22,Z+H*.89);}
  else{const y=Y+W+.7; a=P(X+L*.22,y,Z+H*.62);b=P(X+L*.65,y,Z+H*.62);c=P(X+L*.65,y,Z+H*.89);d=P(X+L*.22,y,Z+H*.89);}
  const poly=[a,b,c,d];if(Math.hypot(a.x-b.x,a.y-b.y)>9 && Math.hypot(b.x-c.x,b.y-c.y)>7){polygon(ctx,poly,'rgba(252,251,245,.92)','#6b5c4e55',.5);const mid={x:(a.x+c.x)/2,y:(a.y+c.y)/2};if(Math.abs(a.x-b.x)>38)text(ctx,p.id?.replace('SKU-','')||'PKG',mid,7,'#4d584b');}
 }
}
export function drawScene(canvas,box,items,opts={}){
 const ctx=canvas.getContext('2d');if(!ctx)return null;const dpr=Math.min(1.8,window.devicePixelRatio||1);const bounds=canvas.getBoundingClientRect();const w=Math.max(30,bounds.width),h=Math.max(30,bounds.height);
 if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}
 ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
 const cam=opts.cam||{yaw:.8,pitch:.54,zoom:1,persp:true};const basis=projectFactory(box,cam,w,h);const P=basis.point;
 const g=ctx.createLinearGradient(0,0,0,h);g.addColorStop(0,'#fcfdfc');g.addColorStop(1,'#edf4ee');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
 // ambient ground shadow and floor
 const floor=verts({x:0,y:0,z:0,L:box.L,W:box.W,H:0});const projected=floor.map(P);
 polygon(ctx,[projected[0],projected[1],projected[2],projected[3]],'rgba(37,92,65,.09)',null);
 drawFloor(ctx,basis,box,opts.grid!==false);
 if(opts.axes!==false){
  // True X / Y / Z axes in millimetres, not a decorative compass overlay.
  const origin=P({x:0,y:0,z:0});const length=Math.min(900,box.L*.22);const axes=[{key:'X',p:{x:length,y:0,z:0},color:'#cc593f'},{key:'Y',p:{x:0,y:Math.min(length,box.W*.6),z:0},color:'#2b917d'},{key:'Z',p:{x:0,y:0,z:Math.min(length,box.H*.55)},color:'#387fc3'}];
  for(const axis of axes){const to=P(axis.p);line(ctx,origin,to,axis.color,2.4);if(Math.hypot(to.x-origin.x,to.y-origin.y)>12)text(ctx,axis.key,to,11,axis.color);}
 }
 const visible=typeof opts.step==='number'?items.slice(0,opts.step):items;
 const primitives=[];
 visible.forEach(p=>{for(const piece of surfaceParts(p)){
  for(const f of faces){if(dot(f.normal,basis.toward)<.004)continue;const all=verts(piece);const v=f.ids.map(i=>all[i]);const center=average(v);const base=palettes[piece.kind]||palettes.other;const bright=f.shading;const color=c3(mix([19,36,28],base,Math.min(1.0,bright)));
   const depth=basis.raw(center).depth;
   primitives.push({p,piece,f,v,depth,color});
  }
 }});
 primitives.sort((a,b)=>a.depth-b.depth);
 const hits=[];
 for(const o of primitives){const pts=o.v.map(P);polygon(ctx,pts,o.color,'#40392f45',.7);
  const selected=opts.selected===o.p.id;if(selected){polygon(ctx,pts,'rgba(83,218,159,.10)','#229769',1.6);}
  if(!opts.lowDetail) faceDetail(ctx,{...o.piece,id:o.p.id},o.f,P,basis.scale*o.p.L,opts.labels!==false);
  hits.push({pts,id:o.p.id,depth:o.depth});
 }
 // translucent corrugated walls, always using the real container inner envelope
 const wire=verts({x:0,y:0,z:0,L:box.L,W:box.W,H:box.H});
 const wallAlpha=opts.xray===false?.29:Math.max(.015,(100-(opts.transparency??85))/100*.20);
 for(const side of faces.filter(f=>f.key!=='bottom')){
  if(dot(side.normal,basis.toward)<0.005)continue;
  const pts=side.ids.map(i=>P(wire[i]));
  polygon(ctx,pts,`rgba(110,168,149,${wallAlpha})`,'rgba(70,126,112,.14)',.55);
 }
 const edges=[[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];
 for(const [i,j] of edges)line(ctx,P(wire[i]),P(wire[j]),'#528a7cbd',1.25);
 // narrow structural ribs and door opening (on x=container.L)
 const count=Math.min(35,Math.ceil(box.L/600));for(let i=1;i<count;i++){
  const x=i*box.L/count;
  line(ctx,P({x,y:0,z:0}),P({x,y:0,z:box.H}),'#528a7c25',.7);
  line(ctx,P({x,y:box.W,z:0}),P({x,y:box.W,z:box.H}),'#528a7c25',.7);
 }
 const doorInset=(box.W-box.doorW)/2;
 const doorPts=[P({x:box.L,y:doorInset,z:0}),P({x:box.L,y:doorInset+box.doorW,z:0}),P({x:box.L,y:doorInset+box.doorW,z:box.doorH}),P({x:box.L,y:doorInset,z:box.doorH})];
 for(let i=0;i<4;i++)line(ctx,doorPts[i],doorPts[(i+1)%4],'#38927e9c',1.2,[4,3]);
 // selected cargo bounding and ground anchor
 const selected=visible.find(p=>p.id===opts.selected);
 if(selected){let points=verts(selected).map(P);for(const [i,j] of edges)line(ctx,points[i],points[j],'#25b883',2);let anchor=P({x:selected.x+selected.L/2,y:selected.y+selected.W/2,z:selected.z+selected.H});
  ctx.beginPath();ctx.arc(anchor.x,anchor.y,4,0,Math.PI*2);ctx.fillStyle='#1eae7c';ctx.fill();if(w>280){ctx.fillStyle='#224c3be8';ctx.font='11px -apple-system,sans-serif';const label=`${selected.id}  ${selected.L}×${selected.W}×${selected.H}mm`;const textWidth=ctx.measureText(label).width;const bx=Math.max(6,Math.min(w-textWidth-18,anchor.x-textWidth/2-7)),by=Math.max(24,anchor.y-31);ctx.fillRect(bx,by-15,textWidth+14,22);ctx.fillStyle='#fff';ctx.fillText(label,bx+7,by);}
 }
 // dimension labels at container reference edges
 const dims=[{label:`L ${box.L.toLocaleString()} mm`,a:wire[0],b:wire[1]},{label:`W ${box.W.toLocaleString()} mm`,a:wire[1],b:wire[2]},{label:`H ${box.H.toLocaleString()} mm`,a:wire[2],b:wire[6]}];
 if(opts.dims!==false && w>240)for(const d of dims){const a=P(d.a),b=P(d.b);const mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2};if(Math.hypot(a.x-b.x,a.y-b.y)>50)text(ctx,d.label,{x:mid.x,y:mid.y+10},10,'#578576');}
 return {...basis,hits,viewport:{w,h},project:P};
}
export function hitTest(scene,x,y){if(!scene)return null;for(let i=scene.hits.length-1;i>=0;i--){const {pts,id}=scene.hits[i];let inside=false;for(let j=0,k=pts.length-1;j<pts.length;k=j++)if((pts[j].y>y)!==(pts[k].y>y)&&(x<(pts[k].x-pts[j].x)*(y-pts[j].y)/(pts[k].y-pts[j].y)+pts[j].x))inside=!inside;if(inside)return id;}return null;}
/** Orthographic approximation for drag on constant Z plane, precise input always available in the inspector. */
export function dragDelta(scene,dx,dy){if(!scene||Math.sin(scene.pitch)<.1)return{x:0,y:0};const a=dx/scene.scale,b=-dy/scene.scale;const k=-b/Math.sin(scene.pitch);return{x:Math.cos(scene.yaw)*k-Math.sin(scene.yaw)*a,y:Math.sin(scene.yaw)*k+Math.cos(scene.yaw)*a};}
export const CAMERA_PRESETS={iso:{yaw:.75,pitch:.55,zoom:1,persp:true},top:{yaw:-Math.PI/2,pitch:1.566,zoom:1,persp:false},door:{yaw:0,pitch:.005,zoom:1,persp:false},side:{yaw:Math.PI/2,pitch:.005,zoom:1,persp:false}};
