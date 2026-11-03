import {dragPlaneDelta} from './drag-projection.mjs';
import {loadAuthoredSurfaces} from './authored-surfaces.mjs';
import {fitDistance,orthographicHalfExtent} from './camera-fit.mjs';
/** RealLoad 0.5: dependency-free WebGL2 scene. Model coordinates are mm; renderer converts to metres.
 * Visual meshes are illustrative, never a measurement or strength test. */
import {drawScene,hitTest,dragDelta,CAMERA_PRESETS} from './fallback-render.mjs';
import {displayNumber} from './precision.mjs';
import {CARGO_TYPES} from './free-studio.mjs';
import {invertFloorProjection,boundedMove} from './placement-assist.mjs';
import {MATERIALS,materialParameters,surfaceMaps} from './materials.mjs';
import {loadImages,photoCanvas} from './material-library.mjs';
import {pickScreenRect} from './selection.mjs';
import {PACKAGE_GEOMETRY,ENHANCED_PACKAGES,packageParts,packagePartModel} from './package-geometry.mjs';
import {paintPackagingTexture} from './material-texture.mjs';
import {CONTAINER_GEOMETRY,containerParts,containerPartModel,containerDoorReach,resolveContainerAppearance} from './container-geometry.mjs';
const M=1000, clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
function mul(a,b){const o=new Float32Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let k=0;k<4;k++)o[c*4+r]+=a[k*4+r]*b[c*4+k];return o}
function perspective(fov,aspect,near,far){const f=1/Math.tan(fov/2),o=new Float32Array(16);o[0]=f/aspect;o[5]=f;o[10]=(far+near)/(near-far);o[11]=-1;o[14]=2*far*near/(near-far);return o}
function orthographic(l,r,b,t,n,f){const o=new Float32Array(16);o[0]=2/(r-l);o[5]=2/(t-b);o[10]=-2/(f-n);o[12]=-(r+l)/(r-l);o[13]=-(t+b)/(t-b);o[14]=-(f+n)/(f-n);o[15]=1;return o}
function normalize(a){const l=Math.hypot(...a)||1;return a.map(v=>v/l)}
function cross(a,b){return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]}
function dot(a,b){return a[0]*b[0]+a[1]*b[1]+a[2]*b[2]}
function lookAt(eye,center){const z=normalize(eye.map((v,i)=>v-center[i]));let x=normalize(cross([0,1,0],z));if(Math.hypot(...x)<.01)x=[1,0,0];const y=cross(z,x);return new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-dot(x,eye),-dot(y,eye),-dot(z,eye),1])}
function transform(mat,x,y,z){const a=mat;const w=a[3]*x+a[7]*y+a[11]*z+a[15];return [(a[0]*x+a[4]*y+a[8]*z+a[12])/w,(a[1]*x+a[5]*y+a[9]*z+a[13])/w,(a[2]*x+a[6]*y+a[10]*z+a[14])/w]}
function inv(a){const m=Array.from({length:4},(_,r)=>Array.from({length:8},(_,c)=>c<4?a[c*4+r]:(c-4===r?1:0)));for(let i=0;i<4;i++){let pivot=i;for(let r=i+1;r<4;r++)if(Math.abs(m[r][i])>Math.abs(m[pivot][i]))pivot=r;if(Math.abs(m[pivot][i])<1e-10)return null;[m[i],m[pivot]]=[m[pivot],m[i]];const v=m[i][i];for(let j=0;j<8;j++)m[i][j]/=v;for(let k=0;k<4;k++)if(k!==i){const q=m[k][i];for(let j=0;j<8;j++)m[k][j]-=q*m[i][j]}}const o=new Float64Array(16);for(let r=0;r<4;r++)for(let c=0;c<4;c++)o[c*4+r]=m[r][c+4];return o}
function model(x,y,z,w,h,d){return new Float32Array([w,0,0,0,0,h,0,0,0,0,d,0,x,y,z,1])}
function makeCube(){const v=[];const faces=[[[1,0,0],[.5,-.5,-.5],[.5,.5,-.5],[.5,.5,.5],[.5,-.5,.5]], [[-1,0,0],[-.5,-.5,.5],[-.5,.5,.5],[-.5,.5,-.5],[-.5,-.5,-.5]], [[0,1,0],[-.5,.5,-.5],[-.5,.5,.5],[.5,.5,.5],[.5,.5,-.5]], [[0,-1,0],[-.5,-.5,.5],[-.5,-.5,-.5],[.5,-.5,-.5],[.5,-.5,.5]], [[0,0,1],[.5,-.5,.5],[.5,.5,.5],[-.5,.5,.5],[-.5,-.5,.5]], [[0,0,-1],[-.5,-.5,-.5],[-.5,.5,-.5],[.5,.5,-.5],[.5,-.5,-.5]]];for(const [n,...pts] of faces){for(const ix of [0,1,2,0,2,3]){const p=pts[ix],uv=[[0,0],[0,1],[1,1],[1,0]][ix];v.push(...p,...n,...uv)}}return new Float32Array(v)}
function makeCylinder(segments=24){
 const data=[];const v=(p,n,uv)=>data.push(...p,...n,...uv);
 for(let i=0;i<segments;i++){
  const a=i/segments*Math.PI*2,b=(i+1)/segments*Math.PI*2;
  const p=t=>[Math.cos(t)*.5,Math.sin(t)*.5],A=p(a),B=p(b);
  const na=[A[0]*2,0,A[1]*2],nb=[B[0]*2,0,B[1]*2];
  for(const [q,n,u] of [[A,na,[i/segments,0]],[B,nb,[(i+1)/segments,0]],[B,nb,[(i+1)/segments,1]],[A,na,[i/segments,0]],[B,nb,[(i+1)/segments,1]],[A,na,[i/segments,1]]])v([q[0],u[1]-.5,q[1]],n,u);
  for(const y of [-.5,.5]){const normal=[0,Math.sign(y),0];const vertices=y>0?[[0,0],[A[0],A[1]],[B[0],B[1]]]:[[0,0],[B[0],B[1]],[A[0],A[1]]];for(const q of vertices)v([q[0],y,q[1]],normal,[q[0]+.5,q[1]+.5]);}
 }
 return new Float32Array(data);
}
function makeCylinderX(){const original=makeCylinder(),out=new Float32Array(original.length);for(let i=0;i<original.length;i+=8){out[i]=original[i+1];out[i+1]=-original[i];out[i+2]=original[i+2];out[i+3]=original[i+4];out[i+4]=-original[i+3];out[i+5]=original[i+5];out[i+6]=original[i+6];out[i+7]=original[i+7];}return out;}
function makeCylinderZ(){const original=makeCylinderX(),out=new Float32Array(original.length);for(let i=0;i<original.length;i+=8){out[i]=-original[i+2];out[i+1]=original[i+1];out[i+2]=original[i];out[i+3]=-original[i+5];out[i+4]=original[i+4];out[i+5]=original[i+3];out[i+6]=original[i+6];out[i+7]=original[i+7];}return out;}

