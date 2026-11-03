import {validate} from './engine.mjs';
import {auditContainerSpec,dimensionAudit} from './dimension-audit.mjs';
import {autoPackThroughDoor} from './door-packing.mjs';
import {packingInventory} from './cargo-spec.mjs';

export const CONTAINER_FIELDS=[['L','内部长度','mm'],['W','内部宽度','mm'],['H','内部高度','mm'],['doorW','柜门净宽','mm'],['doorH','柜门净高','mm'],['payload','允许载重','kg']];
const key=box=>JSON.stringify(CONTAINER_FIELDS.map(([name])=>box[name]));
export function editedContainer(current,values){return {...current,...values,id:'CUSTOM',label:'自定义箱体',source:'',verified:'User supplied'};}

/** Repack only currently loaded units. Retain original identifiers, numbering,
 * stock quantity, metadata and locked coordinates. Failure never mutates input. */
export function reflowContainer(placements,box,skus,clearance=0){
 const spec=auditContainerSpec(box);if(!spec.ok)return{ok:false,reason:spec.issues[0]};
 if(placements.some(p=>!skus.some(s=>s.id===p.skuId)))return{ok:false,reason:'已装货物缺少原始 SKU 资料，不能重排。'};
 try{
  // Repack existing units from their captured physical specifications; the
  // current SKU template is only used when creating a future unit.
  const inventory=packingInventory(skus,placements,{includeRemaining:false}).units;
  const result=autoPackThroughDoor(skus,box,placements.filter(p=>p.locked),inventory.length,clearance,inventory);
  if(result.placements.length!==placements.length)return{ok:false,reason:`新箱体暂未找到容纳全部 ${placements.length} 件已装货物的排布，原方案已保留。请扩大箱体、减小净空或手动调整。`};
  const originals=new Map(placements.map(p=>[p.id,p]));
  const moved=result.placements.map(p=>originals.get(p.id)?.locked?{...originals.get(p.id)}:p);
  const validation=validate(moved,box,skus);
  if(!validation.valid)return{ok:false,reason:validation.issues[0].text};
  return{ok:true,placements:moved,validation};
 }catch(error){return{ok:false,reason:error.message};}
}

/** Keep an explicitly linked door's recorded frame margins. This is a draft
 * calculation, never a substitute for measuring a door opening. */
export function linkedContainerDimensions(reference,values,axis){
 const door=axis==='W'?'doorW':axis==='H'?'doorH':null;
 if(!door||![reference[axis],reference[door],values[axis]].every(Number.isFinite))return {...values};
 return {...values,[door]:Number((values[axis]-(reference[axis]-reference[door])).toPrecision(12))};
}

export function containerFieldErrors(box){
 const errors={};
 for(const [name,label] of CONTAINER_FIELDS)if(!Number.isFinite(box[name])||box[name]<=0)errors[name]=`${label}须为大于零的数值`;
 if(Number.isFinite(box.doorW)&&Number.isFinite(box.W)&&box.doorW>box.W+1e-6)errors.doorW=`门宽不能超过内宽 ${box.W} mm`;
 if(Number.isFinite(box.doorH)&&Number.isFinite(box.H)&&box.doorH>box.H+1e-6)errors.doorH=`门高不能超过内高 ${box.H} mm`;
 return errors;
}

