/** RealLoad V1.12: nearest feasible drag point, not a physics engine.
 * Every candidate passes the existing full geometric validation.
 */
import {modifyPlacement} from './engine.mjs';
import {moveSelection} from './free-studio.mjs';
const norm=n=>Number.isFinite(n)?Number(n.toFixed(4)):0;
export function settleDrag(placements,id,target,box,skus,ids=[id]){
 const orig=placements.find(p=>p.id===id);if(!orig)return{ok:false,reason:'货物不存在'};
 if(orig.locked)return{ok:false,reason:'已锁定，请先解锁'};
 const selected=new Set(ids.includes(id)?ids:[id]),multi=selected.size>1;
 const dest={x:norm(target.x??orig.x),y:norm(target.y??orig.y),z:norm(target.z??orig.z)};
 const d={x:dest.x-orig.x,y:dest.y-orig.y,z:dest.z-orig.z};
 const attempts=[];
 const add=p=>{if(Object.values(p).every(Number.isFinite))attempts.push(p)};
 add(dest);
 // Prefer sliding along one wall/face instead of freezing the entire move.
 for(const a of ['x','y','z'])add({...orig,[a]:dest[a]});
 for(const a of ['x','y'])for(const b of ['x','y','z'])if(a!==b)add({...orig,[a]:dest[a],[b]:dest[b]});
 for(let k=15;k>=0;k--){const t=k/16;add({x:norm(orig.x+d.x*t),y:norm(orig.y+d.y*t),z:norm(orig.z+d.z*t)});}
 // Candidate slides around exposed faces, limited to the local drag area.
 const dim={x:'L',y:'W'};for(const other of placements){if(selected.has(other.id))continue;for(const axis of ['x','y']){if(Math.abs(d[axis])<0.01)continue;const face=[other[axis]+other[dim[axis]],other[axis]-orig[dim[axis]]];for(const v of face){if(Math.abs(v-dest[axis])<=Math.max(250,Math.abs(d[axis])*.5))add({...dest,[axis]:v});}}}
 let best=null,bestCost=Infinity,error='当前落点有碰撞或支撑不足';
 for(const pos of attempts){let result;if(multi){result=moveSelection(placements,[...selected],{x:pos.x-orig.x,y:pos.y-orig.y,z:pos.z-orig.z},box,skus)}else result=modifyPlacement(placements,id,pos,box,skus);
  if(!result.ok){error=result.reason||result.issues?.[0]?.text||error;continue;}
  const cost=Math.hypot(pos.x-dest.x,pos.y-dest.y,pos.z-dest.z);
  if(cost<bestCost-1e-7){bestCost=cost;best={ok:true,adjusted:cost>0.001,reason:cost>0.001?'已贴靠最近可行位置':null,placements:result.placements,position:pos};if(cost<.001)break;}
 }
 return best||{ok:false,reason:error};
}