function shader(gl,type,source){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s}
function program(gl,vs,fs){const p=gl.createProgram();gl.attachShader(p,shader(gl,gl.VERTEX_SHADER,vs));gl.attachShader(p,shader(gl,gl.FRAGMENT_SHADER,fs));gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));return p}
const authoredMaterialMaps=new Map();
/** Deterministic offline procedural materials, visually representative only. */
function texture(gl,kind,photo=null){
 if(!photo&&authoredMaterialMaps.has(kind))return uploadSurfaceMaps(gl,authoredMaterialMaps.get(kind));
 const size=['tape','strap','wrap','corePaper','cable','crease'].includes(kind)?256:512,canvas=document.createElement('canvas');canvas.width=canvas.height=size;
 const c=canvas.getContext('2d',{willReadFrequently:false}),img=c.createImageData(size,size);
 const base=materialParameters(kind).base,wood=['crate','board','pallet','reel'].includes(kind);
 let seed=kind.split('').reduce((a,l)=>a*31+l.charCodeAt(0),1337)|0;
 const rand=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)/4294967296};
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
   const grain=wood?(Math.sin(y*.16+Math.sin(x*.018)*2.6+Math.sin(y*.04+x*.012)*1.6)*7+Math.sin(y*.028+x*.006)*4.2):0;
   const ridge=['carton','sack'].includes(kind)?(Math.sin(y*.8)*1.75+Math.sin(y*.11)*.8):['metal','machine','bundle'].includes(kind)?Math.sin(x*.095)*.25:kind==='plastic_crate'?Math.sin(y*.34+x*.27)*3:0;
   const dust=(rand()-.5)*(wood?8:['drum','rollEnd','shippingLabel'].includes(kind)?1.5:4);
   const shade=grain+ridge+dust;const i=(y*size+x)*4;
   img.data[i]=Math.max(0,Math.min(255,base[0]+shade));
   img.data[i+1]=Math.max(0,Math.min(255,base[1]+shade*.87));
   img.data[i+2]=Math.max(0,Math.min(255,base[2]+shade*.73));img.data[i+3]=255;
 }
 c.putImageData(img,0,0);
 if(wood){
  for(let i=0;i<34;i++){
   const y=i*16+rand()*8;
   c.beginPath();c.moveTo(-12,y);
   c.bezierCurveTo(125,y+rand()*9-4,300,y+rand()*12-6,525,y+rand()*8-4);
   c.strokeStyle=i%4?'rgba(82,57,33,.095)':'rgba(253,225,170,.20)';c.lineWidth=.7+rand()*2;c.stroke();
  }
  if(['board','crate','reel'].includes(kind))for(let i=0;i<3;i++){
   const x=55+rand()*390,y=50+rand()*390;
   c.save();c.translate(x,y);c.rotate(-.15+rand()*.3);c.scale(1,.27+rand()*.2);
   for(let r=3;r<19;r+=4){c.beginPath();c.ellipse(0,0,r*1.4,r,0,0,Math.PI*2);c.strokeStyle='rgba(68,42,20,.16)';c.lineWidth=1.3;c.stroke()}
   c.restore();
  }
 }
 if(kind==='carton'){
  c.strokeStyle='rgba(99,70,39,.14)';c.lineWidth=1;
  for(let y=5;y<size;y+=14){c.beginPath();c.moveTo(0,y);c.lineTo(size,y);c.stroke()}
  c.strokeStyle='rgba(115,84,55,.11)';for(let x=0;x<size;x+=128){c.beginPath();c.moveTo(x,0);c.lineTo(x,size);c.stroke()}
 }
 if(kind==='metal'){
  c.fillStyle='rgba(57,79,90,.13)';for(let x=0;x<size;x+=41)c.fillRect(x,0,4,size);
  c.strokeStyle='rgba(250,250,250,.21)';for(let x=8;x<size;x+=41){c.beginPath();c.moveTo(x,0);c.lineTo(x,size);c.stroke()}
  for(let i=0;i<70;i++){c.fillStyle='rgba(93,96,95,.075)';c.fillRect(rand()*size,rand()*size,1+rand()*2,3+rand()*26)}
 }
 if(kind==='paper'){
  c.strokeStyle='rgba(97,86,66,.10)';c.strokeRect(20,20,472,472);
  c.fillStyle='rgba(95,82,66,.13)';for(let i=0;i<7;i++)c.fillRect(45,65+i*55,190+rand()*205,4);
 }
 paintPackagingTexture(c,kind,size);
 if(photo){const im=photoCanvas(photo,512);c.clearRect(0,0,512,512);c.drawImage(im,0,0);}
 const maps={albedo:canvas,...surfaceMaps(canvas,kind)};
 if(!photo)authoredMaterialMaps.set(kind,maps);
 return uploadSurfaceMaps(gl,maps);
}
function uploadSurfaceMaps(gl,maps){
 const upload=(surface)=>{const tex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,tex);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,surface);gl.generateMipmap(gl.TEXTURE_2D);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.REPEAT);return tex};
 return {albedo:upload(maps.albedo),normal:upload(maps.normal),roughness:upload(maps.roughness)};
}
const vertex=`#version 300 es
in vec3 aPosition;in vec3 aNormal;in vec2 aUV;
uniform mat4 uVP;uniform mat4 uModel;
out vec3 vNormal;out vec3 vWorld;out vec2 vUV;
void main(){vec4 world=uModel*vec4(aPosition,1.0);vWorld=world.xyz;
 vNormal=normalize(transpose(inverse(mat3(uModel)))*aNormal);
 vUV=aUV;gl_Position=uVP*world;}`;