export function setupContainerEditor({state,apply,reflow,onChange=()=>{}}){
 const $=id=>document.getElementById(id),fields=$('container-fields'),form=$('container-edit-form'),audit=$('dimension-audit'),status=$('container-draft-status'),diagram=$('container-diagram');
 fields.innerHTML=CONTAINER_FIELDS.map(([name,label,unit])=>`<label for="container-${name}">${label}<span class="container-number"><input id="container-${name}" type="number" inputmode="decimal" min="0.000001" step="any" required data-container-field="${name}" aria-describedby="container-error-${name} container-draft-status"><span>${unit}</span></span><small id="container-error-${name}" class="container-field-error" hidden></small></label>`).join('');
 let appliedKey='',base=null,template=null,latest=null,dirty=false,valid=false,plane='side',linkReference=null;
 const identity=box=>JSON.stringify([key(box),box.id,box.label,box.source,box.verified]);
 const inputs=()=>[...fields.querySelectorAll('input')];
 const values=()=>Object.fromEntries(inputs().map(input=>[input.dataset.containerField,input.value.trim()===''?NaN:Number(input.value)]));
 const draft=()=>{const v=values();return key(v)===key(template)?{...template,...v}:editedContainer(template,v);};
 const text=n=>Number.isFinite(Number(n))?Number(n).toLocaleString('zh-CN',{maximumFractionDigits:2}):'未填写';
 function renderDiagram(box){
  if(!valid){diagram.innerHTML='<text x="160" y="76" text-anchor="middle">修正尺寸后显示预览</text>';diagram.setAttribute('aria-label','尺寸输入有误，预览暂停');for(const name of ['length','width','height'])delete diagram.dataset[name];return;}
  const span=plane==='side'?box.L:box.W,scale=Math.min(248/span,84/box.H),w=span*scale,h=box.H*scale,x=(320-w)/2,y=108-h;
  const opening=plane==='door'?`<rect class="diagram-door" x="${160-box.doorW*scale/2}" y="${108-box.doorH*scale}" width="${box.doorW*scale}" height="${box.doorH*scale}"/><line x1="160" y1="${108-box.doorH*scale}" x2="160" y2="108"/>`:'';
  const ribs=plane==='side'?Array.from({length:Math.min(14,Math.max(2,Math.floor(w/15)))},(_,i)=>{const rx=x+(i+1)*w/(Math.min(14,Math.max(2,Math.floor(w/15)))+1);return `<line class="diagram-rib" x1="${rx}" y1="${y+3}" x2="${rx}" y2="105"/>`;}).join(''):'';
  diagram.innerHTML=`<rect class="diagram-outline" x="${x}" y="${y}" width="${w}" height="${h}"/>${ribs}${opening}<path class="diagram-dimension" d="M${x} 116v7m0-3h${w}m0-4v7"/><text x="160" y="138" text-anchor="middle">${plane==='side'?'内长':'内宽'} ${text(span)} mm</text><text x="160" y="14" text-anchor="middle">内高 ${text(box.H)} mm${plane==='door'?' · 柜门 +X':''}</text>`;
  diagram.setAttribute('aria-label',`${plane==='side'?'侧面':'柜门正面'}尺寸预览，内长 ${text(box.L)}，内宽 ${text(box.W)}，内高 ${text(box.H)}，门宽 ${text(box.doorW)}，门高 ${text(box.doorH)} 毫米`);
  diagram.dataset.length=box.L;diagram.dataset.width=box.W;diagram.dataset.height=box.H;
 }
 function update(){
  if(!base)return;
  const box=draft(),spec=auditContainerSpec(box),check=dimensionAudit(state().placements,box,state().skus),errors=containerFieldErrors(box);
  latest=box;dirty=identity(box)!==identity(base);valid=spec.ok;
  for(const input of inputs()){
   const name=input.dataset.containerField,error=$('container-error-'+name);input.setAttribute('aria-invalid',String(!!errors[name]));error.hidden=!errors[name];error.textContent=errors[name]||'';
  }
  audit.replaceChildren();const title=document.createElement('b'),detail=document.createElement('small');
  title.textContent=!spec.ok?'尺寸输入有误':check.valid?'当前货物可保留原位置':'现有货物与新尺寸冲突';
  detail.textContent=check.issues.length?check.issues[0]:`载重余量 ${text(check.payloadRemainingKg)} kg · 已装 ${state().placements.length} 件`;
  audit.append(title,detail);audit.classList.toggle('has-error',!check.valid);
  if(spec.ok&&box.L<box.doorW/4){const note=document.createElement('small');note.textContent='内部长度较短，请确认使用毫米。这只是核对提醒，不限制自定义箱形。';audit.append(note);}
  status.textContent=!dirty?'尺寸已保存，可继续修改。支持撤销。':!spec.ok?'草稿尚未保存。请修正标出的输入，场景仍显示已保存箱体。':!check.valid?'草稿尚未保存。预览已更新；现有货位冲突，可按新尺寸重排。':'草稿尚未保存。预览已更新，保存后应用到方案。';
  $('reflow-container').disabled=!spec.ok||!state().placements.length;
  $('reset-container').disabled=!dirty;
  form.dataset.dirty=String(dirty);form.dataset.valid=String(spec.ok);
  const preset=$('container-preset');if(preset)preset.value=[...preset.options].some(option=>option.value===box.id)?box.id:'CUSTOM';
  for(const button of document.querySelectorAll('#container-choices [data-box]')){const active=button.dataset.box===box.id;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));}
  const source=$('container-source');source.hidden=!box.source;source.href=box.source||'#';source.style.visibility='';
  $('container-preview-caption').textContent=plane==='door'?`门洞 ${text(box.doorW)} × ${text(box.doorH)} mm · 位于 +X 端`:'尺寸示意按输入比例绘制，三维场景同步预览。';
  renderDiagram(box);onChange();
 }
 function fill(box){for(const input of inputs())input.value=box[input.dataset.containerField];linkReference={...box};}
 function reset(){base={...state().box};template={...base};appliedKey=identity(base);fill(base);update();}
 form.addEventListener('input',event=>{
  const axis=event.target.dataset.containerField;
  if($('container-link-door').checked&&(axis==='W'||axis==='H')){const adjusted=linkedContainerDimensions(linkReference,values(),axis);const door=axis==='W'?'doorW':'doorH';if(Number.isFinite(adjusted[door]))$('container-'+door).value=adjusted[door];}
  if(axis==='doorW'||axis==='doorH'){const v=values(),span=axis==='doorW'?'W':'H';if(Number.isFinite(v[span])&&Number.isFinite(v[axis]))linkReference={...linkReference,[span]:v[span],[axis]:v[axis]};}
  update();
 });
 $('container-link-door').onchange=()=>{linkReference={...values()};};
 form.onsubmit=event=>{event.preventDefault();if(!valid){fields.querySelector('[aria-invalid=true]')?.focus();return;}if(apply(draft()))reset();else update();};
 $('reset-container').onclick=reset;
 $('reflow-container').onclick=()=>{const result=reflow(draft());if(result===true||result?.ok)reset();else{update();status.textContent=result?.reason||'重排未应用，原方案已保留。请扩大箱体或调整已装货物。';}};
 for(const button of document.querySelectorAll('[data-container-diagram]'))button.onclick=()=>{plane=button.dataset.containerDiagram;for(const b of document.querySelectorAll('[data-container-diagram]'))b.setAttribute('aria-pressed',String(b===button));renderDiagram(draft());$('container-preview-caption').textContent=plane==='door'?`门洞 ${text(latest.doorW)} × ${text(latest.doorH)} mm · 位于 +X 端`:'尺寸示意按输入比例绘制，三维场景同步预览。';};
 function sync(){if(!base||identity(state().box)!==appliedKey)reset();else update();}
 function choosePreset(box){template={...box};fill(template);update();}
 const previewBox=()=>state().section==='container'&&dirty&&valid?{...latest}:null;
 sync();return{sync,reset,draft,choosePreset,previewBox};
}
