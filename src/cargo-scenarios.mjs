/** Interactive training fixtures. All cargo measurements and masses are simulated,
 * not manufacturer specifications. Collision remains conservative outer-envelope
 * geometry; visible cavities never create usable packing space. Units: mm / kg.
 */
import {CONTAINERS} from './engine.mjs';
import {makeNumbering, decoratePlacements} from './manifest.mjs';
import {snapshotPlacement} from './cargo-spec.mjs';

const clone = value => JSON.parse(JSON.stringify(value));
const SAMPLE_SOURCE = 'V1.19 交互模拟样本，非厂家规格；尺寸与毛重均为模拟值，实际作业必须以实测为准。';
const ENVELOPE_NOTE = '所有尺寸为含底托、防护和突出部位的最大外廓；异形凹处不能嵌套，未验证真实重心、承压、绑扎或动态稳定性。';
const freeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};

function sku(id, name, kind, size, weight, qty, groupId, note, extra = {}) {
  const [L, W, H] = size;
  const item = {id, skuCode:id, name:`${name}（模拟，非厂家规格）`, kind,
    L, W, H, weight, qty, rotate:true, allowTilt:false, stackLimit:1,
    groupId, orderNo:`SIM-${groupId}`, priority:'normal', sampleOnly:true,
    importSource:SAMPLE_SOURCE, notes:`${note} ${ENVELOPE_NOTE}`, ...extra};
  item.numbering = makeNumbering({quantity:qty, group:groupId, code:id, kind});
  return item;
}

function placement(skus, id, x, y, z = 0, ordinal = 1, heading = 0) {
  const s = skus.find(item => item.id === id);
  const crosswise = heading % 180 === 90;
  return snapshotPlacement({id:`${id}#${ordinal}`, skuId:id, ordinal, name:s.name, kind:s.kind,
    weight:s.weight, stackLimit:s.stackLimit, locked:false,
    x, y, z, L:crosswise?s.W:s.L, W:crosswise?s.L:s.W, H:s.H,
    rotation:crosswise?1:0, heading, stackDepth:z?2:1},s);
}

function scenario(id, title, description, skus, positions, notes) {
  return {id, title, description, source:SAMPLE_SOURCE, notes:[ENVELOPE_NOTE,...notes],
    container:clone(CONTAINERS['20GP']), skus,
    placements:decoratePlacements(positions.map(args => placement(skus,...args)),skus)};
}

const dailySkus = [
  sku('SIM-CARTON','日用品瓦楞纸箱','carton',[600,400,420],18,4,'日常混装','按封箱后长宽高占位，本样本不堆码。'),
  sku('SIM-PALLET','缠膜整托','pallet',[1200,1000,1200],420,1,'日常混装','尺寸和毛重包含底托及缠膜，不能拆成独立小箱占位。'),
  sku('SIM-DRUM','直立钢桶','drum',[580,580,880],78,2,'日常混装','按直立等直径桶示意；与其他包装组合采用外接矩形。'),
  sku('SIM-ROLL','直立卷材','roll',[720,720,1100],230,1,'日常混装','不模拟防滚、卷芯承压或水平卧放。'),
  sku('SIM-SACK','编织袋装货','sack',[650,450,260],28,2,'日常混装','软袋只按最大外廓放在柜底，不压缩，也不作为上方货物的平面支撑。'),
  sku('SIM-CRATE','出口木箱','crate',[1000,800,900],160,1,'日常混装','木箱外观不是承压证明，本样本限制为一层。')
];

const irregularSkus = [
  sku('SIM-IRR-L','带侧臂非对称设备','irregular',[1450,900,1380],380,1,'异形设备','视觉为台阶机柜、侧臂和底托；整个最大长方体都占位，凹处不能放箱。'),
  sku('SIM-IRR-OFFSET','偏心泵组防护包装','irregular',[1050,760,1250],245,1,'异形设备','不对称本体与底托仅作外形识别；几何中心不是实测重心，可练习水平90°和180°转向。'),
  sku('SIM-MACHINE','设备机箱','machine',[1000,800,1080],320,1,'异形设备','按运输状态含突出部位的最大外包装尺寸计算。'),
  sku('SIM-REEL','木线盘','reel',[850,1100,1100],290,1,'异形设备','盘轴横卧；盘缘之间和卷芯孔都不能用于嵌套，按矩形外廓。'),
  sku('SIM-BUNDLE','捆扎管材','bundle',[2100,480,420],205,1,'异形设备','按管捆最大长宽高占位；管间间隙不能嵌套，不模拟散管滚动。'),
  sku('SIM-ROUND','直立圆柱防护包装','round_pack',[580,580,900],48,2,'异形设备','只有直立等直径圆柱之间采用既有圆形碰撞；与异形、木箱和其他类型按外接矩形。')
];

