/** Pure manual-loading operations. Positions use millimetres, all geometry is bounding-box conservative. */
import {inside,orientations,validate,intersects,doorFits} from './engine.mjs';
import {landOnFloor,snapNearFaces} from './placement-assist.mjs';
import {unitOrdinal,availableUnitId} from './unit-identity.mjs';
import {cargoSpecOf,snapshotPlacement} from './cargo-spec.mjs';
export const CARGO_TYPES=Object.freeze({
 carton:{label:'瓦楞纸外箱',unit:'外箱',shape:'rectangular',note:'胶带及瓦楞纸纹理为外观示意'},
 crate:{label:'木制出口箱',unit:'木箱',shape:'rectangular',note:'木条仅为外观示意，未计算抗压'},
 pallet:{label:'缠膜托盘货',unit:'整托',shape:'rectangular',note:'按整托外部尺寸和毛重计算'},
 board:{label:'木板 / 板材',unit:'件',shape:'rectangular',note:'按整体板材外包络计算'},
 ibc:{label:'IBC 液体周转箱',unit:'IBC',shape:'rectangular',note:'液体固定及动态载荷未验证'},
 drum:{label:'钢桶 / 塑料桶',unit:'桶',shape:'cylinder',note:'圆桶在直立且底面为正圆的情况下与其他正圆桶可按圆形碰撞检查，其他组合按外接矩形保守占位；不模拟动态碰撞和滚动'},
 bag:{label:'吨袋 / FIBC',unit:'袋',shape:'flexible',defaultStackLimit:1,supportsStack:false,note:'默认一层，按最大外廓占位；柔性顶部不能作为完整平面支撑，压缩变形、吊装与抗压未验证'},
 roll:{label:'纸卷 / 卷材',unit:'卷',shape:'cylinder',note:'滚动约束和防滚动固定未验证'},
 plastic_crate:{label:'塑料周转筐',unit:'筐',shape:'rectangular',note:'开放网格筐体的抗压、壁厚与堆码方式未校核'},
 sack:{label:'编织袋 / 袋装',unit:'袋',shape:'flexible',defaultStackLimit:1,supportsStack:false,note:'默认一层，软袋不能作为上方货物的完整平面支撑；按最大外廓占位，压缩变形、滑移与真实堆码稳定性未建模'},
 machine:{label:'机械设备 / 机箱',unit:'台',shape:'rectangular',note:'设备重心、吊点与固定点未校验；应使用运输包装总尺寸'},
 reel:{label:'电缆盘 / 木线盘',unit:'盘',shape:'cylinder-horizontal',note:'圆盘横卧，按矩形外包络计算；防滚、防转与绑扎未验证'},
 bundle:{label:'管材 / 钢管捆',unit:'捆',shape:'cylinder-horizontal',note:'捆扎、离散钢管滚动与局部受力均未验证'},
 coolbox:{label:'保温箱 / 冷链箱',unit:'箱',shape:'rectangular',note:'箱体保温能力和温控要求未验证；并非温度模拟'},
 round_pack:{label:'圆柱包装 / 圆筒',unit:'筒',shape:'cylinder',note:'只有直立、等直径圆柱间执行圆形占位检查；其他组合保守采用外接矩形'},
 irregular:{label:'异形货物 / 防护包装',unit:'件',shape:'irregular-envelope',defaultStackLimit:1,supportsStack:false,note:'默认一层，含底托和突出部位的最大长宽高包络全部占位；视觉凹口不能嵌套或作为平面支撑，不模拟压缩和任意角度堆放，必须实测外廓与重心'}
});
const precise=(n)=>Number(n.toFixed(4));
const snapTo=(v,step)=>precise(Math.round(v/step)*step);
const stepSize=step=>Number(step)>0?Number(step):10;
export function dropCandidate(sku,placements,box,point,{step=10,orientation=0}={}){
 if(!sku)return{ok:false,reason:'未指定货物'};
 const count=placements.filter(p=>p.skuId===sku.id).length;
 if(count>=sku.qty)return{ok:false,reason:`${sku.id} 已达到订单数量 ${sku.qty}`} ;
 if(!point||![point.x,point.y].every(Number.isFinite))return{ok:false,reason:'无法从当前视角确定地板坐标，请使用俯视或自由立体视图'};
 const o=orientations(sku)[orientation];if(!o)return{ok:false,reason:'不允许的旋转方向'};
 const landed=landOnFloor(point,o,box,{step:stepSize(step)});
 if(!landed)return{ok:false,reason:'落点超出箱体地板边界，或货物外尺寸大于箱体'};
 const {x,y}=snapNearFaces(landed,{...o,z:0},box,placements,{tolerance:Math.min(90,Math.max(20,stepSize(step)*2))});
 const used=new Set(placements.filter(p=>p.skuId===sku.id).map(unitOrdinal));
 let ordinal=1;while(used.has(ordinal))ordinal++;
 const candidate=snapshotPlacement({id:availableUnitId(sku.id,ordinal,placements),ordinal,skuId:sku.id,name:sku.name,kind:sku.kind,weight:sku.weight,stackLimit:sku.stackLimit,locked:false,x,y,z:0,...o,heading:o.L===sku.W&&o.W===sku.L&&o.H===sku.H&&sku.L!==sku.W?90:0},sku);
 if(!inside(candidate,box))return{ok:false,reason:'货物外廓超出柜体边界，请向内拖动',candidate};
 return{ok:true,candidate};
}
export function verifyDrop(candidate,placements,box,skus){
 if(!candidate)return{ok:false,reason:'放置数据为空'};
 const r=validate([...placements,candidate],box,skus);
 return r.valid?{ok:true,placements:[...placements,candidate]}:{ok:false,reason:r.issues[0]?.text||'与已有装载单元冲突',issues:r.issues};
}
export function moveSelection(placements,ids,delta,box,skus,{snap=0,draft=false}={}){
 const selected=new Set(ids);
 if(!selected.size)return{ok:false,reason:'请先选择货物'};
 const subset=placements.filter(p=>selected.has(p.id));
 if(subset.length!==selected.size)return{ok:false,reason:'选区包含不存在的箱件'};
 if(subset.some(p=>p.locked))return{ok:false,reason:'选区包含锁定货物'};
 if(!['x','y','z'].every(k=>Number.isFinite(delta[k]||0)))return{ok:false,reason:'位移必须为有限数值'};
 const changed=placements.map(p=>selected.has(p.id)?{...p,x:snap?snapTo(p.x+(delta.x||0),snap):precise(p.x+(delta.x||0)),y:snap?snapTo(p.y+(delta.y||0),snap):precise(p.y+(delta.y||0)),z:snap?snapTo(p.z+(delta.z||0),snap):precise(p.z+(delta.z||0))}:p);
 const r=validate(changed,box,skus);return r.valid||draft?{ok:true,placements:changed,draft,valid:r.valid,issues:r.issues}:{ok:false,reason:r.issues[0]?.text||'移动后不满足约束',issues:r.issues};
}
/** 90° exchanges envelope axes; 180° preserves size and rotates the marked face.
 * Continuous yaw is not allowed: actual free angle fitting requires collision solids.
 */
