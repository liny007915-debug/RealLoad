import {HELP_TOPICS,searchHelp} from './help-topics.mjs';
const KEY = 'realload-onboarding-v119';
const lessons = [
  {title:'先给这份规划起个名字',text:'把货物、柜型、摆放和装卸顺序保存在同一份规划里。顶部名称可以随时修改，内容自动保存在当前浏览器。',tips:['点击顶部规划名称重命名。不同浏览器不会自动同步。','导出完整方案 JSON 可备份或转给同事；CSV 用于核对货物及坐标。','这是几何规划工具，实物尺寸和运输条件仍需现场核实。']},
  {title:'准备货物，先核对外尺寸',text:'从「货物」新建，或导入 CSV、Excel。每件记录包装后的最大外廓和单件毛重，整托必须包含托盘及缠膜。',tips:['内部统一使用 mm 和 kg，导入会经过字段映射、单位确认和错误预览。','数量是装载单元数。更改模板不会改变已装实物；新放入的一件采用新尺寸和毛重。PLAN 编号不能冒充实物标签。','七组场景含异形、门洞边界、绕行、轻重缓急、路径比较，以及整垛与自由草稿。可在计算设置对比平面绕行与抬升路线；全部是模拟货单。']},
  {title:'选择柜型，再安排位置',text:'在「箱体」输入实测内尺寸、门洞和载重，回车或点「保存尺寸」。草稿会保留；位置冲突时可用「按新尺寸重排已装货物」，失败保留原方案。',tips:['一键装柜会重新生成摆放，可以撤销。并非所有货物都能装入。','智能堆放需有完整平面支撑并允许堆码。软袋和异形设备默认不承托上层。','不规则货物按最大外廓保守占位，不利用凹口相互嵌套。']},
  {title:'边看场景，边调整货物',text:'进入自由摆放，直接拖动货物即可移动。画布上方切换自动落位与自由草稿，选择平面方向或 Z 高度；选中编辑也可输入坐标。',tips:['俯视拖 XY，正视拖 YZ，侧视拖 XZ。可选单轴约束，用六个方向按钮按毫米步长微调；每次都检查边界、碰撞和支撑。','右下角「箱体外观」可调整 0–100% 不透明度、打开柜门或剖面查看，内部尺寸仍以「箱体」资料为准。','手机默认滑动浏览，打开「触屏移动」后拖货物，再点一次恢复浏览。电脑拖空白处观察；F 适配整柜，Ctrl / ⌥ 加滚轮缩放。']},
  {title:'逐件预演，确认明确顺序',text:'选择「装入」或「卸出」，播放、暂停或单步前进。展开「装卸顺序与路径」可按编号回看；在「播放设置」中退回、重置和调速。',tips:['先清除阻挡，再按交付站次、同站紧急程度安排卸出。重量参与载重检查，不能代替搬运设备承载验证。每步完成后才进入下一件。','预演期间原方案只读。点击「退出预演」恢复完整布局后继续编辑。','智能绕行会计算横移、升降与先后清障；每段校验外廓。柜外暂存区按空旷区域假设，叉车、吊具与动态稳定性尚未验证。']},
  {title:'检查、备份，然后交付',text:'切换俯视、正视、侧视或四视图检查细节，核对实际箱号和所有异常，再导出方案及货物清单。',tips:['自动落位遇到冲突会说明原因并恢复位置。自由草稿可暂存悬空、重叠；点击「校验并应用」通过后才改变原方案。撤销 / 重做在场景上方。','全屏让三维画面铺满屏幕。底部可打开货物、编辑和预演，点「收起工具」专注查看，Esc 退出。','完成或跳过后默认不再出现。本教程随时可从「说明」重新打开。']}
];

