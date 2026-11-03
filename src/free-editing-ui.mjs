import {checkDraft,supportedSelection} from './free-editing.mjs';
const escape=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');

export function setupFreeEditingUI({state,onMode,onSettings,onApply,onDiscard,onIssue,onStack}){
 const bar=document.createElement('div');bar.id='free-editbar';bar.hidden=true;
 bar.innerHTML=`<div class="free-move-modes" role="group" aria-label="自由摆放方式"><button type="button" id="free-auto-mode" aria-pressed="true">自动落位</button><button type="button" id="free-draft-mode" aria-pressed="false">自由草稿</button></div>
 <label class="free-edit-setting">拖动方向<select id="free-drag-axis" aria-label="自由摆放拖动方向"><option value="free">平面 XY</option><option value="x">X 箱长</option><option value="y">Y 箱宽</option><option value="z">Z 高度</option></select></label>
 <details id="free-drag-options" class="free-drag-options"><summary>移动设置</summary><div><label>拖动吸附<select id="free-drag-snap" aria-label="拖动吸附"><option value="0">连续移动</option><option value="1">1 mm</option><option value="10">10 mm</option><option value="25">25 mm</option><option value="50">50 mm</option></select></label><label><input type="checkbox" id="free-drag-magnet">贴近箱壁和货物时吸附</label><label id="free-link-label"><input type="checkbox" id="free-link-stack" checked>联动上方货物</label><button type="button" id="free-select-stack">选中整垛</button><p>拖动货物移动，空白处旋转。需要调整高度时选 Z，或拖 Z 手柄。微调步长与拖动吸附分别设置。</p></div></details>
 <span id="free-move-help"></span><div class="free-draft-actions" hidden id="free-draft-actions"><details id="free-draft-review"><summary id="free-draft-summary">草稿检查</summary><div class="free-issue-panel"><strong id="free-draft-result"></strong><p>草稿单独保存在本机；应用前，装卸与导出继续使用原方案。</p><ul id="free-draft-issues"></ul></div></details><button type="button" id="free-draft-apply">校验并应用</button><button type="button" id="free-draft-discard">恢复原方案</button></div>`;
 document.querySelector('.viewport-toolbar').append(bar);
 const $=id=>document.getElementById(id);
 $('free-auto-mode').onclick=()=>onMode('auto');$('free-draft-mode').onclick=()=>onMode('draft');
 for(const [id,key,checkbox] of [['free-drag-axis','editAxis'],['free-drag-snap','freeDragSnap'],['free-drag-magnet','freeMagnet',true],['free-link-stack','freeLinkStack',true]])$(id).onchange=e=>onSettings(key,checkbox?e.target.checked:key==='freeDragSnap'?Number(e.target.value):e.target.value);
 $('free-draft-apply').onclick=onApply;$('free-draft-discard').onclick=onDiscard;$('free-select-stack').onclick=onStack;
 $('free-draft-issues').onclick=e=>{const button=e.target.closest('[data-draft-id]');if(button){$('free-draft-review').open=false;onIssue(button.dataset.draftId);}};
 document.addEventListener('pointerdown',e=>{for(const id of ['free-drag-options','free-draft-review']){const d=$(id);if(d.open&&!d.contains(e.target))d.open=false;}});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'){for(const id of ['free-drag-options','free-draft-review'])$(id).open=false;}});
 function sync(){
  const s=state(),active=s.section==='free',draft=s.freeMoveMode==='draft';bar.hidden=!active;
  document.body.dataset.freeEditing=active?'true':'false';
  for(const mode of ['auto','draft'])$('free-'+mode+'-mode').setAttribute('aria-pressed',String(s.freeMoveMode===mode));
  $('free-drag-axis').value=s.editAxis;$('free-drag-axis').options[0].textContent=({side:'平面 XZ',door:'平面 YZ'}[s.mode]||'平面 XY');
  $('free-drag-snap').value=String(s.freeDragSnap);$('free-drag-magnet').checked=!!s.freeMagnet;$('free-link-stack').checked=!!s.freeLinkStack;$('free-link-label').hidden=draft;
  const chosen=s.freeSelection?.length?s.freeSelection:s.selected?[s.selected]:[],stack=supportedSelection(s.placements,chosen,s.skus);
  $('free-select-stack').disabled=!chosen.length;$('free-select-stack').textContent=stack.length>chosen.length?`选中整垛 · ${stack.length} 件`:'选中整垛';
  $('free-move-help').textContent=draft?'可暂时悬空、重叠，完成后统一校验':'直接拖动货物，自动落地或叠放';
  $('free-draft-actions').hidden=!draft;
  const check=checkDraft(s.placements,s.freeDraft,s.box,s.skus),changed=check.changed>0;
  $('free-draft-summary').textContent=!changed?'草稿尚未改动':check.valid?`${check.changed} 件待应用`:`${check.issues.length} 项待处理`;
  $('free-draft-review').dataset.valid=String(check.valid);$('free-draft-apply').disabled=!changed;$('free-draft-discard').disabled=!changed;
  $('free-draft-result').textContent=!changed?'拖动货物即可开始，自由草稿不会改写原方案':check.valid?'基础几何检查通过，可以应用草稿':`草稿有 ${check.issues.length} 项几何问题，点击定位后继续调整`;
  $('free-draft-issues').innerHTML=check.issues.slice(0,80).map(i=>`<li><button type="button" data-draft-id="${escape(i.id)}">${escape(i.text)}</button></li>`).join('');
  $('save-status').textContent=changed?'自由草稿已单独保存在本机':$('save-status').textContent;
 }
 return {sync,showIssues(){sync();$('free-draft-review').open=true;}};
}