export function rotateSelection(placements,ids,box,skus,degrees=90,{draft=false}={}){
 if(![90,180].includes(degrees))return{ok:false,reason:'只支持水平 90° 或 180° 朝向'};
 const selected=new Set(ids);if(!selected.size)return{ok:false,reason:'请先选择货物'};
 const skuMap=new Map(skus.map(s=>[s.id,s]));
 if(placements.some(p=>selected.has(p.id)&&p.locked))return{ok:false,reason:'锁定的货物不能旋转'};
 if(placements.some(p=>selected.has(p.id)&&!cargoSpecOf(p,skuMap.get(p.skuId))?.rotate))return{ok:false,reason:'部分货物不允许水平旋转'};
 const changed=placements.map(p=>{
  if(!selected.has(p.id))return p;
  const heading=(Number(p.heading)||0);
  const nextHeading=(heading+degrees)%360;
  if(degrees===180)return {...p,heading:nextHeading};
  return {...p,L:p.W,W:p.L,x:p.x+(p.L-p.W)/2,y:p.y+(p.W-p.L)/2,heading:nextHeading};
 });
 const r=validate(changed,box,skus);
 return r.valid||draft?{ok:true,placements:changed,draft,valid:r.valid,issues:r.issues}:{ok:false,reason:r.issues[0]?.text||'旋转后不满足装载条件',issues:r.issues};
}
export function sameGroupIds(placements,skus,selectedId){
 const skuMap=new Map(skus.map(s=>[s.id,s]));const p=placements.find(p=>p.id===selectedId);if(!p)return[];
 const group=(skuMap.get(p.skuId)?.groupId||skuMap.get(p.skuId)?.orderNo||'未分组').trim();
 return placements.filter(p=>(skuMap.get(p.skuId)?.groupId||skuMap.get(p.skuId)?.orderNo||'未分组').trim()===group).map(p=>p.id);
}
/** Align the selected rectangular envelopes without altering height or relative orientation.
 * Unselected cargo is fixed; every operation validates the whole finished arrangement.
 */