const boundarySkus = [
  sku('SIM-EDGE-DOOR','门洞宽高临界防护箱','crate',[500,2340,2292],180,1,'边界核对','恰好等于20GP示例门洞宽高，Y=6 mm；0 mm净空可直线通过，增加净空或偏移0.01 mm应被拒绝。',{rotate:false}),
  sku('SIM-SUPPORT-BASE','完整平面支撑底箱','carton',[1000,800,600],35,1,'边界核对','仅为双层几何支撑练习；未验证纸箱抗压。',{stackLimit:2}),
  sku('SIM-SUPPORT-TOP','支撑核对上箱','carton',[600,500,400],14,1,'边界核对','完整位于底箱顶部；应先卸上箱再卸底箱。',{stackLimit:2}),
  sku('SIM-EDGE-SACK','禁止承托软袋','sack',[640,420,200],26,1,'边界核对','一层柜底放置；即使调大层数，也不能把软袋顶部当完整平面支撑。'),
  sku('SIM-EDGE-IRR','禁止承托异形设备','irregular',[900,700,1000],155,1,'边界核对','视觉凹口与台阶不构成可用空间或可承托平面。'),
  sku('SIM-EDGE-TURN','正交旋转核对箱','crate',[900,500,500],42,1,'边界核对','可水平90°及180°转向；每次旋转仍需通过边界、碰撞与支撑检查。')
];

export const scenarios = freeze([
  scenario('daily-mixed','日常混装 · 六类包装',
    '11 件模拟货物：纸箱、整托、钢桶、卷材、编织袋和木箱，全部柜底放置。',dailySkus,[
      ['SIM-PALLET',200,80],['SIM-CRATE',200,1200],['SIM-ROLL',1600,80],
      ['SIM-DRUM',1600,1000],['SIM-DRUM',2300,1000,0,2],
      ['SIM-CARTON',3000,100],['SIM-CARTON',3700,100,0,2],
      ['SIM-CARTON',3000,650,0,3],['SIM-CARTON',3700,650,0,4],
      ['SIM-SACK',4500,100],['SIM-SACK',4500,750,0,2]
    ],['可直接编辑、旋转和逐件装卸；钢桶与卷材的防滚措施尚未验证。']),
  scenario('irregular-equipment','异形设备 · 外廓占位',
    '7 件模拟货物：非对称设备、机箱、线盘、管材捆和圆柱包装，练习保守外廓与转向。',irregularSkus,[
      ['SIM-IRR-L',200,60],['SIM-IRR-OFFSET',200,1200,0,1,90],
      ['SIM-REEL',1850,60],['SIM-MACHINE',1850,1300],
      ['SIM-BUNDLE',3150,60],['SIM-ROUND',3150,850],['SIM-ROUND',4050,1200,0,2]
    ],['选中偏心泵组可练习90°与180°转向。','视觉凹处、线盘孔和管间间隙都不能嵌套其他货物；不规则外形不参与精细实体碰撞。']),
  scenario('door-support-boundaries','门洞与支撑 · 边界核对',
    '6 件合法预置货物：门洞极限、双层完整支撑、软袋与异形禁承托及正交旋转。',boundarySkus,[
      ['SIM-EDGE-DOOR',5350,6],['SIM-SUPPORT-BASE',300,70],
      ['SIM-SUPPORT-TOP',500,220,600],['SIM-EDGE-SACK',1900,80],
      ['SIM-EDGE-IRR',2700,80],['SIM-EDGE-TURN',4000,1300]
    ],['默认0 mm净空；门洞临界箱已合法放置，不预装故意非法状态。','预演应先取出门侧临界箱，再按通道与支撑顺序处理其余货物。','移动临界箱超出门洞0.01 mm、抬高上箱0.01 mm或删除其底箱，应触发约束提示。'])
]);

