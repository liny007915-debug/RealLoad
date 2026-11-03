/** Independent geometric / input sanity audit. Units mm, kg, m³.
 * The precision of arithmetic is NOT the accuracy of the physical measurement.
 */
import {volume,validate} from './engine.mjs';
export function auditContainerSpec(box){
 const issues=[];
 if(!box||!['L','W','H','doorW','doorH','payload'].every(k=>Number.isFinite(box[k])&&box[k]>0))issues.push('箱体的内部长宽高、门宽高与有效载重必须是大于零的有限数值');
 else{
  if(box.doorW>box.W+1e-6)issues.push('柜门净宽不能大于箱体内部宽度；请核对尺寸和单位');
  if(box.doorH>box.H+1e-6)issues.push('柜门净高不能大于箱体内部高度；请核对尺寸和单位');
 }
 return {ok:issues.length===0,issues};
}
export function placementMargin(p,box){
 return {head:p.x,door:box.L-(p.x+p.L),left:p.y,right:box.W-(p.y+p.W),floor:p.z,roof:box.H-(p.z+p.H),doorWidth:box.doorW-p.W,doorHeight:box.doorH-p.H};
}
export function dimensionAudit(placements,box,skus){
 const specification=auditContainerSpec(box);
 if(!specification.ok)return {valid:false,issues:specification.issues,volumeM3:null,weightKg:null};
 const r=validate(placements,box,skus);
 const occupied=placements.reduce((sum,p)=>sum+volume(p),0);
 const mass=placements.reduce((sum,p)=>sum+p.weight,0);
 const margins=placements.map(p=>({id:p.id,...placementMargin(p,box)}));
 const min=(k)=>margins.length?Math.min(...margins.map(m=>m[k])):null;
 return {valid:r.valid,issues:r.issues.map(i=>i.text),volumeM3:occupied,containerM3:volume(box),utilization:occupied/volume(box)*100,weightKg:mass,payloadRemainingKg:box.payload-mass,closestWallMm:Math.min(...['head','door','left','right','floor','roof'].map(min).filter(Number.isFinite),Infinity),minimumDoorWidthMarginMm:min('doorWidth'),minimumDoorHeightMarginMm:min('doorHeight'),margins};
}
