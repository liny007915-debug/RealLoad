/** Offline, reproducible visual texture. No photo scan or measured material data.
 * Returns a painted 2D canvas; suitable for conservative 3D envelope visualisation.
 */
const bases={carton:[190,145,91],crate:[175,122,74],wood:[166,124,79],woodbase:[157,118,80],board:[181,140,93],pallet:[162,125,77],drum:[80,113,130],metal:[123,144,146],ibc:[205,214,206],plastic:[196,208,200],plastic_crate:[70,116,101],paper:[227,219,193],jute:[192,176,138],sack:[192,173,131],bag:[201,191,152],roll:[210,199,174],reel:[178,141,98],machine:[109,119,111],bundle:[112,135,145],coolbox:[221,232,223],round_pack:[189,151,105],irregular:[164,151,138]};
const wood=new Set(['crate','wood','woodbase','board','pallet','reel']);
const textile=new Set(['jute','sack','bag']);
const metallic=new Set(['drum','metal','machine','bundle']);
export const materialKinds=Object.freeze(Object.keys(bases));
const clamp=v=>Math.min(255,Math.max(0,Math.round(v)));
const hash=s=>{let n=2166136261;for(const c of s){n=(n^c.charCodeAt(0))*16777619>>>0;}return n>>>0;};
/** Pixel map source is a deterministic procedural material, not an internet photograph. */
export function makeMaterialPixels(kind='carton',size=192){
 if(!Number.isInteger(size)||size<16||size>1024)throw Error('纹理尺寸应介于 16 和 1024 之间');
 const base=bases[kind]||bases.carton,data=new Uint8ClampedArray(size*size*4),seed=hash(kind),isWood=wood.has(kind),isTextile=textile.has(kind),isMetal=metallic.has(kind);
 const ux=(seed%83)/83,uy=(seed%61)/61;
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const i=(y*size+x)*4;const noise=(Math.sin((x*127.1+y*311.7+seed*.0001)*19.19)*43758.5453)%1;
  const grain=isWood?(Math.sin(y*.24+2.4*Math.sin(x*.022+ux*3)+1.4*Math.cos(y*.07+x*.005))*8 + Math.sin(y*.62+Math.cos(x*.024)*3)*3):0;
  const knot=isWood?Math.exp(-((x-size*(.48+ux*.14))**2/(size*130)+(y-size*(.42+uy*.11))**2/(size*14)))*Math.sin(Math.atan2(y-size*.45,x-size*.54)*7)*8:0;
  const fibers=['carton','round_pack'].includes(kind)?Math.sin(y*1.25)*2.6+Math.cos(x*.45)*1.2:0;
  const weave=isTextile?(Math.sin(x*.88)*Math.cos(y*.88)*7+Math.sin(y*1.7)*2):0;
  const scratch=isMetal?Math.sin(x*.095+Math.sin(y*.01))*2.7:0;
  const shade=grain+knot+fibers+weave+scratch+noise*(isWood?16:isMetal?11:9);
  for(let c=0;c<3;c++)data[i+c]=clamp(base[c]+shade*(1-c*.1));data[i+3]=255;
 }
 return {width:size,height:size,pixels:data,kind};
}
let cache=new Map();
export function textureCanvas(kind='carton'){
 if(typeof document==='undefined'||!document.createElement)return null;
 if(cache.has(kind))return cache.get(kind);
 const src=makeMaterialPixels(kind,192),canvas=document.createElement('canvas');canvas.width=canvas.height=192;
 const ctx=canvas.getContext('2d');if(!ctx||!ctx.createImageData)return null;
 const out=ctx.createImageData(192,192);out.data.set(src.pixels);ctx.putImageData(out,0,0);
 if(wood.has(kind)){
  for(let k=0;k<13;k++){
   const y=4+k*15;
   ctx.strokeStyle=k%2?'rgba(70,48,30,.15)':'rgba(245,206,152,.19)';ctx.lineWidth=.8+(k%3)*.3;
   ctx.beginPath();ctx.moveTo(0,y);ctx.bezierCurveTo(42,y+Math.sin(k)*6,127,y+Math.cos(k)*7,192,y+Math.sin(k*3)*3);ctx.stroke();
  }
  const cx=104,cy=79;ctx.save();ctx.translate(cx,cy);ctx.scale(1,.31);for(let n=5;n<27;n+=4){ctx.beginPath();ctx.ellipse(0,0,n,n*.8,0,0,Math.PI*2);ctx.strokeStyle='rgba(75,49,26,.14)';ctx.stroke();}ctx.restore();
 }else if(kind==='carton'){
  for(let y=0;y<192;y+=8){ctx.fillStyle='rgba(98,68,35,.13)';ctx.fillRect(0,y,192,1);}
 }else if(isMetallic(kind)){
  for(let x=0;x<192;x+=17){ctx.strokeStyle='rgba(245,246,236,.17)';ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x+8,192);ctx.stroke();}
 }
 cache.set(kind,canvas);return canvas;
}
function isMetallic(kind){return metallic.has(kind)}
/** Authored identifying details for the WebGL packaging surfaces; all artwork is procedural. */
export function paintPackagingTexture(ctx,kind,size=512){
 const k=size/512;ctx.save();ctx.scale(k,k);
 if(kind==='containerPaint'){
  // Original painted steel wear, kept subtle so folds carry the form.
  for(let i=0;i<160;i++){
   const x=(i*193.13)%512,y=(i*79.71)%512;
   ctx.strokeStyle=i%5?'rgba(225,235,237,.065)':'rgba(36,54,62,.16)';ctx.lineWidth=.4+(i%4)*.35;
   ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+2+(i%7),y+3+(i%11));ctx.stroke();
  }
 }else if(kind==='containerMark'){
  ctx.fillStyle='#dce3df';ctx.fillRect(0,0,512,512);ctx.fillStyle='#263e4a';
  ctx.font='700 57px Arial';ctx.fillText('REALLOAD',28,100);ctx.font='31px Arial';ctx.fillText('VISUAL MODEL',30,157);
  ctx.fillRect(30,181,450,3);ctx.font='26px Arial';ctx.fillText('NOT A CERTIFICATION',30,230);
  for(let i=0;i<7;i++)ctx.fillRect(30,290+i*25,330-(i%3)*54,6);
 }else if(kind==='shadow'){
  ctx.clearRect(0,0,512,512);ctx.save();ctx.translate(256,256);ctx.scale(1,.68);
  const gradient=ctx.createRadialGradient(0,0,35,0,0,256);gradient.addColorStop(0,'rgba(34,40,47,.60)');gradient.addColorStop(.44,'rgba(34,40,47,.32)');gradient.addColorStop(1,'rgba(34,40,47,0)');
  ctx.fillStyle=gradient;ctx.fillRect(-256,-384,512,768);ctx.restore();
 }else if(kind==='handlingMark'){
  ctx.clearRect(0,0,512,512);ctx.strokeStyle='#3d3022';ctx.fillStyle='#3d3022';ctx.lineWidth=12;ctx.lineCap='round';ctx.lineJoin='round';
  for(const x of [60,125]){ctx.beginPath();ctx.moveTo(x,240);ctx.lineTo(x,80);ctx.moveTo(x-28,112);ctx.lineTo(x,80);ctx.lineTo(x+28,112);ctx.stroke();}ctx.beginPath();ctx.moveTo(30,266);ctx.lineTo(156,266);ctx.stroke();
  ctx.beginPath();ctx.arc(304,145,74,Math.PI,0);ctx.lineTo(230,145);ctx.moveTo(304,145);ctx.lineTo(304,242);ctx.quadraticCurveTo(304,274,332,244);ctx.stroke();
  ctx.font='600 40px Arial';ctx.fillText('HANDLE WITH CARE',22,368);ctx.font='25px Arial';ctx.fillText('VISUAL SAMPLE',85,423);
 }else if(kind==='shippingLabel'){
  ctx.fillStyle='#eeeadd';ctx.fillRect(0,0,512,512);ctx.strokeStyle='#707265';ctx.lineWidth=3;ctx.strokeRect(22,22,468,468);
  ctx.fillStyle='#303b33';ctx.font='600 48px Arial';ctx.fillText('PACKAGE',45,86);ctx.font='24px Arial';ctx.fillText('HANDLING UNIT',46,126);
  ctx.fillRect(45,149,422,3);ctx.font='22px Arial';ctx.fillText('IDENTIFY BEFORE HANDLING',45,187);
  for(let i=0,x=48;i<63;i++){const width=2+((i*17+3)%5);if(i%3!==1)ctx.fillRect(x,236,width,130);x+=width+2;}
  ctx.font='20px Arial';ctx.fillText('REALLOAD / VISUAL SAMPLE',45,405);
  ctx.lineWidth=5;for(const x of [385,437]){ctx.beginPath();ctx.moveTo(x,463);ctx.lineTo(x,430);ctx.moveTo(x-10,440);ctx.lineTo(x,430);ctx.lineTo(x+10,440);ctx.stroke();}
 }else if(kind==='tape'){
  ctx.fillStyle='rgba(240,210,148,.14)';ctx.fillRect(0,0,512,13);ctx.fillRect(0,499,512,13);
  ctx.fillStyle='rgba(98,64,26,.11)';ctx.fillRect(0,16,512,2);ctx.fillRect(0,494,512,2);
 }else if(kind==='rollEnd'){
  ctx.strokeStyle='rgba(108,86,47,.31)';ctx.lineWidth=1.15;
  for(let r=58;r<257;r+=4.8){ctx.beginPath();ctx.arc(256,256,r,0,Math.PI*2);ctx.stroke();}
  ctx.strokeStyle='rgba(245,234,207,.38)';for(let r=63;r<257;r+=14.4){ctx.beginPath();ctx.arc(256,256,r,0,Math.PI*2);ctx.stroke();}
 }else if(kind==='reel'){
  for(let i=0;i<5;i++){const x=i*103;ctx.fillStyle=i%2?'rgba(104,68,32,.07)':'rgba(247,215,158,.06)';ctx.fillRect(x,0,103,512);ctx.fillStyle='rgba(74,45,22,.34)';ctx.fillRect(x,0,2.5,512);ctx.fillStyle='rgba(237,205,146,.24)';ctx.fillRect(x+3,0,1.2,512);}
 }else if(kind==='cable'){
  for(let y=0;y<512;y+=47){ctx.fillStyle='rgba(10,17,17,.42)';ctx.fillRect(0,y,512,8);ctx.fillStyle='rgba(154,162,153,.20)';ctx.fillRect(0,y+10,512,3);}
 }else if(['jute','sack','strap'].includes(kind)){
  for(let n=0;n<512;n+=8){ctx.fillStyle='rgba(83,76,49,.075)';ctx.fillRect(n,0,1.1,512);ctx.fillRect(0,n,512,1.1);ctx.fillStyle='rgba(250,244,212,.11)';ctx.fillRect(n+2,0,1,512);ctx.fillRect(0,n+3,512,1);}
  if(kind!=='strap')for(let i=0;i<5;i++){ctx.beginPath();ctx.moveTo(0,60+i*100);ctx.bezierCurveTo(140,90+i*100,290,35+i*100,512,70+i*100);ctx.lineWidth=4;ctx.strokeStyle='rgba(103,92,62,.045)';ctx.stroke();}
 }else if(kind==='wrap'){
  for(let y=12;y<512;y+=81){ctx.fillStyle='rgba(158,173,163,.10)';ctx.fillRect(0,y,512,2);ctx.fillStyle='rgba(255,255,255,.22)';ctx.fillRect(0,y+3,512,3);}
 }
 ctx.restore();
}
/** Applies one affine texture triangle; the cargo geometry stays untouched. */
function tri(ctx,tex,points,uv){
 const [p0,p1,p2]=points,[a,b,c]=uv,den=(b.x-a.x)*(c.y-a.y)-(c.x-a.x)*(b.y-a.y);if(Math.abs(den)<.001)return;
 const A=((p1.x-p0.x)*(c.y-a.y)-(p2.x-p0.x)*(b.y-a.y))/den;
 const B=((p1.y-p0.y)*(c.y-a.y)-(p2.y-p0.y)*(b.y-a.y))/den;
 const C=((p2.x-p0.x)*(b.x-a.x)-(p1.x-p0.x)*(c.x-a.x))/den;
 const D=((p2.y-p0.y)*(b.x-a.x)-(p1.y-p0.y)*(c.x-a.x))/den;
 ctx.save();ctx.beginPath();ctx.moveTo(p0.x,p0.y);ctx.lineTo(p1.x,p1.y);ctx.lineTo(p2.x,p2.y);ctx.closePath();ctx.clip();ctx.transform(A,B,C,D,p0.x-A*a.x-C*a.y,p0.y-B*a.x-D*a.y);ctx.drawImage(tex,0,0);ctx.restore();
}
export function paintProjectedMaterial(ctx,points,kind,opacity=.63){
 if(points?.length!==4||!ctx?.drawImage)return false;const a=points[0],b=points[1],c=points[2],d=points[3];
 // Skip tiny projections for responsiveness, and skip camera-degenerate polygons.
 const area=Math.abs((b.x-a.x)*(d.y-a.y)-(b.y-a.y)*(d.x-a.x));if(area<180)return false;
 const tex=textureCanvas(kind);if(!tex)return false;const n=tex.width;
 ctx.save();ctx.globalAlpha*=opacity;const uv=[{x:0,y:0},{x:n,y:0},{x:n,y:n},{x:0,y:n}];tri(ctx,tex,[a,b,c],[uv[0],uv[1],uv[2]]);tri(ctx,tex,[a,c,d],[uv[0],uv[2],uv[3]]);ctx.restore();return true;
}