export function alignSelection(placements,ids,axis,box,skus,{draft=false}={}){
 if(!['x','y'].includes(axis))return{ok:false,reason:'只支持沿箱长 X 或箱宽 Y 对齐'};
 const selected=new Set(ids),list=placements.filter(p=>selected.has(p.id));
 if(list.length<2||list.length!==selected.size)return{ok:false,reason:'至少选择两件有效货物'};
 if(list.some(p=>p.locked))return{ok:false,reason:'请先解锁选区中的货物'};
 const target=Math.min(...list.map(p=>p[axis]));
 const next=placements.map(p=>selected.has(p.id)?{...p,[axis]:target}:p);
 const audit=validate(next,box,skus);
 return audit.valid||draft?{ok:true,placements:next,draft,valid:audit.valid,issues:audit.issues}:{ok:false,reason:audit.issues[0]?.text||'对齐后发生冲突',issues:audit.issues};
}
/** Keep first and last cargo in place while distributing selected envelopes uniformly. */
export function distributeSelection(placements,ids,axis,box,skus,{draft=false}={}){
 if(!['x','y'].includes(axis))return{ok:false,reason:'只支持 X/Y 轴等间距排列'};
 const selected=new Set(ids),list=placements.filter(p=>selected.has(p.id)).sort((a,b)=>a[axis]-b[axis]);
 if(list.length<3||list.length!==selected.size)return{ok:false,reason:'等间距至少需要选择三件有效货物'};
 if(list.some(p=>p.locked))return{ok:false,reason:'请先解锁选区中的货物'};
 const dim=axis==='x'?'L':'W';const start=list[0][axis],end=list.at(-1)[axis]+list.at(-1)[dim];
 const gap=(end-start-list.reduce((s,p)=>s+p[dim],0))/(list.length-1);
 if(gap < -1e-6)return{ok:false,reason:'选区沿所选轴存在重叠，无法等间距排列'};
 let pos=start;const updates=new Map();for(const p of list){updates.set(p.id,pos);pos+=p[dim]+gap;}
 const next=placements.map(p=>updates.has(p.id)?{...p,[axis]:updates.get(p.id)}:p);
 const audit=validate(next,box,skus);
 return audit.valid||draft?{ok:true,placements:next,draft,valid:audit.valid,issues:audit.issues}:{ok:false,reason:audit.issues[0]?.text||'排列后发生冲突',issues:audit.issues};
}
/** Group moves to an exact container wall; preserve spacing and run full geometry validation. */
export function dockSelection(placements,ids,axis,side,box,skus,{draft=false}={}){
 if(!['x','y'].includes(axis)||!['min','max'].includes(side))return{ok:false,reason:'贴边方向不合法'};
 const selected=new Set(ids),items=placements.filter(p=>selected.has(p.id));
 if(!items.length||items.length!==selected.size)return{ok:false,reason:'请先选中有效货物'};
 if(items.some(p=>p.locked))return{ok:false,reason:'选区包含锁定货物，请先解锁'};
 const dimension=axis==='x'?'L':'W',limit=box[dimension];
 const delta=side==='min'?-Math.min(...items.map(p=>p[axis])):limit-Math.max(...items.map(p=>p[axis]+p[dimension]));
 return moveSelection(placements,ids,{[axis]:delta},box,skus,{draft});
}
