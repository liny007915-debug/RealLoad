/** Container coordinate convention: X=0 at closed front/end wall, X=L at DOORS. 
 * Y=0 on left from front looking toward the doors; Z=0 at cargo floor. 
 * Zones are orientation aids, not a replacement for measured millimetre coordinates.
 */
export function cargoZone(p,box){if(!p||!box||![box.L,box.W,box.H].every(n=>Number.isFinite(n)&&n>0))return '未定位';const along=(p.x+p.L/2)/box.L,across=(p.y+p.W/2)/box.W,high=(p.z+p.H/2)/box.H;const x=along<.24?'柜头':along>.76?'柜门侧':'中段';const y=across<.33?'左侧':across>.67?'右侧':'中间';const z=high<.34?'底层':high>.68?'上层':'中层';return `${x} · ${y} · ${z}`;}
