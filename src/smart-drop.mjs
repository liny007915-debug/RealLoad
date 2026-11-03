/** Automatic supported-height suggestion without ignoring packaging envelopes. */
import {dropCandidate,verifyDrop} from './free-studio.mjs';
export function suggestSupportedDrop(sku,placements,box,point,skus,{step=10,allowStack=false,orientation=0}={}){
 const base=dropCandidate(sku,placements,box,point,{step,orientation});if(!base.ok)return base;
 const floors=[0];if(allowStack){
   for(const p of placements){
    // Full, flat support: no corners hanging over, no top of a circular or soft cargo.
    if(['drum','roll','round_pack','reel','bundle','irregular','bag','sack'].includes(p.kind))continue;
    if(base.candidate.x>=p.x-1e-5&&base.candidate.y>=p.y-1e-5&&
       base.candidate.x+base.candidate.L<=p.x+p.L+1e-5&&
       base.candidate.y+base.candidate.W<=p.y+p.W+1e-5)floors.push(p.z+p.H);
   }
 }
 let reason='没有符合基础几何与支撑限制的落点';
 for(const z of [...new Set(floors)].sort((a,b)=>a-b)){
   const candidate={...base.candidate,z};
   const audit=verifyDrop(candidate,placements,box,skus);
   if(audit.ok)return {...audit,candidate,z,supported:z>0};
   reason=audit.reason;
 }
 return {ok:false,reason};
}
