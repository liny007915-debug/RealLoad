import {validate} from './engine.mjs';
import {createPlayback, motionPosition} from './playback.mjs';
import {suggestLoadOrder, suggestUnloadOrder, unloadOne} from './unloading.mjs';
import {deliveryLabel} from './priority.mjs';
import {positionOnRoute} from './maneuver-planner.mjs';

const byId = id => document.getElementById(id);
const escape = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

/** UI adapter. Playback changes a preview only; the packing plan stays intact. */
export function setupWorkbench({state, paint, draw, notify, fit, addOne, auto}) {
  let queue = [], baseRemoved = [], mode = state().section === 'unload' ? state().unloadFlow : 'load', speed = 1, version = null, unresolved = [];
  let renderKey = '', activeKey = '', applying = false, displayedMotionId = null, routes={}, routeDetails={};
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const duration = () => reducedMotion.matches ? 32 : 1100 / speed;
  const options = () => ({doorMode: state().unloadDoorMode, clearance: state().unloadClearance, policy:state().routePolicy,maxLift:state().maxLift});
  const controller = createPlayback({
    onFrame(frame) {if(frame.status==='running')displayedMotionId=frame.id;syncFrame(frame); draw();},
    onCommit({index}) {
      displayedMotionId = null;
      const s = state();
      if (mode === 'unload') s.unloadRemoved = [...baseRemoved, ...queue.slice(0, index)];
      else s.step = index;
      applying = true;
      paint(false);
      applying = false;
    },
    onState(frame) {if(frame.status==='running')displayedMotionId=frame.id;else if(frame.status==='idle'||frame.status==='complete')displayedMotionId=null;syncFrame(frame); renderControls(frame); draw();}
  });

  function syncFrame(frame) {
    const stage = byId('stage');
    stage.dataset.playbackState = frame.status;
    stage.dataset.playbackMode = mode;
    stage.dataset.playbackIndex = frame.index;
    stage.dataset.motionId = frame.status === 'running' || displayedMotionId === frame.id ? frame.id || '' : '';
    stage.dataset.motionProgress = frame.progress.toFixed(4);
    const total = queue.length;
    const fraction = total ? (frame.index + frame.progress) / total : 0;
    byId('workflow-progress').value = fraction;
    byId('workflow-count').textContent = `${frame.index} / ${total || state().placements.length} 件`;
    byId('step-range').value = frame.index;
    byId('step-count').textContent = `${frame.index} / ${total || state().placements.length}`;
  }

  function renderControls(frame = controller.state) {
    const s = state(), running = frame.status === 'running', paused = frame.status === 'paused';
    const status = byId('workflow-status');
    const item = s.placements.find(p => p.id === frame.id);
    const action = mode === 'load' ? '装入' : '卸出';
    byId('workflow-play').textContent = running ? '暂停' : paused ? '继续播放' : frame.status === 'complete' ? '重新播放' : '播放装卸过程';
    byId('workflow-play').setAttribute('aria-pressed', String(running));
    byId('workflow-play').disabled = !s.placements.length;
    byId('workflow-next').disabled = running || !s.placements.length || frame.status === 'complete';
    byId('workflow-back').disabled = running || !(frame.index || s.unloadRemoved.length);
    byId('workflow-reset').disabled = !s.placements.length;
    byId('step-back').disabled = running || !frame.index;
    byId('step-forward').disabled = running || !s.placements.length || frame.status === 'complete';
    byId('step-play').textContent = running ? 'Ⅱ' : '▶';
    byId('step-play').setAttribute('aria-label', running ? '暂停装卸播放' : '播放装卸过程');
    byId('step-range').disabled = running || frame.status === 'idle';
    byId('step-range').max = Math.max(1, queue.length);
    const key = `${frame.status}/${frame.index}/${mode}/${item?.id}/${s.placements.length}`;
    if (activeKey !== key) {
      status.textContent = !s.placements.length ? '先放入货物或一键装柜，再查看装卸过程。'
        : frame.status === 'idle' ? `方案已装 ${s.placements.length} 件 · 预演尚未开始。播放不会改变原方案。`
        : frame.status === 'complete' ? `已完成 ${queue.length} 件${action}预演${mode === 'unload' && unresolved.length > 0 ? '；其余货物受阻，请检查路径' : ''}。`
        : `第 ${frame.index + 1} 步 · ${action} ${item?.unitCode || frame.id || ''}${routeDetails[frame.id]?.length>1?' · '+[...new Set(routeDetails[frame.id].map(s=>s.action))].join(' → '):''}${paused ? ' · 已暂停' : ''}`;
      activeKey = key;
      for (const button of byId('workflow-steps').querySelectorAll('[data-playback-index]')) {
        const index = Number(button.dataset.playbackIndex);
        button.classList.toggle('completed', index < frame.index);
        button.classList.toggle('active', index === frame.index && frame.status !== 'idle');
        if (index === frame.index && frame.status !== 'idle') {
          button.setAttribute('aria-current', 'step');
          if (frame.status === 'running') {
            const list = byId('workflow-steps'), left = button.offsetLeft - list.offsetLeft;
            if (left < list.scrollLeft || left + button.offsetWidth > list.scrollLeft + list.clientWidth) {
              list.scrollTo({left: Math.max(0, left - list.clientWidth / 2 + button.offsetWidth / 2), behavior: reducedMotion.matches ? 'instant' : 'smooth'});
            }
          }
        }
        else button.removeAttribute('aria-current');
      }
    }
    document.querySelectorAll('button[data-playback-mode]').forEach(button => {
      const selected = button.dataset.playbackMode === mode;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    byId('workflow-exit').classList.toggle('hidden', frame.status === 'idle');
    // Legacy per-item actions share the same animation clock.
    document.querySelectorAll('[data-unload-take], #unload-next-auto, #unload-hud-take, [data-v114-action="take"]').forEach(button => {
      if (running) {if (!button.disabled) button.dataset.motionDisabled = 'true'; button.disabled = true;}
      else if (button.dataset.motionDisabled) {button.disabled = false; delete button.dataset.motionDisabled;}
    });
  }

  function renderSteps() {
    const s = state();
    const result = mode === 'load' ? suggestLoadOrder(s.placements, s.box, options()) : suggestUnloadOrder(s.placements, s.box, s.unloadRemoved, options());
    if(byId('planner-verdict')){
      byId('planner-verdict').textContent=!s.placements.length?'放入货物后自动计算':`${result.order.length} / ${s.placements.length-s.unloadRemoved.length} 件已找到${mode==='load'?'装入':'卸出'}路径${result.unresolved.length?` · ${result.unresolved.length} 件待处理`:''}`;
      const m=result.metrics||{},fmt=n=>(Number(n||0)/1000).toLocaleString('zh-CN',{maximumFractionDigits:2});
      byId('planner-metrics').innerHTML=s.unloadDoorMode==='smart'?`<div><dt>总移动距离</dt><dd>${fmt(m.distanceMm)} m</dd></div><div><dt>累计抬升</dt><dd>${fmt(m.liftMm)} m</dd></div><div><dt>最大单件抬升</dt><dd>${Number(m.peakLiftMm||0).toLocaleString('zh-CN')} mm</dd></div><div><dt>清障步骤</dt><dd>${m.clearanceSteps||0} 步</dd></div>`:'<p>严格直线仅检查固定 Y / Z 的门洞通道，不比较绕行路线。</p>';
    }
    const ids = controller.state.status === 'idle' ? result.order : queue;
    const rows = new Map(s.placements.map(p => [p.id, p]));
    byId('workflow-steps').innerHTML = ids.map((id, index) => {
      const p = rows.get(id);
      const segments=(controller.state.status==='idle'?result.routeDetails:routeDetails)?.[id];
      const pathLabel=segments?.some(s=>s.axis!=='x')?[...new Set(segments.map(s=>s.action))].join(' → '):'直线通过柜门';
      const decision=mode==='unload'?result.decisions?.[id]?.reason:'反向使用已验证的卸出路径';
      return `<button type="button" class="workflow-step" data-playback-index="${index}" data-playback-id="${escape(id)}" title="查看第 ${index + 1} 步${mode === 'load' ? '装入后' : '卸出前'}：${escape(p?.unitCode || id)}；${escape(pathLabel)}"><b>${index + 1}</b><span><span class="workflow-step-code">${escape(p?.unitCode || id)}</span><small>${escape(p?.name || '')}<em class="workflow-cargo-service">${Number(p?.weight||0).toLocaleString('zh-CN')} kg · ${escape(deliveryLabel(p))}</em>${escape(pathLabel)}<span class="workflow-step-reason">${escape(decision||'按当前可行顺序安排')}</span></small></span></button>`;
    }).join('') || '<p class="workflow-empty">放入货物后，在这里查看逐件顺序。</p>';
    byId('workflow-model-note').textContent = result.unresolved.length
      ? `${result.unresolved.length} 件尚未找到通行路径。装入须全部通过；卸出可先清障后重算。固定朝向，不尝试倾斜或拆包。`
      : s.unloadDoorMode==='smart'?'自动计算横移、升降与先后清障，每段校验扫掠外廓和门洞。先清障，再按交付站次和紧急程度卸货；重量用于载重检查。柜外暂存区按空旷区域假设；搬运设备、承载能力与稳定性尚未验证。':'固定 Y/Z 坐标通过柜门；仅作直线几何预演，未验证叉车、吊具与动态稳定性。';
    activeKey = '';
  }

  function configure({autoplay = false, index = 0, onlyId = null, targetId = null} = {}) {
    const s = state();
    if (!s.placements.length) {notify('先放入一件货物，或点击一键装柜。'); return false;}
    const geometry=validate(s.placements,s.box,s.skus);
    if(!geometry.valid){notify('当前装载位置不符合基础几何约束：'+(geometry.issues[0]?.text||'请先检查装载报告'));return false;}
    if (!['strict','smart'].includes(s.unloadDoorMode)) {notify('当前为宽松门洞假设，横移尚未模拟。请改为智能绕行或严格直线模式后播放。'); return false;}
    const result = mode === 'load' ? suggestLoadOrder(s.placements, s.box, options()) : suggestUnloadOrder(s.placements, s.box, s.unloadRemoved, {...options(),targetId:targetId||onlyId});
    if (!result.order.length || mode === 'load' && !result.complete) {
      notify(result.issues?.[0]?.blockers?.[0]?.reason || '当前方案无法生成完整装入路径，请在装卸面板检查阻挡。');
      return false;
    }
    controller.cancel();
    const remainder = onlyId ? suggestUnloadOrder(s.placements, s.box, [...s.unloadRemoved, onlyId], options()) : result;
    queue = targetId ? result.order.slice(0,result.order.indexOf(targetId)+1) : onlyId ? [onlyId, ...remainder.order] : result.order;
    routes={...result.routes,...remainder.routes}; routeDetails={...result.routeDetails,...remainder.routeDetails};
    unresolved = remainder.unresolved;
    baseRemoved = mode === 'unload' ? [...s.unloadRemoved] : [];
    version = s.placements;
    s.step = mode === 'load' ? index : null;
    s.selected = null;
    fit();
    controller.start({order: queue, mode, duration: duration(), index, autoplay: false});
    renderSteps();
    renderControls();
    draw();
    if (autoplay) controller.resume();
    return true;
  }

  function play() {
    const frame = controller.state;
    if (frame.status === 'running') controller.pause();
    else if (frame.status === 'paused') controller.resume();
    else {
      if (frame.status === 'complete' && mode === 'unload') state().unloadRemoved = [];
      configure({autoplay: true});
    }
  }
  function next() {
    if (controller.state.status === 'running') return;
    if (controller.state.status === 'idle' && !configure()) return;
    controller.step();
  }
  function seek(value) {
    if (controller.state.status === 'idle' && !configure()) return;
    displayedMotionId = null;
    controller.seek(value);
    const s = state(), index = controller.state.index;
    if (mode === 'unload') s.unloadRemoved = [...baseRemoved, ...queue.slice(0, index)];
    else s.step = index;
    paint(false);
  }
  function cancel() {controller.cancel(); state().step = null; version = null; queue = []; routes={}; routeDetails={}; renderKey = '';}
  function setMode(value) {
    cancel(); mode = value === 'unload' ? 'unload' : 'load';
    state().unloadRemoved = []; state().unloadFlow = mode;
    paint(false);
  }

  const sequence = byId('workflow-steps');
  const updateSequenceNavigation = () => {
    const remaining = Math.max(0, (sequence.scrollWidth || 0) - (sequence.clientWidth || 0));
    byId('workflow-scroll-back').disabled = (sequence.scrollLeft || 0) <= 1;
    byId('workflow-scroll-next').disabled = (sequence.scrollLeft || 0) >= remaining - 1;
  };
  sequence.addEventListener('scroll', updateSequenceNavigation);
  for (const [id, direction] of [['workflow-scroll-back', -1], ['workflow-scroll-next', 1]]) {
    byId(id).onclick = () => sequence.scrollBy({left: direction * Math.max(140, sequence.clientWidth * .8), behavior: reducedMotion.matches ? 'instant' : 'smooth'});
  }
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(updateSequenceNavigation).observe(sequence);
  const compactAppearance = matchMedia('(max-width:600px)');
  const adaptAppearance = () => {byId('viewport-appearance-panel').open = false;};
  adaptAppearance();
  compactAppearance.addEventListener('change', adaptAppearance);
  byId('viewport-more').addEventListener('click', event => {
    if (event.target.closest('button')) byId('viewport-more').open = false;
  });

  byId('workflow-play').onclick = play;
  byId('workflow-exit').onclick = () => {cancel(); state().unloadRemoved=[]; paint(false); notify('已退出预演，显示完整原方案。');};
  byId('workflow-next').onclick = next;
  byId('workflow-back').onclick = () => {
    if (controller.state.status === 'idle') {state().unloadRemoved.pop(); paint(false);}
    else seek(controller.state.index - 1);
  };
  byId('workflow-reset').onclick = () => {cancel(); state().unloadRemoved = []; configure(); paint(false);};
  byId('workflow-speed').onchange = event => {speed = Number(event.target.value); controller.setDuration(duration());};
  document.querySelectorAll('button[data-playback-mode]').forEach(button => button.onclick = () => setMode(button.dataset.playbackMode));
  byId('workflow-steps').onclick = event => {
    const button = event.target.closest('[data-playback-id]');
    if (!button) return;
    const index = Number(button.dataset.playbackIndex);
    if (controller.state.status === 'idle' && !configure()) return;
    seek(index + (mode === 'load' ? 1 : 0));
    state().selected = button.dataset.playbackId;
    paint(false);
    notify(`第 ${index + 1} 步${mode === 'load' ? '装入后' : '卸出前'}：${button.dataset.playbackId}。已暂停并选中，可继续缩放观察。`);
  };
  byId('step-play').onclick = play;
  byId('step-forward').onclick = next;
  byId('step-back').onclick = () => seek(controller.state.index - 1);
  byId('step-range').oninput = event => seek(Number(event.target.value));
  byId('flow-load').addEventListener('click', () => setMode('load'));
  byId('flow-unload').addEventListener('click', () => setMode('unload'));
  byId('unload-undo').onclick = () => byId('workflow-back').click();
  byId('unload-reset').onclick = () => {cancel(); state().unloadRemoved = []; paint(false);};
  ['unload-door-mode', 'unload-clearance'].forEach(id => byId(id).addEventListener('change', () => {cancel(); paint(false);}));
  document.querySelectorAll('.rail-item[data-section]').forEach(button => button.addEventListener('click', () => {
    cancel(); mode = button.dataset.section === 'unload' ? state().unloadFlow : 'load'; paint(false);
  }));
  document.addEventListener('visibilitychange', () => {if (document.hidden) controller.pause();});
  reducedMotion.addEventListener('change', () => controller.setDuration(duration()));
  byId('getting-started').open = false;
  byId('getting-started').addEventListener('toggle', () => {if (!byId('getting-started').open) try {localStorage.setItem('realload-onboarding-v118', '1');} catch {}});
  byId('start-add-one').onclick = addOne;
  byId('start-pack').onclick = auto;
  byId('start-play').onclick = () => {byId('getting-started').open = false; mode = 'load'; configure({autoplay: true});};
  document.addEventListener('pointerdown', event => {
    for (const id of ['display-pop', 'export-pop', 'camera-pad']) {
      const panel = byId(id);
      if (!panel.classList.contains('hidden') && !panel.contains(event.target) && !event.target.closest('#display-settings,#export-btn,#camera-toggle')) panel.classList.add('hidden');
    }
    const viewTools = byId('viewport-more');
    if (viewTools.open && !viewTools.contains(event.target)) viewTools.open = false;
    const overflow = byId('global-overflow');
    if (overflow.open && !overflow.contains(event.target)) overflow.open = false;
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    ['display-pop', 'export-pop', 'camera-pad'].forEach(id => byId(id).classList.add('hidden'));
    byId('viewport-more').open = false;
    byId('global-overflow').open = false;
    controller.pause();
  });

  return {
    cancel,
    pause: () => controller.pause(),
    get motionId() {const frame = controller.state; return frame.status === 'running' || displayedMotionId === frame.id ? frame.id : null;},
    get motionRoute() {return routes[controller.state.id]||null;},
    get active() {return controller.state.status !== 'idle';},
    frameItems() {
      const frame = controller.state;
      if (frame.status === 'idle' || version !== state().placements) return null;
      const placements = state().placements;
      const done = new Set([...baseRemoved, ...queue.slice(0, frame.index)]);
      const items = mode === 'load' ? placements.filter(p => done.has(p.id)) : placements.filter(p => !done.has(p.id));
      if (frame.id && (frame.status === 'running' || displayedMotionId === frame.id)) {
        const item = placements.find(p => p.id === frame.id);
        const moving = routes[frame.id]?.length ? positionOnRoute(item,routes[frame.id],frame.progress,mode) : motionPosition(item, state().box, frame.progress, mode);
        return [...items.filter(p => p.id !== frame.id), moving];
      }
      return items;
    },
    unload(id) {
      if (controller.state.status === 'running') return false;
      const s = state(), result = unloadOne(s.placements, s.box, s.unloadRemoved, id, options());
      if (!result.ok) {
        if(s.unloadDoorMode==='smart'){
          const plan=suggestUnloadOrder(s.placements,s.box,s.unloadRemoved,{...options(),targetId:id});
          const at=plan.order.indexOf(id);
          if(at>=0){cancel();mode='unload';if(!configure({targetId:id}))return false;notify(`先卸出 ${at} 件，为 ${s.placements.find(p=>p.id===id)?.unitCode||id} 清出通道；将按计算顺序预演至该件。`);controller.resume();return true;}
        }
        notify(result.reason); return false;
      }
      cancel(); mode = 'unload';
      if (!configure({onlyId: id})) return false;
      controller.step(); return true;
    },
    sync() {
      if (!applying && version && version !== state().placements) cancel();
      const s = state();
      const key = `${s.placements.map(p => `${p.id}:${p.x},${p.y},${p.z}:${p.priority}:${p.deliveryStop}`).join('|')}/${['L','W','H','doorW','doorH','payload'].map(k=>s.box[k]).join(',')}/${s.unloadRemoved.join(',')}/${mode}/${s.unloadDoorMode}/${s.unloadClearance}/${s.routePolicy}/${s.maxLift}/${controller.state.status === 'idle'}`;
      if (key !== renderKey) {renderKey = key; renderSteps();}
      syncFrame(controller.state); renderControls(); updateSequenceNavigation();
      const selected = s.placements.some(p => p.id === s.selected);
      ['quick-delete', 'quick-rotate', 'selection-rotate', 'focus-selected'].forEach(id => byId(id).disabled = !selected);
      byId('undo-btn').setAttribute('aria-label', '撤销上一步');
      byId('redo-btn').setAttribute('aria-label', '重做上一步');
    }
  };
}