const frag=`#version 300 es
precision highp float;
in vec3 vNormal;in vec3 vWorld;in vec2 vUV;
uniform sampler2D uTexture;uniform sampler2D uNormalMap;uniform sampler2D uRoughnessMap;
uniform vec4 uColor;uniform vec3 uEye;uniform float uRoughness;uniform float uMetalness;uniform float uQuality;
out vec4 outColor;
const float PI=3.14159265359;
float D_GGX(float nDotH,float rough){float a=rough*rough,a2=a*a,den=nDotH*nDotH*(a2-1.0)+1.0;return a2/max(.0001,PI*den*den);}
float G_Schlick(float nd,float k){return nd/max(.0001,nd*(1.0-k)+k);}
vec3 Fresnel(float v,vec3 F0){return F0+(1.0-F0)*pow(1.0-v,5.0);}
vec3 lighting(vec3 n,vec3 v,vec3 l,vec3 radiance,vec3 albedo,float rough,float metal){
 vec3 h=normalize(v+l);float ndl=max(dot(n,l),0.0),ndv=max(dot(n,v),0.0),ndh=max(dot(n,h),0.0),vdh=max(dot(v,h),0.0);
 vec3 f0=mix(vec3(.04),albedo,metal);vec3 F=Fresnel(vdh,f0);
 float k=pow(rough+1.0,2.0)/8.0;
 float spec=D_GGX(ndh,rough)*G_Schlick(ndv,k)*G_Schlick(ndl,k);
 vec3 ks=F,kd=(1.0-ks)*(1.0-metal);
 return (kd*albedo/PI+spec*F/max(.001,4.0*ndv*ndl))*radiance*ndl;
}
vec3 detailNormal(vec3 base){
 vec3 sampled=texture(uNormalMap,vUV).xyz*2.0-1.0;
 vec3 dp1=dFdx(vWorld),dp2=dFdy(vWorld);vec2 duv1=dFdx(vUV),duv2=dFdy(vUV);
 vec3 tangent=dp1*duv2.y-dp2*duv1.y;
 tangent=normalize(tangent-base*dot(base,tangent));
 vec3 bitangent=normalize(cross(base,tangent))*sign(duv1.x*duv2.y-duv1.y*duv2.x);
 return normalize(mat3(tangent,bitangent,base)*normalize(mix(vec3(0.,0.,1.),sampled,.55)));
}
vec3 aces(vec3 x){return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.0,1.0);}
void main(){
 vec3 albedo=pow(texture(uTexture,vUV).rgb*uColor.rgb,vec3(2.2));
 vec3 base=normalize(vNormal);vec3 N=uQuality>.5?detailNormal(base):base;
 vec3 V=normalize(uEye-vWorld);
 float rough=clamp(uRoughness*(uQuality>.5?texture(uRoughnessMap,vUV).r/.75:1.0),.08,1.0);
 float metal=clamp(uMetalness,0.0,1.0);
 vec3 ambient=mix(vec3(.18,.20,.22),vec3(.40,.43,.45),clamp(N.y*.5+.5,0.0,1.0))*albedo*(1.0-.65*metal);
 vec3 color=ambient;
 color+=lighting(N,V,normalize(vec3(-.48,.94,.5)),vec3(3.5,3.35,3.08),albedo,rough,metal);
 color+=lighting(N,V,normalize(vec3(.75,.35,-.55)),vec3(.80,.95,1.15),albedo,rough,metal);
 color=aces(color);color=pow(color,vec3(1.0/2.2));
 outColor=vec4(color,uColor.a*texture(uTexture,vUV).a);
}`;
const lineVertex=`#version 300 es
in vec3 aPosition;uniform mat4 uVP;void main(){gl_Position=uVP*vec4(aPosition,1.);}`;
const lineFrag=`#version 300 es
precision mediump float;uniform vec4 uColor;out vec4 outColor;void main(){outColor=uColor;}`;
function rayBox(o,d,b){let a=-Infinity,z=Infinity;for(let i=0;i<3;i++){if(Math.abs(d[i])<1e-7){if(o[i]<b.min[i]||o[i]>b.max[i])return null;continue;}let u=(b.min[i]-o[i])/d[i],v=(b.max[i]-o[i])/d[i];if(u>v)[u,v]=[v,u];a=Math.max(a,u);z=Math.min(z,v);if(z<a)return null}return z>=0?Math.max(a,0):null}
export class Viewport{
 constructor(parent,mode,handlers){this.parent=parent;this.mode=mode;this.handlers=handlers;this.canvas=document.createElement('canvas');this.canvas.setAttribute('aria-label',`货柜三维${mode}视图`);this.canvas.setAttribute('role','img');this.overlay=document.createElement('div');this.overlay.className='label-layer';this.overlayNodes=new Map();parent.append(this.canvas,this.overlay);if(mode!=='iso'){const title=document.createElement('span');title.className='view-title';title.textContent={top:'俯视 · X/Y',door:'柜门正视 · Y/Z',side:'侧视 · X/Z'}[mode];parent.append(title)}this.yaw=.75;this.pitch=.45;this.zoom=1;this.focusTarget=null;this.drag=null;this.vp=null;this.state=null;this.fallback=false;this.gizmoDrag=null;this.init();this.onMaterialChange=()=>this.loadCustomTextures();window.addEventListener('realload:materials-changed',this.onMaterialChange);this.events();this.gizmoEvents();this.resizeObserver=new ResizeObserver(()=>this.draw(this.state));this.resizeObserver.observe(parent);}
 init(){try{const g=this.canvas.getContext('webgl2',{antialias:true,alpha:false});if(!g)throw Error('设备不支持 WebGL2');this.gl=g;this.prog=program(g,vertex,frag);this.lineProg=program(g,lineVertex,lineFrag);this.cube=g.createBuffer();g.bindBuffer(g.ARRAY_BUFFER,this.cube);g.bufferData(g.ARRAY_BUFFER,makeCube(),g.STATIC_DRAW);this.cylinder=g.createBuffer();g.bindBuffer(g.ARRAY_BUFFER,this.cylinder);g.bufferData(g.ARRAY_BUFFER,makeCylinder(),g.STATIC_DRAW);this.cylinderX=g.createBuffer();g.bindBuffer(g.ARRAY_BUFFER,this.cylinderX);g.bufferData(g.ARRAY_BUFFER,makeCylinderX(),g.STATIC_DRAW);this.cylinderZ=g.createBuffer();g.bindBuffer(g.ARRAY_BUFFER,this.cylinderZ);g.bufferData(g.ARRAY_BUFFER,makeCylinderZ(),g.STATIC_DRAW);this.packageBuffers={};for(const [name,vertices] of Object.entries({...PACKAGE_GEOMETRY,...CONTAINER_GEOMETRY})){const buffer=g.createBuffer();g.bindBuffer(g.ARRAY_BUFFER,buffer);g.bufferData(g.ARRAY_BUFFER,vertices,g.STATIC_DRAW);this.packageBuffers[name]={buffer,count:vertices.length/8};}this.lineBuffer=g.createBuffer();this.textures={};for(const kind of ['carton','crate','board','pallet','metal','paper','plastic','drum','jute','roll','plastic_crate','sack','machine','reel','bundle','coolbox','round_pack','irregular','tape','strap','shippingLabel','crease','wrap','cable','rollEnd','corePaper','containerPaint','zinc','rubber','containerMark','shadow','handlingMark','redPaint'])this.textures[kind]=texture(g,kind);g.enable(g.DEPTH_TEST);g.enable(g.BLEND);g.blendFunc(g.SRC_ALPHA,g.ONE_MINUS_SRC_ALPHA);this.loc={pos:g.getAttribLocation(this.prog,'aPosition'),normal:g.getAttribLocation(this.prog,'aNormal'),uv:g.getAttribLocation(this.prog,'aUV'),vp:g.getUniformLocation(this.prog,'uVP'),model:g.getUniformLocation(this.prog,'uModel'),color:g.getUniformLocation(this.prog,'uColor'),tex:g.getUniformLocation(this.prog,'uTexture'),rough:g.getUniformLocation(this.prog,'uRoughness'),metal:g.getUniformLocation(this.prog,'uMetalness'),normalMap:g.getUniformLocation(this.prog,'uNormalMap'),roughMap:g.getUniformLocation(this.prog,'uRoughnessMap'),eye:g.getUniformLocation(this.prog,'uEye'),quality:g.getUniformLocation(this.prog,'uQuality')};this.lines={pos:g.getAttribLocation(this.lineProg,'aPosition'),vp:g.getUniformLocation(this.lineProg,'uVP'),color:g.getUniformLocation(this.lineProg,'uColor')};if(!this.contextEventsReady){this.contextEventsReady=true;this.canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();this.fallback=true;this.error='WebGL 上下文中断，已切换到二维后备渲染';if(!this.fallbackCanvas){this.fallbackCanvas=document.createElement('canvas');this.fallbackCanvas.setAttribute('role','img');this.fallbackCanvas.setAttribute('aria-label','货柜三维后备视图');Object.assign(this.fallbackCanvas.style,{position:'absolute',inset:'0',width:'100%',height:'100%'});this.parent.insertBefore(this.fallbackCanvas,this.overlay);this.canvas.style.visibility='hidden';this.events(this.fallbackCanvas);}this.draw(this.state)});this.canvas.addEventListener('webglcontextrestored',()=>{this.fallbackCanvas?.remove();this.fallbackCanvas=null;this.canvas.style.visibility='';this.fallback=false;this.init();this.draw(this.state)});}this.loadCustomTextures();this.loadAuthoredTextures();
 }catch(e){this.fallback=true;this.error=e.message;if(this.gl){this.canvas.remove();this.canvas=document.createElement('canvas');this.canvas.setAttribute('aria-label',`三维后备视图 ${this.mode}`);this.parent.prepend(this.canvas);this.gl=null;}}}
 loadAuthoredTextures(){const gl=this.gl;loadAuthoredSurfaces().then(maps=>{if(!maps||this.disposed||this.fallback||this.gl!==gl)return;const photos=loadImages();for(const [kind,surface] of Object.entries(maps)){authoredMaterialMaps.set(kind,surface);if(photos[kind])continue;const previous=this.textures[kind];this.textures[kind]=uploadSurfaceMaps(gl,surface);if(previous)for(const tex of Object.values(previous))gl.deleteTexture(tex);}this.canvas.dataset.surfaceSource='local-generated-atlas';this.draw(this.state);});}
 loadCustomTextures(){if(!this.gl||this.fallback)return;const photos=loadImages();const g=this.gl;for(const kind of Object.keys(this.textures)){const src=photos[kind];if(!src){if(this.photoKinds?.has(kind)){for(const tex of Object.values(this.textures[kind]))g.deleteTexture(tex);this.textures[kind]=texture(g,kind);this.photoKinds.delete(kind)}continue;}const image=new Image();image.onload=()=>{if(this.fallback||!this.gl||photos[kind]!==loadImages()[kind])return;try{const previous=this.textures[kind];this.textures[kind]=texture(g,kind,image);for(const tex of Object.values(previous))g.deleteTexture(tex);this.photoKinds??=new Set();this.photoKinds.add(kind);this.draw(this.state)}catch(e){console.warn('材质贴图无法应用',e)}};image.src=src}}
 resize(){const dpr=Math.min(1.7,window.devicePixelRatio||1);const w=Math.max(1,Math.floor(this.parent.clientWidth*dpr)),h=Math.max(1,Math.floor(this.parent.clientHeight*dpr));if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h}if(this.gl)this.gl.viewport(0,0,w,h);return{w,h}}
 camera(box){const L=box.L/M,W=box.W/M,H=box.H/M;const playback=this.state?.opts?.playback&&!this.focusTarget;const extra=playback?Math.max(0,Number(this.state.opts.playbackClearanceMm)||Math.max(1400,box.L*.22))/M:containerDoorReach(box,this.state?.opts||{});this.playbackDimensions=extra?{L:L+extra,W,H}:null;this.playbackCenter=extra?{x:(L+extra)*M/2,y:W*M/2,z:H*M/2}:null;const center=this.focusTarget?[this.focusTarget.x/M,this.focusTarget.z/M,this.focusTarget.y/M]:[(L+extra)/2,H/2,W/2];const largest=Math.max(L,W,H),aspect=Math.max(.15,this.canvas.width/Math.max(1,this.canvas.height));let eye,projection;
 if(this.mode==='iso'){
  const dimensions=this.focusDimensions||this.playbackDimensions||{L,W,H};
  const fitted=fitDistance({...dimensions,yaw:this.yaw,pitch:this.pitch,aspect});
  const distance=fitted/this.zoom;
  eye=[center[0]+distance*Math.cos(this.pitch)*Math.sin(this.yaw),center[1]+distance*Math.sin(this.pitch),center[2]+distance*Math.cos(this.pitch)*Math.cos(this.yaw)];
  projection=perspective(Math.PI/4,aspect,.005,Math.max(largest*80,distance+largest*10));
 } else{
  const dims=this.focusDimensions||this.playbackDimensions||{L,W,H};
  const half=orthographicHalfExtent({...dims,mode:this.mode,aspect})/this.zoom;
  projection=orthographic(-half*aspect,half*aspect,-half,half,.01,largest*24);
  eye={top:[center[0],center[1]+largest*3,center[2]+.001],door:[center[0]+largest*3,center[1]+.001,center[2]],side:[center[0],center[1]+.001,center[2]+largest*3]}[this.mode];
 }
 this.eye=eye;this.vp=mul(projection,lookAt(eye,center));this.invVP=inv(this.vp);this.center=center}
 resetCamera(){this.yaw=.75;this.pitch=.45;this.zoom=1;this.focusTarget=null;this.focusDimensions=null;this.handlers.draw?.();}
 orbit(yaw=0,pitch=0){if(this.mode!=='iso')return false;this.yaw+=yaw;this.pitch=clamp(this.pitch+pitch,.05,1.50);this.handlers.draw?.();return true;}
 zoomBy(multiplier){this.zoom=clamp(this.zoom*multiplier,.3,16);this.handlers.draw?.();}
 panBy(dx,dy){const box=this.state?.box;if(!box)return;const scale=Math.max(box.L,box.W,box.H)/Math.max(160,this.parent.clientWidth)*1.5/this.zoom;
 const h={x:-Math.sin(this.yaw),y:Math.cos(this.yaw)};const v={x:Math.cos(this.yaw),y:Math.sin(this.yaw)};
 const target=this.focusTarget||{x:box.L/2,y:box.W/2,z:box.H/2};
 this.focusTarget={x:target.x-dx*scale*h.x+dy*scale*v.x,y:target.y-dx*scale*h.y+dy*scale*v.y,z:target.z};
 this.handlers.draw?.();}
 focusItem(item){if(!item)return false;this.focusTarget={x:item.x+item.L/2,y:item.y+item.W/2,z:item.z+item.H/2};const longest=Math.max(this.state?.box?.L||item.L,this.state?.box?.W||item.W,this.state?.box?.H||item.H);this.focusDimensions={L:item.L/M,W:item.W/M,H:item.H/M};this.zoom=1;this.handlers.draw?.();return true;}
 project(world){if(this.fallback&&this.fallbackInfo){const q=this.fallbackInfo.project({x:world[0]*M,y:world[2]*M,z:world[1]*M});return{...q,visible:Number.isFinite(q.x)&&Number.isFinite(q.y)&&q.x>=0&&q.x<=this.parent.clientWidth&&q.y>=0&&q.y<=this.parent.clientHeight};}const p=transform(this.vp,...world);return{x:(p[0]+1)/2*this.parent.clientWidth,y:(1-p[1])/2*this.parent.clientHeight,visible:p[2]>-1&&p[2]<1&&p[0]>-1.2&&p[0]<1.2&&p[1]>-1.2&&p[1]<1.2}}
 ray(x,y){if(!this.invVP)return null;const u=x/this.parent.clientWidth*2-1,v=1-y/this.parent.clientHeight*2;const a=transform(this.invVP,u,v,-1),b=transform(this.invVP,u,v,1);return{o:a,d:normalize(b.map((n,i)=>n-a[i]))}}
 floorAt(clientX,clientY){
  const r=this.canvas.getBoundingClientRect(),x=clientX-r.left,y=clientY-r.top;
  if(this.fallback&&this.fallbackInfo){
   return invertFloorProjection(this.fallbackInfo.project,{x,y},this.state?.box);
  }
  const ray=this.ray(x,y);if(!ray||Math.abs(ray.d[1])<1e-8)return null;
  const t=-ray.o[1]/ray.d[1];if(t<0)return null;
  return{x:(ray.o[0]+ray.d[0]*t)*1000,y:(ray.o[2]+ray.d[2]*t)*1000};
 }
 hit(x,y){if(this.fallback&&this.fallbackInfo){const id=hitTest(this.fallbackInfo,x,y);return this.state?.items.find(p=>p.id===id)||null;}const ray=this.ray(x,y);if(!ray)return null;let best=null,d=Infinity;for(const p of this.state?.items||[]){const b={min:[p.x/M,p.z/M,p.y/M],max:[(p.x+p.L)/M,(p.z+p.H)/M,(p.y+p.W)/M]};const t=rayBox(ray.o,ray.d,b);if(t!==null&&t<d){best=p;d=t}}return best}
 queuePreview(id,patch,gesture={}){
  this.pendingPreview={id,patch,gesture};
  if(!this.previewFrame)this.previewFrame=requestAnimationFrame(()=>{this.previewFrame=null;this.flushPreview();});
 }
 flushPreview(){if(this.previewFrame){cancelAnimationFrame(this.previewFrame);this.previewFrame=null;}const next=this.pendingPreview;this.pendingPreview=null;if(next)this.handlers.preview?.(next.id,next.patch,next.gesture);}
 releasePointer(gesture){if(gesture?.captureTarget?.hasPointerCapture(gesture.pointerId))gesture.captureTarget.releasePointerCapture(gesture.pointerId);}
 cancelGesture(){const drag=this.drag,gizmo=this.gizmoDrag;if(this.previewFrame)cancelAnimationFrame(this.previewFrame);this.previewFrame=null;this.pendingPreview=null;this.drag=null;this.gizmoDrag=null;this.releasePointer(drag);this.releasePointer(gizmo);this.canvas.style.cursor='';this.marquee?.remove();this.marquee=null;this.handlers.cancelPreview?.();this.handlers.onDragEnd?.();}
 events(c=this.canvas){
  const point=e=>{const rect=c.getBoundingClientRect();return{x:e.clientX-rect.left,y:e.clientY-rect.top};};
  c.addEventListener('contextmenu',e=>{const pt=point(e),item=this.hit(pt.x,pt.y);e.preventDefault();if(item&&this.handlers.contextMenu)this.handlers.contextMenu(item.id,e.clientX,e.clientY);});
  c.addEventListener('pointerdown',e=>{
   if((e.button!==0&&e.button!==2)||this.drag||this.gizmoDrag)return;
   const pt=point(e),hit=this.hit(pt.x,pt.y),orbitMode=!!this.handlers.isOrbiting?.(),item=orbitMode?null:hit;
   if(e.button===2&&hit)return;
   const nativeTouch=e.pointerType==='touch'&&!document.body.classList.contains('v112-fullscreen')&&!this.handlers.touchEditing?.();
   if(!nativeTouch)c.setPointerCapture(e.pointerId);
   const blocked=item&&(item.locked||this.handlers.canEdit?.()===false);
   this.drag={pointerId:e.pointerId,captureTarget:c,nativeTouch,pt,last:pt,pan:e.button===2||e.altKey,item:e.shiftKey||e.metaKey||e.ctrlKey||e.button===2||e.altKey||blocked?null:item,started:false,original:item?{...item}:null,marquee:!orbitMode&&!item&&e.shiftKey&&!!this.handlers.isFree?.(),suppressCamera:!!item&&(e.shiftKey||e.metaKey||e.ctrlKey||blocked)};
   if(this.drag.marquee){this.marquee=document.createElement('div');this.marquee.className='selection-marquee';this.parent.append(this.marquee);}
   if(item&&!nativeTouch){
    this.handlers.onDragStart?.(item.id);
    this.handlers.select?.(item.id,{multi:e.shiftKey||e.metaKey||e.ctrlKey});
    if(blocked)this.handlers.editBlocked?.(item.locked?'货物已锁定，请先解锁。':'先退出装卸预演，再调整货物。');
   }
  });
  c.addEventListener('pointermove',e=>{
   const p=point(e);if(!this.drag){const hit=this.hit(p.x,p.y);this.handlers.hover?.(hit?.id||null);c.style.cursor=this.handlers.isOrbiting?.()||hit&&!hit.locked?'grab':'';return;}
   if(e.pointerId!==this.drag.pointerId)return;
   const d=this.drag,dx=p.x-d.last.x,dy=p.y-d.last.y;d.last=p;
   if(Math.hypot(p.x-d.pt.x,p.y-d.pt.y)>4)d.started=true;
   if(!d.started||d.suppressCamera||d.nativeTouch)return;
   if(d.pan){this.panBy(dx,dy);return;}
   if(d.marquee){if(this.marquee){Object.assign(this.marquee.style,{left:Math.min(d.pt.x,p.x)+'px',top:Math.min(d.pt.y,p.y)+'px',width:Math.abs(p.x-d.pt.x)+'px',height:Math.abs(p.y-d.pt.y)+'px'});}return;}
   if(d.item){
    const snap=this.handlers.snap?.()||10,axis=this.handlers.dragAxis?.()||'free';let delta;
    if(this.fallback&&this.fallbackInfo){
     // Canvas shares the actual projection: invert its two visible world axes.
     const world={x:d.original.x+d.original.L/2,y:d.original.y+d.original.W/2,z:d.original.z+d.original.H/2},project=this.fallbackInfo.project;
     const axes=this.mode==='side'?['x','z']:this.mode==='door'?['y','z']:['x','y'];
     const o=project(world),a=project({...world,[axes[0]]:world[axes[0]]+1000}),b=project({...world,[axes[1]]:world[axes[1]]+1000});
     const A=a.x-o.x,B=b.x-o.x,C=a.y-o.y,D=b.y-o.y,det=A*D-B*C;
     if(Math.abs(det)>1e-9){const u=p.x-d.pt.x,v=p.y-d.pt.y;delta={x:0,y:0,z:0,[axes[0]]:(u*D-v*B)/det*1000,[axes[1]]:(v*A-u*C)/det*1000};}
     if(delta&&axis!=='free')for(const name of ['x','y','z'])if(name!==axis)delta[name]=0;
    }else delta=dragPlaneDelta((x,y)=>this.ray(x,y),d.pt,p,d.original,this.mode,axis,this.eye);
    if(delta){const suggested={x:d.original.x+delta.x,y:d.original.y+delta.y,z:d.original.z+delta.z},settings=this.handlers.dragSettings?.()||{},bounded=settings.draft?Object.fromEntries(['x','y','z'].map(k=>[k,Math.abs(delta[k])<.0001?d.original[k]:Math.round(suggested[k]/snap)*snap])):boundedMove(suggested,d.original,this.state.box,{step:snap,axis,magnet:settings.magnet===false?0:85,neighbors:settings.magnet===false?[]:this.state.items.filter(item=>item.id!==d.item.id)});c.style.cursor='grabbing';this.queuePreview(d.item.id,bounded||suggested,{mode:this.mode,axis});}
   }else if(this.mode==='iso'){this.yaw+=dx*.009;this.pitch=clamp(this.pitch+dy*.009,.06,1.45);this.handlers.draw?.();}
  });
  c.addEventListener('pointerup',e=>{
   const drag=this.drag;if(!drag||e.pointerId!==drag.pointerId)return;
   if(drag.nativeTouch){if(!drag.started){const pt=point(e),picked=this.hit(pt.x,pt.y);if(picked)this.handlers.select?.(picked.id);}this.drag=null;return;}
   if(drag.marquee&&drag.started){const pt=point(e),project=this.fallback&&this.fallbackInfo?world=>this.fallbackInfo.project({x:world[0]*1000,y:world[2]*1000,z:world[1]*1000}):world=>this.project(world);this.handlers.selectMany?.(pickScreenRect(this.state?.items||[],project,{x1:drag.pt.x,y1:drag.pt.y,x2:pt.x,y2:pt.y}),{append:true});}
   else if(drag.item&&drag.started){this.flushPreview();this.handlers.commitPreview?.(drag.item.id);}
   else if(!drag.started&&this.handlers.isUnloading?.()){const pt=point(e),picked=this.hit(pt.x,pt.y);if(picked)this.handlers.select?.(picked.id);}
   this.marquee?.remove();this.marquee=null;this.drag=null;this.releasePointer(drag);c.style.cursor='';this.handlers.onDragEnd?.();
  });
  c.addEventListener('pointercancel',e=>{if(e.pointerId===this.drag?.pointerId)this.cancelGesture();});
  c.addEventListener('lostpointercapture',e=>{if(e.pointerId===this.drag?.pointerId)this.cancelGesture();});
  c.addEventListener('wheel',e=>{const isFullscreen=document.body.classList.contains('v112-fullscreen');const zoomIntent=e.ctrlKey||e.metaKey||e.altKey;if(!isFullscreen&&!zoomIntent)return;
   e.preventDefault();this.zoomBy(e.deltaY>0?.87:1.15);
  },{passive:false});
  c.addEventListener('dblclick',e=>{const p=point(e),item=this.hit(p.x,p.y);if(item)this.focusItem(item);else this.resetCamera();});
 }
 beginOverlay(){this.overlayUsed=new Set();}
 overlayNode(key,tag,cls){let el=this.overlayNodes.get(key);if(!el||el.tagName?.toLowerCase()!==tag){el?.remove();el=document.createElement(tag);this.overlayNodes.set(key,el);this.overlay.append(el);}if(el.className!==cls)el.className=cls;this.overlayUsed.add(key);return el;}
 overlayHTML(el,html){if(el._overlayHTML!==html){el.innerHTML=html;el._overlayHTML=html;}}
 endOverlay(){for(const [key,el] of this.overlayNodes)if(!this.overlayUsed.has(key)){el.remove();this.overlayNodes.delete(key);}}
 draw(state){if(!state)return;this.state=state;this.beginOverlay();const {box,items,opts}=state;this.canvas.setAttribute('aria-label',`货柜${{iso:'三维',top:'俯视',door:'柜门',side:'侧面'}[this.mode]||''}视图，当前显示 ${items.length} 件货物${state.selected?'，已选 '+(items.find(p=>p.id===state.selected)?.unitCode||state.selected):''}`);this.resize();this.camera(box);if(this.fallback){this.drawFallback(state);return;}const g=this.gl;g.clearColor(.937,.933,.922,1);g.clear(g.COLOR_BUFFER_BIT|g.DEPTH_BUFFER_BIT);const mesh=(x,y,z,w,h,d,kind='carton',tint=[1,1,1],alpha=1,shape='box',matrix=null)=>{if(w<=0||h<=0||d<=0)return;const custom=this.packageBuffers[shape];g.useProgram(this.prog);g.bindBuffer(g.ARRAY_BUFFER,custom?.buffer||(shape==='cylinder'?this.cylinder:shape==='cylinderX'?this.cylinderX:shape==='cylinderZ'?this.cylinderZ:this.cube));g.enableVertexAttribArray(this.loc.pos);g.enableVertexAttribArray(this.loc.normal);g.enableVertexAttribArray(this.loc.uv);g.vertexAttribPointer(this.loc.pos,3,g.FLOAT,false,32,0);g.vertexAttribPointer(this.loc.normal,3,g.FLOAT,false,32,12);g.vertexAttribPointer(this.loc.uv,2,g.FLOAT,false,32,24);g.uniformMatrix4fv(this.loc.vp,false,this.vp);g.uniformMatrix4fv(this.loc.model,false,matrix||model(x,y,z,w,h,d));g.uniform4f(this.loc.color,...tint,alpha);g.uniform1i(this.loc.tex,0);const surface=materialParameters(kind),maps=this.textures[kind]||this.textures.carton;g.uniform1f(this.loc.rough,surface.roughness);g.uniform1f(this.loc.metal,surface.metalness);g.uniform1f(this.loc.quality,opts.pbr===false?0:1);g.uniform3fv(this.loc.eye,this.eye);g.uniform1i(this.loc.normalMap,1);g.uniform1i(this.loc.roughMap,2);g.activeTexture(g.TEXTURE0);g.bindTexture(g.TEXTURE_2D,maps.albedo);g.activeTexture(g.TEXTURE1);g.bindTexture(g.TEXTURE_2D,maps.normal);g.activeTexture(g.TEXTURE2);g.bindTexture(g.TEXTURE_2D,maps.roughness);if(alpha<1)g.depthMask(false);g.drawArrays(g.TRIANGLES,0,custom?.count||(shape==='cylinder'||shape==='cylinderX'||shape==='cylinderZ'?24*12:36));if(alpha<1)g.depthMask(true)};
 const lines=(pts,col=[.4,.55,.46,1])=>{g.useProgram(this.lineProg);g.bindBuffer(g.ARRAY_BUFFER,this.lineBuffer);g.bufferData(g.ARRAY_BUFFER,new Float32Array(pts),g.DYNAMIC_DRAW);g.enableVertexAttribArray(this.lines.pos);g.vertexAttribPointer(this.lines.pos,3,g.FLOAT,false,0,0);g.uniformMatrix4fv(this.lines.vp,false,this.vp);g.uniform4fv(this.lines.color,col);g.drawArrays(g.LINES,0,pts.length/3)};
 const L=box.L/M,W=box.W/M,H=box.H/M;
 // Complete physical construction is a presentation layer derived from the real clearances.
 const body=containerParts(box,{doorAngle:opts.doorAngle??112,containerView:opts.containerView||'complete',eye:this.eye});
 const bodyAlpha=resolveContainerAppearance(opts).opacity;
 this.containerVisual={parts:body.length,roof:body.some(p=>p.name==='roof'),doorLeaves:body.filter(p=>p.name==='door-leaf').length,opacity:bodyAlpha,doorAngle:opts.doorAngle??112,view:opts.containerView||'complete'};
 const drawPart=(part,alpha)=>{const cull=alpha<1&&part.shape.startsWith('corrugated');if(cull){g.enable(g.CULL_FACE);g.cullFace(g.BACK);}mesh(part.x,part.y,part.z,part.w,part.h,part.d,part.material,part.tint,alpha,part.shape,containerPartModel(part));if(cull)g.disable(g.CULL_FACE);};
 mesh(L/2,-.172,W/2,L*1.30,.001,W*1.75,'shadow',[1,1,1],.28,'shadowPlane');
 mesh(L/2,-.060,W/2,L,.11,W,'pallet',[.86,.84,.80]);
 const plankCount=Math.max(8,Math.min(20,Math.round(W/.145)));
 for(let i=0;i<plankCount;i++){
  const z=(i+.5)*W/plankCount;
  mesh(L/2,-.004,z,L,.008,Math.max(.02,W/plankCount-.005),'board',[i%3===0?.97:i%3===1?1:.91,.96,.90]);
 }
 if(bodyAlpha>0)for(const part of body.filter(p=>p.group==='base'))drawPart(part,bodyAlpha);

 if(opts.grid){const grid=[];for(let x=0;x<=L+.01;x+=.5)grid.push(x,.006,0,x,.006,W);for(let z=0;z<=W+.01;z+=.5)grid.push(0,.006,z,L,.006,z);g.disable(g.DEPTH_TEST);lines(grid,[.60,.72,.65,.40]);g.enable(g.DEPTH_TEST)}
 for(const p of items){mesh((p.x+p.L/2)/M,p.z/M+.001,(p.y+p.W/2)/M,p.L/M*1.07,.001,p.W/M*1.07,'shadow',[.62,.60,.57],.24,'shadowPlane');}
 for(const p of items){const x=(p.x+p.L/2)/M,y=(p.z+p.H/2)/M,z=(p.y+p.W/2)/M,w=p.L/M,h=p.H/M,d=p.W/M;const kind=p.kind||'carton';const ready=state.opts.unloadMode&&state.opts.unloadReadyIds?.includes(p.id);
 const blocker=state.opts.unloadMode&&state.opts.unloadBlockerIds?.includes(p.id);
 const variation=(String(p.id).split('').reduce((a,c)=>a+c.charCodeAt(0),0)%9-4)*.009;
 const tint=blocker?[1,.86,.76]:[1+variation,1+variation*.7,1+variation*.4];
 const lowDetail=!!opts.lowDetail||(opts.playback&&items.length>100&&p.id!==opts.motionId&&p.id!==state.selected);
 if(lowDetail){
  if(kind==='pallet'&&h>.18){const base=Math.min(.144,h*.17);mesh(x,y-h/2+base/2,z,w*.98,base,d*.98,'pallet',tint);mesh(x,y+base/2,z,w*.98,h-base,d*.98,'carton',tint);}
  else{const cylinder=['drum','roll','round_pack'].includes(kind);mesh(x,y,z,w,h,d,kind==='bag'?'jute':kind,tint,1,cylinder?'cylinder':'box');}
 }else if(ENHANCED_PACKAGES.includes(kind)){
  for(const part of packageParts(p)){const surfaceTint=part.tint.map((v,i)=>v*tint[i]);mesh(0,0,0,1,1,1,part.material,surfaceTint,part.alpha,part.shape,packagePartModel(p,part));}
 }else{
 mesh(x,y,z,w*.992,h*.992,d*.992,'carton',tint);
 }
 if(p.id===state.selected||state.selectedIds?.includes(p.id)||opts.invalidIds?.includes(p.id)){const ix=p.x/M,iy=p.z/M,iz=p.y/M,ex=(p.x+p.L)/M,ey=(p.z+p.H)/M,ez=(p.y+p.W)/M;const pts=[ix,iy,iz,ex,iy,iz,ex,iy,iz,ex,iy,ez,ex,iy,ez,ix,iy,ez,ix,iy,ez,ix,iy,iz,ix,ey,iz,ex,ey,iz,ex,ey,iz,ex,ey,ez,ex,ey,ez,ix,ey,ez,ix,ey,ez,ix,ey,iz,ix,iy,iz,ix,ey,iz,ex,iy,iz,ex,ey,iz,ex,iy,ez,ex,ey,ez,ix,iy,ez,ix,ey,ez];g.disable(g.DEPTH_TEST);lines(pts,opts.invalidIds?.includes(p.id)?[.72,.20,.12,1]:[.17,.23,.19,1]);g.enable(g.DEPTH_TEST)}
 }
 // A directional face marker distinguishes 0/90/180/270 on asymmetric packages.
 for(const p of items){if(!p.heading)continue;
  const theta=p.heading*Math.PI/180,xx=(p.x+p.L/2)/M,zz=(p.y+p.W/2)/M,yy=(p.z+p.H)/M+.015;
  const len=Math.min(p.L,p.W)/M*.23,ux=Math.cos(theta),uz=Math.sin(theta);
  const ax=xx+ux*len,az=zz+uz*len;
  g.disable(g.DEPTH_TEST);
  lines([xx-ux*len*.65,yy,zz-uz*len*.65,ax,yy,az,
    ax,yy,az,ax-ux*len*.36-uz*len*.4,yy,az-uz*len*.36+ux*len*.4,
    ax,yy,az,ax-ux*len*.36+uz*len*.4,yy,az-uz*len*.36-ux*len*.4],[.98,.43,.22,1]);
  g.enable(g.DEPTH_TEST);
 }
 // Sort complete assemblies far to near. Opaque skin writes depth; transparent skin
 // blends over the cargo. The same slider applies to panels, roof, hardware and doors.
 if(bodyAlpha>0){
  const distance=p=>(p.x-this.eye[0])**2+(p.y-this.eye[1])**2+(p.z-this.eye[2])**2;
  const shell=body.filter(p=>p.group!=='base').sort((a,b)=>distance(b)-distance(a));
  for(const part of shell)drawPart(part,bodyAlpha);
 }
 // The measured envelope and the open doorway are permanent orientation
 // references. Hiding wall panels must never hide the container itself.
 const edges=[0,0,0,L,0,0,L,0,0,L,0,W,L,0,W,0,0,W,0,0,W,0,0,0,0,H,0,L,H,0,L,H,0,L,H,W,L,H,W,0,H,W,0,H,W,0,H,0,0,0,0,0,H,0,L,0,0,L,H,0,L,0,W,L,H,W,0,0,W,0,H,W];
 if(bodyAlpha<.04||opts.dimensions){g.disable(g.DEPTH_TEST);lines(edges,[.34,.40,.47,.58]);g.enable(g.DEPTH_TEST);}
 const doorLeft=(W-box.doorW/M)/2,doorRight=doorLeft+box.doorW/M,doorHeight=box.doorH/M;
 if(bodyAlpha<.04||opts.dimensions)for(const side of [doorLeft,doorRight])mesh(L+.018,doorHeight/2,side,.038,doorHeight,.038,'metal',[.95,.64,.18],.96);
 if(bodyAlpha<.04||opts.dimensions)mesh(L+.018,doorHeight,(doorLeft+doorRight)/2,.038,.038,box.doorW/M,'metal',[.95,.64,.18],.96);
 if(bodyAlpha<.04||opts.dimensions)mesh(L+.018,.006,(doorLeft+doorRight)/2,.048,.012,box.doorW/M,'metal',[.95,.64,.18],.96);
 g.disable(g.DEPTH_TEST);lines([L,.012,W*.5,L+.45,.012,W*.5,L+.45,.012,W*.5,L+.29,.012,W*.5-.10,L+.45,.012,W*.5,L+.29,.012,W*.5+.10],[.75,.43,.08,1]);g.enable(g.DEPTH_TEST);
 if(opts.axes){const amt=Math.min(1.1,L*.25);g.disable(g.DEPTH_TEST);lines([0,.025,0,amt,.025,0],[.77,.34,.25,1]);lines([0,.025,0,0,.025,Math.min(W*.45,1.1)],[.23,.47,.70,1]);lines([0,.025,0,0,Math.min(H*.45,1.1),0],[.19,.59,.43,1]);g.enable(g.DEPTH_TEST)}
 this.labels(state);
 this.unloadMarkers(state);this.containerMarkers(state);this.endOverlay();
 }
 drawFallback(state){const canvas=this.fallbackCanvas||this.canvas;const opts={cam:{...CAMERA_PRESETS[this.mode==='iso'?'iso':this.mode],yaw:this.mode==='iso'?this.yaw:CAMERA_PRESETS[this.mode].yaw,pitch:this.mode==='iso'?this.pitch:CAMERA_PRESETS[this.mode].pitch,zoom:this.zoom,center:this.focusTarget||this.playbackCenter,dimensions:(this.focusDimensions||this.playbackDimensions)?Object.fromEntries(Object.entries(this.focusDimensions||this.playbackDimensions).map(([k,v])=>[k,v*M])):null},selected:state.selected,selectedIds:state.selectedIds,invalidIds:state.opts.invalidIds,axes:state.opts.axes,grid:state.opts.grid,labels:state.opts.tags,dims:state.opts.dimensions,xray:state.opts.walls,transparency:Math.round((1-state.opts.wallOpacity)*100),containerView:state.opts.containerView,doorAngle:state.opts.doorAngle,locatorFocus:!!state.opts.locatorFocus,focusId:state.selected,unloadMode:!!state.opts.unloadMode,unloadReadyIds:state.opts.unloadReadyIds,unloadBlockerIds:state.opts.unloadBlockerIds,motionId:state.opts.motionId,lowDetail:state.opts.lowDetail,pbr:state.opts.pbr};this.fallbackInfo=drawScene(canvas,state.box,state.items,opts);if(state.opts.coords&&!state.opts.unloadMode){const p=state.items.find(p=>p.id===state.selected);if(p){const label=this.overlayNode('fallback-selected','div','cargo-label selected');const h=this.fallbackInfo.hits?.find(h=>h.id===p.id);const pts=h?.pts||[];const cx=pts.length?pts.reduce((a,v)=>a+v.x,0)/pts.length:90,cy=pts.length?pts.reduce((a,v)=>a+v.y,0)/pts.length:48;label.style.left=Math.max(145,Math.min(this.parent.clientWidth-145,cx))+'px';label.style.top=Math.max(118,Math.min(this.parent.clientHeight-22,cy))+'px';this.overlayHTML(label,`<b>${escape(p.unitCode||p.id)}</b><small>${escape(p.groupId||'未分组')} · ${escape(CARGO_TYPES[p.kind]?.label||p.kind||'未分类')}${p.unitCodeSource==='system-planned'?' · 规划编号':''}</small><small>${displayNumber(p.L,state.opts.precision)} × ${displayNumber(p.W,state.opts.precision)} × ${displayNumber(p.H,state.opts.precision)} mm · ${displayNumber(p.weight,state.opts.precision)} kg</small><small>X ${displayNumber(p.x,state.opts.precision)} · Y ${displayNumber(p.y,state.opts.precision)} · Z ${displayNumber(p.z,state.opts.precision)} mm</small>`);if(state.opts.multi&&this.mode!=='iso'){this.overlayUsed.delete('fallback-selected');}}}this.unloadMarkers(state);this.gizmo(state);this.containerMarkers(state);this.endOverlay()}
 containerMarkers(state){
  const {box,opts}=state;
  const locate=p=>this.fallback&&this.fallbackInfo?this.fallbackInfo.project(p):this.project([p.x/M,p.z/M,p.y/M]);
  for(const [key,text,p] of [['door','柜门 · +X',{x:box.L,y:box.W/2,z:0}],['nose','柜头 · X = 0',{x:0,y:box.W/2,z:box.H}]]){
   const q=locate(p);if(q.visible===false)continue;
   const label=this.overlayNode('container:'+key,'div','container-pin '+key);
   label.textContent=text;label.style.left=clamp(q.x,65,this.parent.clientWidth-65)+'px';label.style.top=clamp(q.y+(key==='door'?20:opts.dimensions&&this.mode==='top'?24:-12),20,this.parent.clientHeight-20)+'px';
  }
  const route=opts.motionRoute||opts.previewRoute,item=state.items.find(p=>p.id===(opts.motionId||state.selected));
  if(route?.length>1&&item){
   const points=route.map(p=>locate({x:p.x+item.L/2,y:p.y+item.W/2,z:p.z+item.H/2}));
   const line=this.overlayNode('cargo-route','div','cargo-route');
   this.overlayHTML(line,`<svg width="100%" height="100%" aria-label="已计算的装卸移动路径"><polyline points="${points.map(p=>`${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ')}" fill="none" stroke="#2563c0" stroke-width="2.5" stroke-dasharray="7 5" stroke-linejoin="round"/>${points.map(p=>`<circle cx="${p.x.toFixed(2)}" cy="${p.y.toFixed(2)}" r="3.5" fill="#fff" stroke="#2563c0" stroke-width="2"/>`).join('')}</svg>`);
  }
 }
 labels(state){const {items,selected,opts,box}=state;const occupied=[];const make=(x,y,z,html,cls,key=cls+':'+html)=>{const p=this.project([x,y,z]);if(!p.visible)return;const cargo=key.startsWith('cargo:'),chosen=cls.includes('selected');const width=Math.min(chosen?255:180,this.parent.clientWidth-16),height=chosen?84:48;const px=cargo?clamp(p.x,width/2+8,this.parent.clientWidth-width/2-8):p.x,py=cargo?clamp(p.y,height+12,this.parent.clientHeight-8):p.y;const rect={x:px-width/2,y:py-height,w:width,h:height};if(cargo&&!chosen&&occupied.some(r=>rect.x<r.x+r.w+5&&rect.x+rect.w+5>r.x&&rect.y<r.y+r.h+5&&rect.y+rect.h+5>r.y))return;if(cargo)occupied.push(rect);const el=this.overlayNode(key,'div',cls);el.style.left=px+'px';el.style.top=py+'px';if(cargo)el.style.maxWidth=width+'px';this.overlayHTML(el,html)};
 if((opts.tags||opts.coords)&&(!opts.multi||this.mode==='iso')){const chosen=opts.coordsScope==='all'?items:items.filter(p=>p.id===selected);const picked=items.filter(p=>p.id===selected);const shown=new Map([...picked,...chosen].map(p=>[p.id,p]));let n=0;for(const p of shown.values()){if(n++>=38)break;let label=opts.tags?`<b>${escape(p.unitCode||p.id)}</b><small>${escape(p.groupId||'未分组')} · ${escape(CARGO_TYPES[p.kind]?.label||p.kind||'未分类')}${p.unitCodeSource==='system-planned'?' · 规划编号':''}</small>`:'';if(opts.coords&&(opts.coordsScope==='all'||p.id===selected))label+=`<small>X ${displayNumber(p.x,opts.precision)} · Y ${displayNumber(p.y,opts.precision)} · Z ${displayNumber(p.z,opts.precision)}</small>`;if(p.id===selected&&opts.tags)label+=`<small>${displayNumber(p.L,opts.precision)} × ${displayNumber(p.W,opts.precision)} × ${displayNumber(p.H,opts.precision)} mm · ${displayNumber(p.weight,opts.precision)} kg</small>`;if(label)make((p.x+p.L/2)/M,(p.z+p.H)/M+.10,(p.y+p.W/2)/M,label,`cargo-label ${p.id===selected?'selected':''}`,'cargo:'+p.id)}}
 if(opts.axes){const sx=Math.min(1.35,box.L/M*.23),sw=Math.min(1.0,box.W/M*.5),sh=Math.min(1.0,box.H/M*.5);make(sx,.02,0,'X','axis-label');make(0,.02,sw,'Y','axis-label');make(0,sh,0,'Z','axis-label')}
 if(opts.dimensions){
  if(this.mode!=='door')make(box.L/M/2,-.12,0,`长 ${displayNumber(box.L,opts.precision)} mm`,'cargo-label dimension-label');
  if(this.mode!=='side')make(0,-.10,box.W/M/2,`宽 ${displayNumber(box.W,opts.precision)} mm`,'cargo-label dimension-label');
  if(this.mode!=='top')make(0,box.H/M/2,0,`高 ${displayNumber(box.H,opts.precision)} mm`,'cargo-label dimension-label');
 }
 this.gizmo(state);
 }
 gizmo(state){if(state.opts.unloadMode)return;if(state.opts.multi&&this.mode!=='iso')return;const p=state.items.find(item=>item.id===state.selected);if((!state.opts.axes&&!state.opts.editHandles)||!p||p.locked)return;const origin=[(p.x+p.L/2)/M,(p.z+p.H/2)/M,(p.y+p.W/2)/M];const cx=this.project(origin);const axes={x:[origin[0]+.65,origin[1],origin[2]],y:[origin[0],origin[1],origin[2]+.65],z:[origin[0],origin[1]+.65,origin[2]]};if(!cx.visible)return;for(const [axis,world] of Object.entries(axes)){const pt=this.project(world),dx=pt.x-cx.x,dy=pt.y-cx.y,len=Math.hypot(dx,dy);if(!pt.visible||len<12)continue;const line=this.overlayNode('gizmo-line:'+axis,'div',`gizmo-line axis-${axis}`);line.style.left=cx.x+'px';line.style.top=cx.y+'px';line.style.width=len+'px';line.style.transform=`rotate(${Math.atan2(dy,dx)}rad)`;const handle=this.overlayNode('gizmo-handle:'+axis,'button',`gizmo-handle axis-${axis}`);handle.type='button';handle.dataset.axis=axis;handle.textContent=axis.toUpperCase();handle.title=`拖动 ${axis.toUpperCase()} 轴调整位置`;handle.style.left=pt.x+'px';handle.style.top=pt.y+'px';}}

 unloadMarkers(state){
  if(!state?.opts?.unloadMode)return;
  const rank=new Map((state.opts.unloadOrder||[]).map((id,i)=>[id,i+1]));
  const ready=new Set(state.opts.unloadReadyIds||[]),occupied=[];
  const selected=state.items.find(item=>item.id===state.selected);
  const projected=p=>{const hit=this.fallback?this.fallbackInfo?.hits?.find(q=>q.id===p.id):null;
   return hit?.pts?.length?{x:hit.pts.reduce((s,k)=>s+k.x,0)/hit.pts.length,y:hit.pts.reduce((s,k)=>s+k.y,0)/hit.pts.length}:this.project([(p.x+p.L/2)/M,(p.z+p.H)/M,(p.y+p.W/2)/M]);};
  const visible=state.items.filter(p=>rank.has(p.id)&&rank.get(p.id)<=6||p.id===state.selected).sort((a,b)=>(a.id===state.selected?-1:b.id===state.selected?1:rank.get(a.id)-rank.get(b.id)));
  const w=this.parent.clientWidth,h=this.parent.clientHeight;
  for(const p of visible){const pos=projected(p);if(!pos||!Number.isFinite(pos.x)||!Number.isFinite(pos.y)||pos.x<0||pos.y<0||pos.x>w||pos.y>h)continue;
   const n=rank.get(p.id),badge=this.overlayNode('unload:'+p.id,'button','v112-order-badge v116-order-badge '+(p.id===state.selected?'v116-current':ready.has(p.id)?'ready':'blocked'));badge.type='button';
   const candidates=[[0,0],[0,-30],[34,0],[-34,0],[0,33],[36,-30],[-36,-30]];
   const delta=candidates.find(([dx,dy])=>!occupied.some(pt=>Math.hypot(pt.x-(pos.x+dx),pt.y-(pos.y+dy))<31))||[0,0];
   const x=clamp(pos.x+delta[0],18,w-20),y=clamp(pos.y+delta[1],18,h-20);occupied.push({x,y});badge.style.left=x+'px';badge.style.top=y+'px';badge.textContent=n?String(n):'●';badge.title=(n?'第 '+n+' 步':'已选受阻件')+' · '+(p.unitCode||p.id);badge.setAttribute('aria-label',badge.title);badge.onclick=()=>this.handlers.select?.(p.id);
  }
  // Dashed directional hint is not a forklift trajectory and never certifies unloading clearance.
  if(selected){
   const location=(x,y,z)=>this.fallback&&this.fallbackInfo?this.fallbackInfo.project({x,y,z}):this.project([x/M,z/M,y/M]);
   const source=location(selected.x+selected.L/2,selected.y+selected.W/2,selected.z+selected.H/2);
   const dest=location(state.box.L,selected.y+selected.W/2,selected.z+selected.H/2);
   if(source&&dest&&Number.isFinite(source.x)&&Number.isFinite(source.y)&&Number.isFinite(dest.x)&&Number.isFinite(dest.y)){
    const dx=dest.x-source.x,dy=dest.y-source.y,len=Math.hypot(dx,dy);
    const angle=Math.atan2(len>2?dy:0,len>2?dx:1),length=Math.min(100,Math.max(30,len*.75));
    const px=clamp(source.x,15,w-30),py=clamp(source.y,20,h-20);
    const line=this.overlayNode('unload-path','div','v116-path-vector '+(ready.has(selected.id)?'ready':'blocked'));
    line.style.left=px+'px';line.style.top=py+'px';line.style.width=length+'px';line.style.transform=`rotate(${angle}rad)`;
    line.title='朝柜门直线方向的示意箭头，并非叉车可用路径';
   }
  }
 }

 gizmoEvents(){
  this.onGestureBlur=()=>{if(this.drag||this.gizmoDrag)this.cancelGesture();};window.addEventListener('blur',this.onGestureBlur);
  this.onGestureEscape=e=>{if(e.key==='Escape'&&(this.drag||this.gizmoDrag))this.cancelGesture();};window.addEventListener('keydown',this.onGestureEscape);
  this.overlay.addEventListener('pointerdown',e=>{
   const handle=e.target.closest('.gizmo-handle');if(!handle)return;
   if(e.button!==0||this.drag||this.gizmoDrag)return;
   e.preventDefault();e.stopPropagation();
   const p=this.state?.items.find(v=>v.id===this.state?.selected);
   if(!p||p.locked||this.handlers.canEdit?.()===false){this.handlers.editBlocked?.(p?.locked?'货物已锁定，请先解锁。':'先退出装卸预演，再调整货物。');return;}
   const axis=handle.dataset.axis,origin=[(p.x+p.L/2)/M,(p.z+p.H/2)/M,(p.y+p.W/2)/M],vec={x:[1,0,0],y:[0,0,1],z:[0,1,0]}[axis];
   const a=this.project(origin),b=this.project(origin.map((v,i)=>v+vec[i])),d={x:b.x-a.x,y:b.y-a.y},length2=d.x*d.x+d.y*d.y;
   if(length2<36)return;
   this.handlers.onDragStart?.(p.id);
   this.gizmoDrag={pointerId:e.pointerId,captureTarget:this.overlay,id:p.id,axis,original:{...p},start:{x:e.clientX,y:e.clientY},d,length2};
   this.overlay.setPointerCapture(e.pointerId);
  });
  this.overlay.addEventListener('pointermove',e=>{
   const drag=this.gizmoDrag;if(!drag||e.pointerId!==drag.pointerId)return;e.preventDefault();
   const pixels={x:e.clientX-drag.start.x,y:e.clientY-drag.start.y},distanceMm=(pixels.x*drag.d.x+pixels.y*drag.d.y)/drag.length2*M;
   const snap=Math.max(.0001,Number(this.handlers.snap?.()||25)),next=Math.round((drag.original[drag.axis]+distanceMm)/snap)*snap;
   const suggested={x:drag.original.x,y:drag.original.y,z:drag.original.z,[drag.axis]:next},settings=this.handlers.dragSettings?.()||{};
   const bounded=settings.draft?suggested:boundedMove(suggested,drag.original,this.state.box,{step:snap,axis:drag.axis,magnet:settings.magnet===false?0:85,neighbors:settings.magnet===false?[]:this.state.items.filter(p=>p.id!==drag.id)});
   if(bounded)this.queuePreview(drag.id,bounded,{mode:this.mode,axis:drag.axis});
  });
  this.overlay.addEventListener('pointerup',e=>{const drag=this.gizmoDrag;if(!drag||e.pointerId!==drag.pointerId)return;const id=drag.id;this.flushPreview();this.gizmoDrag=null;this.releasePointer(drag);this.handlers.commitPreview?.(id);this.handlers.onDragEnd?.();});
  this.overlay.addEventListener('pointercancel',e=>{if(e.pointerId===this.gizmoDrag?.pointerId)this.cancelGesture();});
  this.overlay.addEventListener('lostpointercapture',e=>{if(e.pointerId===this.gizmoDrag?.pointerId)this.cancelGesture();});
 }
 dispose(){window.removeEventListener('blur',this.onGestureBlur);window.removeEventListener('keydown',this.onGestureEscape);if(this.drag||this.gizmoDrag)this.cancelGesture();if(this.previewFrame)cancelAnimationFrame(this.previewFrame);this.pendingPreview=null;this.disposed=true;window.removeEventListener('realload:materials-changed',this.onMaterialChange);this.resizeObserver.disconnect();this.parent.replaceChildren();if(this.gl){for(const v of Object.values(this.textures))for(const tex of Object.values(v))this.gl.deleteTexture(tex);this.gl.deleteBuffer(this.cube);this.gl.deleteBuffer(this.cylinder);this.gl.deleteBuffer(this.cylinderX);this.gl.deleteBuffer(this.cylinderZ);this.gl.deleteBuffer(this.lineBuffer);for(const geometry of Object.values(this.packageBuffers||{}))this.gl.deleteBuffer(geometry.buffer);this.gl.deleteProgram(this.prog);this.gl.deleteProgram(this.lineProg)}}
}
const escape=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
export const webglMath={mul,perspective,orthographic,lookAt,transform,inv,rayBox};
