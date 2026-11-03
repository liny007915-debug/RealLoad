/** Delivery urgency is a PLANNING PREFERENCE, never a waiver of geometry or handling constraints. */
export const PRIORITIES=Object.freeze({urgent:{order:0,label:'紧急 · 先卸'},high:{order:1,label:'优先'},normal:{order:2,label:'普通'},low:{order:3,label:'可后卸'}});
export function normalizePriority(value){const v=String(value??'').trim().toLowerCase();return ({'紧急 · 先卸':'urgent',紧急:'urgent',急件:'urgent',特急:'urgent',加急:'urgent',urgent:'urgent',p0:'urgent',最高:'urgent',优先:'high',较急:'high',high:'high',p1:'high',普通:'normal',一般:'normal',normal:'normal',p2:'normal',非紧急:'normal',可后卸:'low',低:'low',low:'low',p3:'low','':'normal'})[v]??null;}
export function priorityOrder(value){return PRIORITIES[normalizePriority(value)||'normal'].order;}
export function priorityLabel(value){return PRIORITIES[normalizePriority(value)||'normal'].label;}
export function normalizeDeliveryStop(value){if(value===undefined||value===null||String(value).trim()==='')return null;const n=Number(value);return Number.isInteger(n)&&n>0&&n<=999?n:null;}
/** Declared delivery stops take precedence; urgency orders cargo within a stop.
 * Old plans with no declared stop keep their existing urgency behavior. */
export function compareCargoPriority(a={},b={}){
 const x=normalizeDeliveryStop(a.deliveryStop)??Infinity,y=normalizeDeliveryStop(b.deliveryStop)??Infinity;
 return (x===y?0:x<y?-1:1)||priorityOrder(a.priority)-priorityOrder(b.priority);
}
export function deliveryLabel(item={}){const stop=normalizeDeliveryStop(item.deliveryStop);return (stop?`第 ${stop} 站 · `:'')+priorityLabel(item.priority);}
/** For ready items only. Other high-urgency items may be blocked; prefer removing
 * their *verified* blockers before moving unrelated ordinary freight. */
export function clearanceDependencies(choices){
 const rows=new Map(choices.map(c=>[c.id,c])),result=new Map(choices.map(c=>[c.id,[]]));
 // Propagate the goal through the complete blocker chain, including stacked
 // support dependencies. Cycles never grant permission to remove a blocked item.
 for(const goal of choices.filter(c=>!c.ok)){
  const pending=(goal.blockers||[]).map(b=>b.id),seen=new Set([goal.id]);
  while(pending.length){const id=pending.shift();if(seen.has(id))continue;seen.add(id);const row=rows.get(id);if(!row)continue;result.get(id).push(goal);if(!row.ok)pending.push(...(row.blockers||[]).map(b=>b.id));}
 }
 return result;
}
export function prioritizeReady(choices,{targetId=null}={}){
 const dependencies=clearanceDependencies(choices),dependents=c=>dependencies.get(c.id)||[];
 const effective=c=>[c.item,...dependents(c).map(goal=>goal.item)].sort(compareCargoPriority)[0];
 const helpsTarget=c=>c.id===targetId||dependents(c).some(goal=>goal.id===targetId);
 const unlock=c=>dependents(c).reduce((sum,goal)=>sum+(priorityOrder(goal.item.priority)===0?3:1),0);
 return choices.filter(c=>c.ok).sort((a,b)=>(targetId?Number(helpsTarget(b))-Number(helpsTarget(a)):0)||compareCargoPriority(effective(a),effective(b))||compareCargoPriority(a.item,b.item)||unlock(b)-unlock(a)||
 (a.path?.cost??Infinity)-(b.path?.cost??Infinity)||(b.item.x+b.item.L)-(a.item.x+a.item.L)||b.item.z-a.item.z||a.id.localeCompare(b.id));
}
export function priorityIssues(choices){return choices.filter(c=>!c.ok&&priorityOrder(c.item?.priority)<=1).map(c=>({id:c.id,priority:normalizePriority(c.item.priority),reason:(c.blockers||[]).map(b=>b.reason).join('；')||'当前不可卸',blockers:(c.blockers||[]).map(b=>b.id)}));}
