/** Offline PBR material definitions for generic packaging appearance.
 * Nominal values describe visual response only; never structural properties.
 * Hand-authored procedural maps, no unlicensed photos or network dependency.
 */
export const MATERIALS = Object.freeze({
 carton:{label:'牛皮瓦楞纸板',base:[181,142,94],roughness:.93,metalness:0,bump:.065,repeat:1},
 crate:{label:'出口实木木箱',base:[169,124,82],roughness:.79,metalness:0,bump:.30,repeat:1},
 board:{label:'实木板材',base:[190,153,110],roughness:.69,metalness:0,bump:.30,repeat:1},
 pallet:{label:'木制托盘',base:[152,122,88],roughness:.82,metalness:0,bump:.36,repeat:1},
 metal:{label:'喷涂集装箱钢板',base:[166,183,189],roughness:.43,metalness:.78,bump:.13,repeat:1},
 paper:{label:'标签纸及打包带',base:[237,232,217],roughness:.87,metalness:0,bump:.04,repeat:1},
 plastic:{label:'IBC HDPE 塑料',base:[222,225,215],roughness:.36,metalness:0,bump:.06,repeat:1},
 drum:{label:'桶装金属涂层',base:[65,98,115],roughness:.46,metalness:.32,bump:.025,repeat:1},
 jute:{label:'吨袋编织纤维',base:[201,192,165],roughness:.96,metalness:0,bump:.15,repeat:1},
 roll:{label:'纸卷纸浆表面',base:[212,200,172],roughness:.89,metalness:0,bump:.065,repeat:1},
 plastic_crate:{label:'注塑工业周转筐',base:[75,117,113],roughness:.43,metalness:0,bump:.09,repeat:1},
 sack:{label:'编织塑料包装袋',base:[205,191,156],roughness:.88,metalness:0,bump:.14,repeat:1},
 machine:{label:'机械设备喷漆钢板',base:[108,116,109],roughness:.46,metalness:.45,bump:.025,repeat:1},
 reel:{label:'木制电缆盘侧板',base:[174,134,88],roughness:.83,metalness:0,bump:.13,repeat:1},
 bundle:{label:'捆扎管材金属表面',base:[124,135,140],roughness:.39,metalness:.70,bump:.11,repeat:1},
 coolbox:{label:'保温塑料箱体',base:[222,227,216],roughness:.42,metalness:0,bump:.05,repeat:1},
 round_pack:{label:'圆筒牛皮包装',base:[191,159,119],roughness:.89,metalness:0,bump:.24,repeat:1},
 irregular:{label:'异形防护包装（外包络）',base:[165,147,130],roughness:.77,metalness:0,bump:.23,repeat:1}
});
// Render-only surface details do not add packaging categories or alter imported kind values.
const details=Object.freeze({
 containerPaint:{base:[67,102,120],roughness:.64,metalness:.22,bump:.045},
 zinc:{base:[176,184,188],roughness:.38,metalness:.82,bump:.025},
 rubber:{base:[38,43,45],roughness:.93,metalness:0,bump:.025},
 containerMark:{base:[230,232,222],roughness:.86,metalness:0,bump:0},
 shadow:{base:[44,48,53],roughness:1,metalness:0,bump:0},
 handlingMark:{base:[180,141,95],roughness:.93,metalness:0,bump:0},
 redPaint:{base:[174,45,38],roughness:.48,metalness:.08,bump:.01},
 tape:{base:[176,136,80],roughness:.54,metalness:0,bump:.015},
 strap:{base:[218,209,176],roughness:.82,metalness:0,bump:.07},
 shippingLabel:{base:[238,234,219],roughness:.88,metalness:0,bump:.005},
 crease:{base:[104,74,42],roughness:.95,metalness:0,bump:0},
 wrap:{base:[233,239,231],roughness:.29,metalness:0,bump:.008},
 cable:{base:[42,48,48],roughness:.57,metalness:.04,bump:.035},
 rollEnd:{base:[216,205,176],roughness:.92,metalness:0,bump:.025},
 corePaper:{base:[151,111,69],roughness:.91,metalness:0,bump:.06}
});
export function materialParameters(kind){return MATERIALS[kind]||details[kind]||MATERIALS.carton;}
export function validateMaterialParameters(spec){return spec&&[spec.roughness,spec.metalness,spec.bump].every(n=>Number.isFinite(n)&&n>=0&&n<=1)&&Array.isArray(spec.base)&&spec.base.length===3&&spec.base.every(n=>n>=0&&n<=255)}
/** Produces independent albedo/normal/roughness maps from a 2D texture canvas.
 * The normal is a subtle high-frequency surface relief, not a measured scan.
 */
export function surfaceMaps(canvas,kind){
 const spec=materialParameters(kind),width=canvas.width,height=canvas.height;
 const albedo=canvas.getContext('2d').getImageData(0,0,width,height);
 const norm=document.createElement('canvas'),rough=document.createElement('canvas');
 norm.width=rough.width=width;norm.height=rough.height=height;
 const nc=norm.getContext('2d'),rc=rough.getContext('2d'),ni=nc.createImageData(width,height),ri=rc.createImageData(width,height);
 const pixel=(x,y)=>{const at=(((y+height)%height)*width+((x+width)%width))*4;return (.2126*albedo.data[at]+.7152*albedo.data[at+1]+.0722*albedo.data[at+2])/255};
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const i=(y*width+x)*4,dx=pixel(x+1,y)-pixel(x-1,y),dy=pixel(x,y+1)-pixel(x,y-1);
  const bx=-dx*spec.bump*12,by=-dy*spec.bump*12,len=Math.hypot(bx,by,1);
  ni.data[i]=Math.round((bx/len*.5+.5)*255);ni.data[i+1]=Math.round((by/len*.5+.5)*255);
  ni.data[i+2]=Math.round((1/len*.5+.5)*255);ni.data[i+3]=255;
  const variation=(pixel(x,y)-.5)*.17;
  ri.data[i]=Math.round(Math.max(0.08,Math.min(.99,spec.roughness+variation))*255);ri.data[i+1]=ri.data[i+2]=ri.data[i];ri.data[i+3]=255;
 }
 nc.putImageData(ni,0,0);rc.putImageData(ri,0,0);
 return {normal:norm,roughness:rough};
}