const MANEUVER_SOURCE=SAMPLE_SOURCE.replace('V1.19','V1.20');
const maneuverSkus=[
  sku('SIM-ROUTE-REAR','后方急件异形设备','irregular',[800,700,700],145,1,'绕行练习','需要先清除门侧大件，再横向绕过中部高箱。',{priority:'urgent',importSource:MANEUVER_SOURCE}),
  sku('SIM-ROUTE-MIDDLE','中部高木箱','crate',[1100,800,2100],210,1,'绕行练习','不能从上方越过，但右侧留有几何通道。',{importSource:MANEUVER_SOURCE}),
  sku('SIM-ROUTE-DOOR','靠门大型设备','machine',[1200,1800,2000],780,1,'绕行练习','Y=0，须先横移6mm对齐示例门洞，再移出柜外。',{importSource:MANEUVER_SOURCE})
];
export const maneuverScenarios=freeze([
  {...scenario('door-blocker-maneuver','靠门大件 · 清障与绕行',
    '3 件模拟货物：先横移卸出门侧大件，再为后方急件计算侧向绕行；可切换严格直线对比。',maneuverSkus,[
      ['SIM-ROUTE-REAR',400,20],['SIM-ROUTE-MIDDLE',2300,20],['SIM-ROUTE-DOOR',4600,0]
    ],['本场景用于V1.20路径算法回归，尺寸与重量均为模拟值。','固定朝向的外包络路径，柜外暂存区按空旷区域假设；搬运设备与承载能力尚未验证。']),source:MANEUVER_SOURCE}
]);
const DISPATCH_SOURCE=SAMPLE_SOURCE.replace('V1.19','V1.22');
const dispatchSku=(...args)=>{const item=sku(...args);item.importSource=DISPATCH_SOURCE;return item;};
const dispatchSkus=[
  dispatchSku('SIM-DISPATCH-HEAVY','后站重型机柜','machine',[1100,900,1450],860,1,'多站交付','第3站交付，非急件；重量参与载重检查，不代表设备承载能力已验证。',{deliveryStop:3,priority:'low'}),
  dispatchSku('SIM-DISPATCH-COOL','首站急件保温箱','coolbox',[650,550,500],22,2,'多站交付','第1站紧急件，但必须先清除靠门大件才能卸出。',{deliveryStop:1,priority:'urgent'}),
  dispatchSku('SIM-DISPATCH-IRR','第二站异形设备','irregular',[1000,800,1200],280,1,'多站交付','第2站普通件，突出侧臂按最大外廓占位。',{deliveryStop:2}),
  dispatchSku('SIM-DISPATCH-PALLET','第二站重货整托','pallet',[1100,900,1200],620,1,'多站交付','第2站普通件，含底托及包装毛重，按整托装卸。',{deliveryStop:2}),
  dispatchSku('SIM-DISPATCH-LIGHT','首站轻货纸箱','carton',[500,400,380],6,2,'多站交付','第1站优先件，在同站紧急件之后安排。',{deliveryStop:1,priority:'high'}),
  dispatchSku('SIM-DISPATCH-CRATE','末站备件木箱','crate',[850,700,950],135,1,'多站交付','第3站普通件，不因位置靠门而默认优先交付。',{deliveryStop:3}),
  dispatchSku('SIM-DISPATCH-GATE','靠门大件清障练习','machine',[650,2200,1950],780,1,'多站交付','第3站非急件，但挡住前方货物，需先卸至柜外暂存，再处理首站货物。',{deliveryStop:3,priority:'low',rotate:false})
];
export const dispatchScenarios=freeze([
  {...scenario('dispatch-priority','轻重缓急 · 多站交付',
    '9件模拟货物，单件6–860 kg、四级紧急程度、三站交付；先清除门侧大件，再优先处理首站急件。',dispatchSkus,[
      ['SIM-DISPATCH-HEAVY',150,70],['SIM-DISPATCH-COOL',350,1350],
      ['SIM-DISPATCH-COOL',1200,1350,0,2],['SIM-DISPATCH-IRR',1500,70],
      ['SIM-DISPATCH-PALLET',2800,80],['SIM-DISPATCH-LIGHT',2350,1500],
      ['SIM-DISPATCH-LIGHT',3000,1500,0,2],['SIM-DISPATCH-CRATE',4050,100],
      ['SIM-DISPATCH-GATE',5150,6]
    ],['按交付站次优先、同站按紧急程度排序；阻挡急件的货物先清障，不能穿透障碍物。','柜外暂存区按空旷区域假设；不模拟后站货物的重新装回，也未验证搬运设备承载、保温时效或固定措施。']),source:DISPATCH_SOURCE}
]);
const ROUTE_SOURCE=SAMPLE_SOURCE.replace('V1.19','V1.23');
const routeSkus=[
 sku('SIM-COMPARE-URGENT','待交付急件机箱','machine',[600,600,600],420,1,'路径比较','对比平面绕行和抬升200mm越过低箱，两种方式都必须检查外廓。',{priority:'urgent',importSource:ROUTE_SOURCE}),
 sku('SIM-COMPARE-LOW','前方低木箱','crate',[600,1552,200],110,1,'路径比较','侧面留有600mm几何通道；现场搬运设备及抬升能力尚未验证。',{priority:'low',rotate:false,importSource:ROUTE_SOURCE})
];
export const routeComparisonScenarios=freeze([
 {...scenario('route-comparison','路径比较 · 平面与抬升',
  '2件模拟货物。在计算设置切换少抬升与路程优先，比较急件侧向绕行或抬升越过低箱的实际路径。',routeSkus,[
   ['SIM-COMPARE-URGENT',200,1000],['SIM-COMPARE-LOW',2000,200]
  ],['V1.23人工模拟尺寸及毛重，非厂家规格。','少抬升增加升降的规划代价，不表示现场更快或更安全；0mm抬升限制仍可沿侧面通道绕行。']),source:ROUTE_SOURCE}
]);
const FREE_SOURCE=SAMPLE_SOURCE.replace('V1.19','V1.25');
const freeSkus=[
 sku('SIM-FREE-A','可堆码纸箱','carton',[400,400,400],20,4,'自由摆放练习','用于练习单件拖动、自动叠放和整垛联动。',{stackLimit:4,importSource:FREE_SOURCE}),
 sku('SIM-FREE-IR','异形设备','irregular',[800,700,700],145,1,'自由摆放练习','外形凹口不参与嵌套，不能默认承托其他货物。',{importSource:FREE_SOURCE})
];
const freeScenario=scenario('free-placement','自由移动 · 整垛与草稿',
 '5件模拟货物。拖动上层纸箱到空地，或把独立纸箱拖到整垛上方；切换自由草稿可练习悬空与重叠，再统一校验。',freeSkus,[
 ['SIM-FREE-A',500,500,0,1],['SIM-FREE-A',500,500,400,2],['SIM-FREE-A',500,500,800,3],['SIM-FREE-A',1800,1400,0,4],['SIM-FREE-IR',3000,500]
 ],['自动落位重新寻找地板或完整平面支撑，联动上方货物时保留整垛相对位置。','自由草稿允许临时悬空、重叠或移到柜外。草稿单独保存，校验通过并应用后才影响装卸与导出。']);
freeScenario.source=FREE_SOURCE;
for(const p of freeScenario.placements)p.stackDepth=p.skuId==='SIM-FREE-A'?p.z/400+1:1;
export const freeMovementScenarios=freeze([freeScenario]);
export const trainingScenarios=Object.freeze([...scenarios,...maneuverScenarios,...dispatchScenarios,...routeComparisonScenarios,...freeMovementScenarios]);

/** Return an independent editable plan; never mutate the shared fixture catalogue. */
export function getCargoScenario(id = scenarios[0].id) {
  const found = trainingScenarios.find(item => item.id === id);
  if (!found) throw new RangeError(`未知模拟场景：${id}`);
  return clone(found);
}
