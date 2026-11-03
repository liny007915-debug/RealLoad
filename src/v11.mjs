/** Scene modes share a single model; changes are presentation-only. */
const find=id=>document.getElementById(id);
const modes={
  material:{walls:true,wallOpacity:.35,containerView:'complete',doorAngle:112,grid:false,pbr:true,axes:false,coords:false,dimensions:false,tags:true},
  xray:{walls:true,wallOpacity:.18,containerView:'complete',doorAngle:112,grid:false,pbr:true,axes:true,coords:true,dimensions:false,tags:true},
  locator:{walls:true,wallOpacity:.12,containerView:'complete',doorAngle:112,grid:false,pbr:true,axes:false,coords:false,dimensions:false,tags:true},
  technical:{walls:true,wallOpacity:.09,containerView:'cutaway',doorAngle:112,grid:true,pbr:true,axes:true,coords:true,dimensions:true,tags:true}
};
export const sceneModes=Object.freeze(modes);
export function modeMatches(options,mode){const preset=modes[mode];return Object.entries(preset).every(([key,val])=>key==='wallOpacity'? Math.abs(options[key]-val)<.002:options[key]===val)}
export function applySceneMode(state,name){const preset=modes[name];if(!preset)return false;Object.assign(state.opts,preset);state.scenePreset=name;return true}
export function attachV11Controls({current,refresh,notify}){
  for(const button of document.querySelectorAll('[data-scene-preset]'))button.addEventListener('click',()=>{
    const state=current(); if(applySceneMode(state,button.dataset.scenePreset)){
      refresh(); notify?.(button.textContent.trim()+'已启用，货物计算坐标未改变');
    }
  });
  find('scene-expand')?.addEventListener('click',()=>{
    const state=current();state.collapsed=!state.collapsed;refresh();
  });
}
export function updateV11Controls(state){
  for(const b of document.querySelectorAll('[data-scene-preset]')){
    const active=b.dataset.scenePreset===state.scenePreset&&modeMatches(state.opts,b.dataset.scenePreset);
    b.classList.toggle('active',!!active);b.setAttribute('aria-pressed',String(!!active));
  }
  const e=find('scene-expand');if(e){e.setAttribute('aria-pressed',String(!!state.collapsed));const label=e.querySelector('span');if(label)label.textContent=state.collapsed?'恢复面板':'聚焦场景';}
}
