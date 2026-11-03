import {autoPack, validate} from './engine.mjs';

/** Reserve the actual, centred door cross-section for fixed-Y/Z straight travel.
 * This is a conservative packing option, not a forklift path or safety proof.
 */
export function autoPackThroughDoor(skus, box, locked = [], max = 180, clearance = 0, inventory = null) {
  const c = Math.max(0, Number(clearance) || 0);
  const left = (box.W - box.doorW) / 2 + c;
  const corridor = {...box, W: box.doorW - 2 * c, H: Math.min(box.H, box.doorH - c)};
  corridor.doorW = corridor.W;
  corridor.doorH = corridor.H;
  if (![left, corridor.W, corridor.H].every(Number.isFinite) || left < 0 || corridor.W <= 0 || corridor.H <= 0) {
    throw new Error('门洞或预留净空无效，请先核对箱体尺寸。');
  }
  const shifted = locked.map(p => ({...p, y: p.y - left}));
  if (!validate(shifted, corridor, skus).valid) {
    throw new Error('锁定货物超出当前门洞直线范围。请先解锁或调整位置，再重新装柜。');
  }
  const result = autoPack(skus, corridor, shifted, max, inventory);
  const placements = result.placements.map(p => ({...p, y: p.y + left}));
  return {...result, placements, validation: validate(placements, box, skus),
    pathEnvelope: {left, right: left + corridor.W, height: corridor.H, clearance: c}};
}
