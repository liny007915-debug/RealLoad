import {differsFromTemplate} from './cargo-spec.mjs';
import {trainingScenarios as scenarios, getCargoScenario} from './cargo-scenarios.mjs';
import {CARGO_TYPES} from './free-studio.mjs';
import {unitNumber} from './manifest.mjs';
import {unitOrdinal} from './unit-identity.mjs';
import {deliveryLabel,normalizeDeliveryStop,priorityOrder} from './priority.mjs';

const escape = text => String(text ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const number = value => Number(value).toLocaleString('zh-CN', {maximumFractionDigits: 2});

/** Task-level controls share the application's validated geometry and undo history. */
export function setupExperience({state, paint, select, applyPosition, command, camera, loadScenario, undo, redo, history, preview, exitPreview, details}) {
  const byId = id => document.getElementById(id);
  document.body.classList.add('realload-workbench');
  const compact = matchMedia('(max-width:1040px)');
  const reduced = matchMedia('(prefers-reduced-motion:reduce)');
  const library = byId('library');
  const anchor = document.createComment('Cargo panel desktop position');
  library.before(anchor);
  const sheet = byId('library-sheet');
  // The native top layer keeps the panel modal while retaining workbench tokens.
  byId('app').append(sheet);
  byId('scenario-open').before(byId('v117-library-toggle'));
  document.querySelector('.workspace-title').append(document.querySelector('.experience-project-tools'));
  document.querySelector('.workflow-actions').append(byId('workflow-exit'));
  byId('stage').append(byId('container-reference'));
  byId('context-position-form').after(byId('context-service'),document.querySelector('.context-actions'));
  const playbackSettings=document.createElement('details');
  playbackSettings.className='workflow-settings';
  playbackSettings.innerHTML='<summary>播放设置<svg><use href="#i-chevr"/></svg></summary><div class="workflow-settings-panel"></div>';
  byId('workflow-next').after(playbackSettings);
  const playbackPanel=playbackSettings.querySelector('.workflow-settings-panel');
  playbackPanel.append(byId('workflow-back'),byId('workflow-reset'),byId('workflow-speed').closest('label'));
  document.addEventListener('pointerdown',event=>{if(playbackSettings.open&&!playbackSettings.contains(event.target))playbackSettings.open=false;});
  document.addEventListener('keydown',event=>{if(event.key==='Escape')playbackSettings.open=false;});
  playbackSettings.addEventListener('click',event=>{if(event.target.closest('button'))playbackSettings.open=false;});
  byId('workflow-exit').textContent='退出预演';
  byId('workflow-exit').title='退出预演，恢复完整原方案后继续编辑';
  const returnButton = document.createElement('button');
  returnButton.type = 'button';
  returnButton.id = 'library-return-scene';
  returnButton.className = 'library-return-scene';
  returnButton.textContent = '返回场景';
  library.append(returnButton);
  let selectedKey = '', previewActive = false, movingPanel = false;

  function feedback(text, error = false) {
    const node = byId('context-feedback');
    node.textContent = text;
    node.classList.toggle('error', error);
  }

  function closePanel({reveal = false} = {}) {
    state().collapsed = true;
    if (sheet.open) sheet.close();
    if (document.body.classList.contains('experience-panel-open')) document.body.classList.remove('experience-panel-open');
    paint(false);
    if (reveal && matchMedia('(max-width:759px)').matches) requestAnimationFrame(() => {
      const target=byId('stage'),behavior=reduced.matches?'instant':'smooth';
      if(state().selected){
        // Keep the lower part of the scene and the beginning of the editor in
        // view together, regardless of how tall its optional controls become.
        const top=window.scrollY+target.getBoundingClientRect().bottom-Math.min(230,innerHeight*.4);
        window.scrollTo({top:Math.max(0,top),behavior});
      }else target.scrollIntoView({block:'nearest',behavior});
    });
  }

  function adaptPanel() {
    if (movingPanel) return;
    movingPanel = true;
    if (compact.matches || document.body.classList.contains('v112-fullscreen')) {
      if (library.parentElement !== sheet) sheet.append(library);
      if (!state().collapsed && !sheet.open) sheet.showModal();
      if (state().collapsed && sheet.open) sheet.close();
      if (document.body.classList.contains('experience-panel-open') !== sheet.open) document.body.classList.toggle('experience-panel-open', sheet.open);
    } else {
      if (sheet.open) sheet.close();
      if (library.parentElement === sheet) anchor.after(library);
      if (document.body.classList.contains('experience-panel-open')) document.body.classList.remove('experience-panel-open');
    }
    movingPanel = false;
  }
  sheet.addEventListener('cancel', event => {event.preventDefault(); closePanel();});
  sheet.addEventListener('click', event => {if (event.target === sheet) closePanel();});
  returnButton.onclick = () => closePanel({reveal:true});
  byId('hide-sidebar').addEventListener('click', () => {if (sheet.open) closePanel();});
  compact.addEventListener('change', () => {state().collapsed = compact.matches; paint(false);});
  // Opening from a rail tab should not scroll the page behind the modal.
  const panelMutation = new MutationObserver(adaptPanel);
  panelMutation.observe(document.body, {attributes:true, attributeFilter:['class']});

  function showContext() {
    if (preview()) exitPreview();
    if (compact.matches) closePanel();
    if (!state().selected) {
      feedback('先在场景或货物清单选择一件箱件。');
      return;
    }
    requestAnimationFrame(() => {
      byId('context-editor').scrollIntoView({block:'nearest', behavior:reduced.matches?'instant':'smooth'});
      byId('context-editor').focus({preventScroll:true});
    });
  }
  function chooseInstance(direction) {
    const s = state(), current = s.placements.find(p => p.id === s.selected);
    if (!current) return;
    const peers = s.placements.filter(p => p.skuId === current.skuId);
    const index = peers.findIndex(p => p.id === current.id);
    const next = peers[index + direction];
    if (next) {select(next.id);}
  }
  byId('context-prev').onclick = () => chooseInstance(-1);
  byId('context-next').onclick = () => chooseInstance(1);
  byId('context-close').onclick = () => {state().selected=null; state().freeSelection=[]; paint(false);};
  byId('context-focus').onclick = () => camera('focus');
  byId('context-details').onclick = details;
  for (const [id, action] of [['context-rotate','rotate'], ['context-lock','lock'], ['context-remove','remove']]) {
    byId(id).onclick = () => {feedback(''); command(action);};
  }
  byId('context-position-form').onsubmit = event => {
    event.preventDefault();
    const s = state(), p = s.placements.find(p => p.id === s.selected);
    if (!p || preview()) return;
    const values = Object.fromEntries(['x','y','z'].map(axis => [axis, Number(byId('context-'+axis).value)]));
    const result = applyPosition(p.id, values);
    const error = !result?.ok;
    for (const axis of ['x','y','z']) byId('context-'+axis).setAttribute('aria-invalid', String(error));
    feedback(error ? result?.reason || result?.issues?.[0]?.text || '位置未保存，请核对边界、碰撞与底部支撑。' : result?.draft?'位置已记入自由草稿，尚未应用到原方案。':'位置已保存。可以继续调整，或用撤销恢复。', error);
  };
  byId('context-revert').onclick = () => {selectedKey=''; sync(); feedback('已恢复到当前方案坐标。');};
  byId('history-undo').onclick = undo;
  byId('history-redo').onclick = redo;
  byId('scene-zoom-out').onclick = () => camera('zoomOut');
  byId('scene-zoom-in').onclick = () => camera('zoomIn');
  byId('scene-zoom-home').onclick = () => byId('fit-view').click();

  const appearance = byId('viewport-appearance-panel');
  appearance.open = false;
  document.addEventListener('pointerdown', event => {if (appearance.open && !appearance.contains(event.target)) appearance.open=false;});
  document.addEventListener('keydown', event => {if (event.key==='Escape') appearance.open=false;});
  // A type card chooses an actual instance. Return to it instead of leaving the user below the scene.
  for (const id of ['sku-list','free-loaded-list','free-palette']) byId(id).addEventListener('click', event => {
    if (event.target.closest('[data-action="edit"],[data-group-toggle],[data-group-action],[data-loaded-more]')) return;
    if (!state().selected || !event.target.closest('[data-id],[data-loaded-id],[data-free-add]')) return;
    if (compact.matches) closePanel({reveal:true});
  });
  byId('selection-to-edit').onclick = showContext;
  byId('workflow-route-mode').onchange=event=>{byId('unload-door-mode').value=event.target.value;byId('unload-door-mode').dispatchEvent(new Event('change',{bubbles:true}));};
  byId('container-settings-shortcut').onclick=()=>document.querySelector('.rail-item[data-section="container"]').click();

  const scenarioDialog = byId('scenario-dialog');
  byId('scenario-choices').innerHTML = scenarios.map((scenario,index) => `<label class="scenario-choice"><input type="radio" name="scenario" value="${escape(scenario.id)}" ${index===0?'checked':''}><span><strong>${escape(scenario.title)}</strong><small>${escape(scenario.description)}</small></span><span class="scenario-unit-count">${scenario.placements.length} 件</span></label>`).join('');
  function renderScenario() {
    const id = byId('scenario-form').querySelector('[name=scenario]:checked')?.value;
    const scenario = getCargoScenario(id);
    const total=scenario.skus.reduce((sum,item)=>sum+item.qty*item.weight,0),urgent=scenario.skus.filter(item=>priorityOrder(item.priority)<=1).reduce((sum,item)=>sum+item.qty,0),stops=new Set(scenario.skus.map(item=>normalizeDeliveryStop(item.deliveryStop)).filter(Boolean));
    byId('scenario-preview').innerHTML = `<strong>${scenario.placements.length} 件 · ${number(total)} kg · ${scenario.container.label}</strong><p class="scenario-description">${escape(scenario.description)}</p><p>${scenario.skus.length} 种货物${urgent?` · 紧急或优先 ${urgent} 件`:''}${stops.size?` · ${stops.size} 个交付站次`:''}。以下数据均为模拟值。</p><div class="scenario-manifest-scroll" tabindex="0" role="region" aria-label="模拟货单详情"><table class="scenario-manifest"><thead><tr><th scope="col">货物</th><th scope="col">单件 kg</th><th scope="col">件数</th><th scope="col">交付安排</th></tr></thead><tbody>${scenario.skus.map(item=>`<tr><th scope="row">${escape(item.name.replace('（模拟，非厂家规格）',''))}</th><td>${number(item.weight)}</td><td>${item.qty}</td><td>${escape(deliveryLabel(item))}</td></tr>`).join('')}</tbody></table></div><details class="scenario-notes"><summary>样本来源与计算边界</summary><small>${escape(scenario.source)} ${scenario.notes.map(escape).join(' ')}</small></details>`;
  }
  byId('scenario-open').onclick = () => {renderScenario(); scenarioDialog.showModal();};
  byId('scenario-choices').onchange = () => {renderScenario();if(matchMedia('(max-width:759px)').matches)requestAnimationFrame(()=>byId('scenario-preview').scrollIntoView({block:'nearest',behavior:reduced.matches?'instant':'smooth'}));};
  byId('scenario-close').onclick = byId('scenario-cancel').onclick = () => scenarioDialog.close();
  byId('scenario-form').onsubmit = event => {
    event.preventDefault();
    const id = byId('scenario-form').querySelector('[name=scenario]:checked')?.value;
    scenarioDialog.close();
    loadScenario(getCargoScenario(id));
    requestAnimationFrame(() => byId('stage').scrollIntoView({block:'nearest', behavior:reduced.matches?'instant':'smooth'}));
  };

  function syncPlayback(active) {
    if (active === previewActive) return;
    previewActive = active;
    updateDisabled();
  }
  function updateDisabled() {
    const p = state().placements.find(p => p.id === state().selected);
    const locked = !p || !!p.locked || previewActive;
    for (const id of ['context-rotate','context-remove','context-apply','context-revert','context-x','context-y','context-z','context-move-step','context-drag-plane']) byId(id).disabled=locked;
    for(const button of document.querySelectorAll('[data-context-nudge]'))button.disabled=locked;
    byId('context-lock').disabled=!p || previewActive;
    byId('context-position-form').classList.toggle('read-only', locked);
    if (previewActive && p) feedback('正在查看装卸预演。先退出预演，再修改原方案。');
  }
  function sync() {
    adaptPanel();
    const s = state(), p = s.placements.find(p => p.id === s.selected);
    byId('container-reference-name').textContent=s.box.id==='CUSTOM'?'自定义箱体':s.box.id;
    byId('container-reference-size').textContent=`内尺寸 ${number(s.box.L)} × ${number(s.box.W)} × ${number(s.box.H)} mm`;
    byId('container-reference-door').textContent=`柜门 ${number(s.box.doorW)} × ${number(s.box.doorH)} mm`;
    byId('context-editor').classList.toggle('hidden', !p||s.section==='container');
    byId('workflow-sequence-total').textContent=s.placements.length+' 件';
    byId('history-undo').disabled=!history().undo;
    byId('history-redo').disabled=!history().redo;
    byId('interaction-instruction').textContent=s.pointerTool==='orbit'?'观察模式 · 拖动画布旋转，切换选择后编辑':s.touchMove?'触屏移动中 · 拖货物调整，再点触屏移动恢复滚动':({top:'拖货物调整 X / Y · 空白处观察',side:'拖货物调整 X / Z · 宽度保持不变',door:'拖货物调整 Y / Z · 深度保持不变'}[s.mode]||'拖货物平移 · 空白处旋转 · XYZ 手柄可精调');
    byId('scenario-current').textContent=s.scenarioTitle || '当前货物方案';
    byId('project-title').firstChild.textContent=s.project+' ';
    byId('project-title').title=s.project+' · 点击重命名';
    byId('scenario-note').classList.toggle('hidden', !s.scenarioTitle);
    byId('scenario-note').textContent=s.scenarioTitle ? '模拟测试场景 · '+s.scenarioDescription+' · 最大外廓用于装载计算' : '';
    if (!p) {selectedKey=''; return;}
    const sku = s.skus.find(sku=>sku.id===p.skuId), peers=s.placements.filter(row=>row.skuId===p.skuId), index=peers.findIndex(row=>row.id===p.id);
    const ordinal=unitOrdinal(p);
    const code=sku?unitNumber(sku,ordinal):p.id;
    byId('context-name').textContent=p.name;
    byId('context-name').title=p.name;
    byId('context-code').textContent=code;
    byId('context-code').title=code;
    byId('context-service').textContent=`${number(p.weight)} kg · ${deliveryLabel(sku||p)}`;
    byId('context-editor').dataset.selectedId=p.id;
    for(const axis of ['x','y','z']){if(s.section==='free'&&s.freeMoveMode==='draft')byId('context-'+axis).removeAttribute('min');else byId('context-'+axis).min='0';}
    byId('context-instance').textContent=`同类 ${index+1} / ${peers.length}`;
    byId('context-prev').disabled=index<=0;
    byId('context-next').disabled=index>=peers.length-1;
    byId('context-lock').querySelector('span').textContent=p.locked?'解锁':'锁定';
    byId('context-lock').setAttribute('aria-pressed',String(!!p.locked));
    const key=[p.id,p.x,p.y,p.z,p.locked].join('/');
    if (key!==selectedKey) {
      selectedKey=key;
      for (const axis of ['x','y','z']) {byId('context-'+axis).value=p[axis]; byId('context-'+axis).removeAttribute('aria-invalid');}
      feedback(p.locked?'位置已锁定，解锁后可修改。':s.section==='free'&&s.freeMoveMode==='draft'?'自由草稿可暂时悬空或重叠；完成后点击「校验并应用」。':'拖动货物或修改坐标；通过几何检查后保存。');
    }
    byId('context-envelope').textContent=`${CARGO_TYPES[p.kind]?.label||'货物'} · 外廓 ${number(p.L)} × ${number(p.W)} × ${number(p.H)} mm · ${number(p.weight)} kg${differsFromTemplate(p,s.skus.find(a=>a.id===p.skuId))?' · 单件规格已保留，与待装模板不同':''}${['irregular','bag','sack','reel','bundle'].includes(p.kind)?' · 保守包络占位，不可利用外形凹口嵌套':''}`;
    previewActive=!!preview();
    updateDisabled();
  }
  sync();
  return {sync, syncPlayback, showContext, closePanel, feedback};
}
