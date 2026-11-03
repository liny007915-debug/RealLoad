/** Atomic cargo-data edits. An ordinary edit never removes a placed unit.
 * Coordinates stay in mm; a conflicting change leaves the applied plan intact.
 */
import {positiveInput, validate} from './engine.mjs';
import {decoratePlacements} from './manifest.mjs';
import {unitOrdinal,withUnitOrdinals} from './unit-identity.mjs';
import {snapshotPlacement} from './cargo-spec.mjs';

export function updateCargo({skus,placements,box}, nextSkus, {renames = {}, allowInvalidPositions = false} = {}) {
  const fail = (reason,issues=[]) => ({ok:false,reason,issues,skus,placements});
  if (!Array.isArray(nextSkus) || nextSkus.some(s => !s || typeof s.id !== 'string' || !s.id.trim() || !positiveInput(s))) return fail('请检查货物编号、尺寸、重量、数量及堆码层数');
  if (new Set(nextSkus.map(s => s.id)).size !== nextSkus.length) return fail('SKU 编号不能重复');
  const previous = new Map(skus.map(s => [s.id,s]));
  const incoming = new Map(nextSkus.map(s => [s.id,s]));
  try {
    const next = withUnitOrdinals(placements).map(p => {
      const skuId = Object.hasOwn(renames,p.skuId) ? renames[p.skuId] : p.skuId;
      const sku = incoming.get(skuId), before = previous.get(p.skuId);
      if (!sku || !before) throw Error(`${p.skuId} 仍有已装货物，不能通过资料更新移除。请使用独立的移出或清空操作`);
      return {...snapshotPlacement(p,before),skuId,ordinal:unitOrdinal(p)};
    });
    // Check serials too: reducing quantity must never silently drop or renumber
    // an already loaded unit, including a plan with gaps in its ordinals.
    const serialConflict = next.find(p => p.ordinal > incoming.get(p.skuId).qty);
    if (serialConflict) return fail(`${serialConflict.skuId} 已装第 ${serialConflict.ordinal} 件，数量不能小于该件序号。请先单独移出这件货物`);
    const audit = validate(next,box,nextSkus);
    if (!audit.valid && !allowInvalidPositions) return fail(audit.issues[0].text,audit.issues);
    return {ok:true,skus:nextSkus,placements:decoratePlacements(next,nextSkus),issues:audit.issues};
  } catch(error) { return fail(error.message); }
}

/** Spreadsheet updates merge fields and retain every existing SKU and unit. */
export function mergeCargo(current, incoming, strategy='update') {
  const records = new Map(current.skus.map(s => [s.id,s]));
  let added=0,updated=0,skipped=0;
  for (const row of incoming) {
    if (records.has(row.id)) {
      if (strategy === 'append') {skipped++; continue;}
      records.set(row.id,{...records.get(row.id),...row});updated++;
    } else {records.set(row.id,row);added++;}
  }
  const result = updateCargo(current,[...records.values()]);
  return {...result,added,updated,skipped};
}