export function setupOnboarding({state, rename, action, autoOpen=true}) {
  const el=id=>document.getElementById(id), dialog=el('guide-dialog');
  document.getElementById('app').append(dialog);
  let index=0,mode='quick',topic=HELP_TOPICS[0];
  const progress=el('guide-progress');
  const quickTopic=['project','cargo','container','free','playback','export'];
  const headLabel=document.createElement('strong');headLabel.textContent='使用指南';dialog.querySelector('.guide-head').prepend(headLabel);
  const tabs=document.createElement('div');tabs.className='guide-modes';tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','指南内容');
  tabs.innerHTML='<button id="guide-mode-quick" type="button" role="tab">快速入门</button><button id="guide-mode-library" type="button" role="tab">全部功能 <span>20</span></button>';
  progress.before(tabs);
  const library=document.createElement('div');library.className='guide-library';library.innerHTML='<label class="help-search"><svg><use href="#i-search"/></svg><input id="guide-search" type="search" placeholder="搜索功能、快捷键或问题" aria-label="搜索使用指南"></label><nav id="guide-topic-list" aria-label="功能目录"></nav><p id="guide-no-results" hidden>没有匹配的功能。试试“箱体”“清障”或“导出”。</p>';
  progress.after(library);
  progress.innerHTML=lessons.map((_,i)=>`<button type="button" data-lesson="${i}" aria-label="教程第 ${i+1} 步">${i+1}</button>`).join('');
  const coach=document.createElement('section');coach.id='feature-coach';coach.hidden=true;coach.setAttribute('aria-label','功能就地说明');coach.innerHTML='<strong id="coach-title"></strong><p id="coach-text"></p><div><button id="coach-back" type="button">返回指南</button><button id="coach-close" type="button">完成</button></div>';el('app').append(coach);
  let highlighted=null;
  function clearCoach(){coach.hidden=true;highlighted?.removeAttribute('data-help-highlight');highlighted=null;}
  el('coach-close').onclick=clearCoach;el('coach-back').onclick=()=>{clearCoach();render();if(!dialog.open)dialog.showModal();};
  function renderLibrary(){
    const rows=searchHelp(el('guide-search').value);let group='';
    const fragment=document.createDocumentFragment();
    for(const row of rows){if(row.group!==group){group=row.group;const title=document.createElement('strong');title.className='help-group';title.textContent=group;fragment.append(title);}
      const button=document.createElement('button');button.type='button';button.dataset.topic=row.id;button.textContent=row.title;button.classList.toggle('active',row.id===topic.id);button.setAttribute('aria-current',row.id===topic.id?'page':'false');fragment.append(button);
    }
    el('guide-topic-list').replaceChildren(fragment);el('guide-no-results').hidden=rows.length>0;
  }
  function render() {
    const lesson=mode==='quick'?lessons[index]:topic;
    dialog.classList.toggle('guide-library-mode',mode==='library');
    el('guide-mode-quick').setAttribute('aria-selected',String(mode==='quick'));el('guide-mode-library').setAttribute('aria-selected',String(mode==='library'));
    progress.hidden=mode!=='quick';library.hidden=mode!=='library';
    el('guide-eyebrow').textContent=mode==='quick'?`首次使用教程 · ${index+1} / ${lessons.length}`:topic.group;
    el('guide-heading').textContent=lesson.title;el('guide-description').textContent=lesson.text;
    el('guide-tips').replaceChildren(...lesson.tips.map(text=>{const row=document.createElement('div'),content=document.createElement('span');content.textContent=text;row.append(content);return row;}));
    for(const button of progress.children){const current=Number(button.dataset.lesson)===index;button.classList.toggle('active',current);button.setAttribute('aria-current',current?'step':'false');}
    el('guide-back').disabled=index===0;el('guide-back').hidden=mode!=='quick';el('guide-next').hidden=mode!=='quick';
    el('guide-next').textContent=index===lessons.length-1?'完成教程':'下一步';
    const linked=mode==='quick'?HELP_TOPICS.find(t=>t.id===quickTopic[index]):topic;
    el('guide-do').hidden=false;el('guide-do').textContent=linked.button;
    dialog.scrollTop=0;dialog.querySelector('.guide-content').scrollTop=0;
    if(mode==='library')renderLibrary();
  }
  function close() {
    try {localStorage.setItem(KEY,JSON.stringify({seen:!el('guide-repeat').checked,completed:mode==='quick'&&index===lessons.length-1}));} catch {}
    dialog.close();
  }
  function open(topicId=null) {
    clearCoach();index=0;mode=typeof topicId==='string'?'library':'quick';topic=HELP_TOPICS.find(t=>t.id===topicId)||HELP_TOPICS[0];
    el('guide-repeat').checked=false;el('guide-search').value='';render();if(!dialog.open)dialog.showModal();
  }
  el('help-btn').onclick=()=>open();el('guide-trigger').onclick=()=>open();
  el('guide-close').onclick=el('guide-skip').onclick=close;
  el('guide-back').onclick=()=>{index=Math.max(0,index-1);render();};
  el('guide-next').onclick=()=>{if(index===lessons.length-1)close();else{index++;render();}};
  el('guide-do').onclick=()=>{
    const linked=mode==='quick'?HELP_TOPICS.find(t=>t.id===quickTopic[index]):topic;
    close();action(linked.action);
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      const target=document.querySelector(linked.target);clearCoach();
      // Native dialogs already provide focused explanations, never layer a coach over one.
      if(document.querySelector('dialog[open]'))return;
      const visible=target&&target.getClientRects().length;
      if(visible){highlighted=target;target.setAttribute('data-help-highlight','true');target.scrollIntoView({block:'nearest',behavior:'instant'});}
      const parent=document.fullscreenElement||el('app');parent.append(coach);coach.hidden=false;el('coach-title').textContent=linked.title;el('coach-text').textContent=linked.summary+(visible?'':'。先在场景中选中一件货物，即可看到编辑工具。');
    }));
  };
  progress.onclick=e=>{const button=e.target.closest('[data-lesson]');if(button){index=Number(button.dataset.lesson);render();}};
  el('guide-mode-quick').onclick=()=>{mode='quick';render();};el('guide-mode-library').onclick=()=>{mode='library';render();};
  el('guide-search').oninput=renderLibrary;
  el('guide-topic-list').onclick=e=>{const button=e.target.closest('[data-topic]');if(button){topic=HELP_TOPICS.find(t=>t.id===button.dataset.topic);render();}};
  dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
  dialog.onclick=e=>{if(e.target===dialog)close();};

  const nameDialog=document.createElement('dialog');nameDialog.id='plan-dialog';nameDialog.className='plan-dialog';
  nameDialog.setAttribute('aria-labelledby','plan-dialog-title');
  nameDialog.innerHTML='<form id="plan-name-form"><h2 id="plan-dialog-title">规划名称</h2><p>给这份货物、柜型和装载方案一个容易辨认的名字。</p><label for="plan-name-input">名称<input id="plan-name-input" name="project" maxlength="100" required autocomplete="off" placeholder="例如：上海仓 · A客户 · 20GP 第一柜"></label><div class="plan-dialog-actions"><button id="plan-name-cancel" type="button">取消</button><button type="submit">保存名称</button></div></form>';
  document.getElementById('app').append(nameDialog);
  el('project-title').onclick=()=>{el('plan-name-input').value=state().project;nameDialog.showModal();el('plan-name-input').select();};
  el('plan-name-cancel').onclick=()=>nameDialog.close();
  el('plan-name-form').onsubmit=e=>{e.preventDefault();const input=el('plan-name-input'),name=input.value.trim();if(!name){input.setCustomValidity('请填写规划名称');input.reportValidity();return;}input.setCustomValidity('');rename(name);nameDialog.close();};
  el('plan-name-input').oninput=e=>e.target.setCustomValidity('');
  el('getting-started').hidden=true;
  let seen=false;try{seen=JSON.parse(localStorage.getItem(KEY)||'null')?.seen===true;}catch{}
  const openIfNeeded=()=>{if(!seen)open();};
  if(autoOpen)requestAnimationFrame(openIfNeeded);
  return {open,openIfNeeded};
}
