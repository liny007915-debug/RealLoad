import {prioritizeReady,priorityOrder,compareCargoPriority} from './priority.mjs';
/** UI-only unloading queue. Never changes the geometric verdict. */
export function rankUnloadChoices(rows=[]){
 const ordered=prioritizeReady(rows);const ids=new Map(ordered.map((r,i)=>[r.id,i]));return [...rows].sort((a,b)=>Number(b.ok)-Number(a.ok)||(a.ok?ids.get(a.id)-ids.get(b.id):compareCargoPriority(a.item,b.item))||
 (b.item?.x+b.item?.L)-(a.item?.x+a.item?.L)||String(a.id).localeCompare(String(b.id)));
}
export function filterUnloadChoices(rows=[],filter='all',query=''){
 const text=String(query).trim().toLowerCase();
 return rows.filter(r=>(filter==='ready'?r.ok:filter==='blocked'?!r.ok:filter==='urgent'?priorityOrder(r.item?.priority)<=1:true)&&
 (!text||[r.id,r.item?.unitCode,r.item?.skuId,r.item?.groupId,r.item?.name,r.item?.priority,...(r.blockers||[]).flatMap(b=>[b.id,b.reason])].some(v=>String(v||'').toLowerCase().includes(text))));
}
export function unloadChoiceExplanation(choice,box){
 if(!choice)return '当前没有可立即取出的货物；点击平面图检查阻挡。';
 if(choice.ok)return choice.route?.length?`已计算：${[...new Set(choice.segments.map(s=>s.action))].join(' → ')}。每段外廓已核对门洞与邻货；柜外暂存区按空旷区域假设，未验证叉车或吊具。`:`在当前门洞和净空假设下，可沿 X 正向直线通过柜门；货物位置 X ${choice.item.x} mm，尚未验证叉车或吊具。`;
 const blockers=choice.blockers||[];const first=blockers[0];
 return `${first?.reason||'当前路径被阻挡'}${blockers.length>1?`；另有 ${blockers.length-1} 项需核对`:''}。可用智能绕行规划清障顺序，或调整摆放后重算。`;
}
