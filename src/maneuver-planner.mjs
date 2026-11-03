import {supportOf} from './engine.mjs';

const EPS = 1e-5;
const axes = ['x', 'y', 'z'];
const size = {x:'L', y:'W', z:'H'};
const point = p => ({x:p.x, y:p.y, z:p.z});
const overlap = (a,b,c=0) => axes.every(k => a[k] < b[k]+b[size[k]]+c-EPS && a[k]+a[size[k]] > b[k]-c+EPS);
const length = (a,b) => Math.hypot(...axes.map(k => b[k]-a[k]));
/** Planning preferences, not measured handling times or equipment ratings. */
export function routePreferences(options={}) {
  const policy=['balanced','low-lift','distance'].includes(options.policy)?options.policy:'balanced';
  const raw=options.maxLift;
  const maxLift=raw===undefined||raw===null||raw===''?null:Number.isFinite(Number(raw))&&Number(raw)>=0?Number(raw):null;
  return {policy,maxLift,turnPenalty:policy==='distance'?0:policy==='low-lift'?120:200,upWeight:policy==='distance'?1:policy==='low-lift'?8:3,downWeight:policy==='distance'?1:policy==='low-lift'?3:1};
}
export function routeMetrics(route=[],item={z:0}) {
  let distanceMm=0,liftMm=0,lowerMm=0,turns=0,last=null,peakZ=item.z||0;
  for(let i=1;i<route.length;i++){
    const a=route[i-1],b=route[i],axis=axes.find(k=>Math.abs(a[k]-b[k])>EPS);
    if(!axis)continue;
    distanceMm+=length(a,b);liftMm+=Math.max(0,b.z-a.z);lowerMm+=Math.max(0,a.z-b.z);peakZ=Math.max(peakZ,b.z);
    if(last&&last!==axis)turns++;last=axis;
  }
  return {distanceMm,liftMm,lowerMm,turns,peakLiftMm:Math.max(0,peakZ-(item.z||0)),segments:Math.max(0,compactRoute(route).length-1)};
}
function routeCost(route,prefs){const m=routeMetrics(route);return m.distanceMm+(prefs.upWeight-1)*m.liftMm+(prefs.downWeight-1)*m.lowerMm+prefs.turnPenalty*m.turns;}
const supportIndexes=new WeakMap();
function supportingCargo(remaining,id){
 const signature=remaining.map(p=>[p.id,p.x,p.y,p.z,p.L,p.W,p.H,p.kind].join(',')).join(';');
 let cached=supportIndexes.get(remaining);
 if(cached?.signature!==signature){const children=new Map();for(const p of remaining){const support=supportOf(p,remaining);if(support){if(!children.has(support.id))children.set(support.id,[]);children.get(support.id).push(p);}}cached={signature,children};supportIndexes.set(remaining,cached);}
 return cached.children.get(id)||[];
}

/** Conservative, continuous swept-volume test. All coordinates are in mm.
 * The cargo keeps its orientation. A moving item is assumed to be carried;
 * stationary items must keep their original support. Handling equipment,
 * forces and the availability of the assumed clear exterior staging area
 * are not modeled. Nonrectangular cargo uses its maximum outer envelope.
 */
export function segmentIsClear(item, from, to, obstacles, box, clearance=0) {
  if (!item || !from || !to || !box || ![...axes.map(k=>from[k]),...axes.map(k=>to[k]),item.L,item.W,item.H,box.L,box.W,box.H,box.doorW,box.doorH,clearance].every(Number.isFinite) || clearance<0 || Math.min(item.L,item.W,item.H,box.L,box.W,box.H,box.doorW,box.doorH)<=0 || box.doorW>box.W || box.doorH>box.H) return false;
  if (axes.filter(k=>Math.abs(from[k]-to[k])>EPS).length>1) return false;
  const left=(box.W-box.doorW)/2;
  for (const p of [from,to]) {
    if (p.x < -EPS || p.y < -EPS || p.z < -EPS || p.y+item.W>box.W+EPS || p.z+item.H>box.H+EPS) return false;
    if (p.x+item.L>box.L+EPS && (p.y<left+clearance-EPS || p.y+item.W>left+box.doorW-clearance+EPS || p.z+item.H>box.doorH-clearance+EPS)) return false;
  }
  const swept={...item,...Object.fromEntries(axes.map(k=>[k,Math.min(from[k],to[k])]))};
  for(const k of axes)swept[size[k]]=item[size[k]]+Math.abs(to[k]-from[k]);
  return !obstacles.some(p=>p.id!==item.id && overlap(swept,p,clearance));
}

export function compactRoute(points) {
  const out=[];
  for(const p of points){
    if(out.length&&length(out.at(-1),p)<EPS)continue;
    if(out.length>1){
      const a=out.at(-2),b=out.at(-1);
      const first=axes.find(k=>Math.abs(b[k]-a[k])>EPS),second=axes.find(k=>Math.abs(p[k]-b[k])>EPS);
      if(first===second && (b[first]-a[first])*(p[first]-b[first])>=0)out.pop();
    }
    out.push(point(p));
  }
  return out;
}

export function describeRoute(route, box) {
  if(!route?.length)return [];
  return route.slice(1).map((to,i)=>{
    const from=route[i],axis=axes.find(k=>Math.abs(to[k]-from[k])>EPS)||'x';
    const action=axis==='y'?'横移对门':axis==='z'?(to.z>from.z?'抬升避障':'下降落位'):(to.x>=box.L?'移出柜门':to.x>from.x?'向柜门移动':'向柜内让位');
    return {action,axis,distanceMm:length(from,to),from:{...from},to:{...to}};
  });
}

class MinHeap {
  data=[];
  push(value){const a=this.data;a.push(value);let i=a.length-1;while(i){const j=(i-1)>>1;if(a[j].score<=value.score)break;a[i]=a[j];i=j;}a[i]=value;}
  pop(){const a=this.data,top=a[0],last=a.pop();if(a.length){let i=0;while(i*2+1<a.length){let j=i*2+1;if(j+1<a.length&&a[j+1].score<a[j].score)j++;if(a[j].score>=last.score)break;a[i]=a[j];i=j;}a[i]=last;}return top;}
  get length(){return this.data.length;}
}

export function findExtractionPath(item, remaining, box, options={}) {
  const clearance=Math.max(0,Math.min(200,Number(options.clearance)||0));
  const maxNodes=Math.max(1,Math.min(60000,Number(options.maxNodes)||16000));
  const prefs=routePreferences(options);
  const bad=reason=>({ok:false,route:[],segments:[],reason,visited:0});
  if(!item || ![item.x,item.y,item.z,item.L,item.W,item.H,box.L,box.W,box.H,box.doorW,box.doorH].every(Number.isFinite) || Math.min(item.L,item.W,item.H,box.L,box.W,box.H,box.doorW,box.doorH)<=0 || box.doorW>box.W || box.doorH>box.H)return bad('货物或柜门尺寸无效，请检查实测参数。');
  if(item.W+clearance*2>box.doorW+EPS || item.H+clearance>box.doorH+EPS)return bad('当前朝向及预留间隙无法通过门洞；需要更换朝向或设备后重新校验。');
  const above=supportingCargo(remaining,item.id);
  if(above.length)return {...bad('请先卸出上方货物，保留静止货物的完整支撑。'),blockers:above.map(p=>({id:p.id,kind:'support',reason:`上方 ${p.unitCode||p.id} 依赖该件支撑，须先卸出`}))};
  const obstacles=remaining.filter(p=>p.id!==item.id),start=point(item);
  const outside=box.L+Math.max(80,box.L*.03),left=(box.W-box.doorW)/2;
  const minY=left+clearance,maxY=left+box.doorW-clearance-item.W,maxZ=box.doorH-clearance-item.H;
  const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
  const targetY=clamp(item.y,minY,maxY),targetZ=clamp(item.z,0,maxZ);
  const liftCeiling=prefs.maxLift===null?box.H-item.H:Math.min(box.H-item.H,item.z+prefs.maxLift);
  const clear=(a,b)=>a.z<=liftCeiling+EPS&&b.z<=liftCeiling+EPS&&segmentIsClear(item,a,b,obstacles,box,clearance);
  const finish=(points,visited=0,searchLimited=false)=>{
    const route=compactRoute(points);
    const metrics=routeMetrics(route,item);
    return {ok:true,route,...metrics,segments:describeRoute(route,box),metrics,cost:routeCost(route,prefs),policy:prefs.policy,visited,searchLimited,reason:'已校验每段外包络扫掠体与门洞净空；柜外暂存区按空旷区域假设。'};
  };
  // Try the common routes without building a search graph.
  const aligned={x:item.x,y:targetY,z:targetZ};
  const goal={x:outside,y:targetY,z:0};
  const quick=[
    [start,{...start,x:outside},{...start,x:outside,z:0}],
    [start,{...start,y:targetY},aligned,{...aligned,x:outside},goal],
    [start,{...start,z:targetZ},aligned,{...aligned,x:outside},goal]
  ];
  // Common aisle and over-the-load routes avoid a graph search on dense
  // manifests. Every candidate still receives the same continuous test.
  const front=obstacles.filter(p=>p.x+p.L>item.x&&p.x<box.L);
  const lift=Math.max(item.z,...front.map(p=>p.z+p.H+clearance));
  if(lift+item.H<=box.H+EPS){
    const high={...start,z:lift},out={x:outside,y:targetY,z:Math.min(lift,maxZ)};
    const atDoor={x:Math.max(item.x,box.L-item.L),y:targetY,z:lift};
    quick.push([start,high,{...high,y:targetY},atDoor,{...atDoor,z:out.z},out,goal]);
  }
  for(const y of [...new Set([minY,maxY,(minY+maxY)/2])])quick.push([start,{...start,y},{x:outside,y,z:item.z},{x:outside,y,z:0}]);
  // Keep the best verified incumbent instead of accepting the first route.
  let best=null,bestCost=Infinity;
  for(const candidate of quick)if(candidate.slice(1).every((p,i)=>clear(candidate[i],p))){
    const route=compactRoute(candidate),cost=routeCost(route,prefs);if(cost<bestCost-EPS){best=route;bestCost=cost;}
  }
  if(!clear(start,start))return bad('起始外包络或预留间隙已与邻货冲突；请减少间隙或检查该位置。');

  // Visibility grid in configuration space. Obstacle faces, door edges and
  // cargo limits provide exact critical coordinates; no pixel discretisation.
  const coordinates={
    x:[0,item.x,box.L-item.L,box.L,outside],
    y:[0,item.y,box.W-item.W,minY,maxY,(minY+maxY)/2],
    z:[0,item.z,box.H-item.H,maxZ]
  };
  for(const p of obstacles)for(const k of axes)coordinates[k].push(p[k]-item[size[k]]-clearance,p[k]+p[size[k]]+clearance);
  coordinates.z.push(liftCeiling);
  const max={x:outside,y:box.W-item.W,z:liftCeiling};
  for(const k of axes)coordinates[k]=[...new Set(coordinates[k].filter(v=>Number.isFinite(v)&&v>=0&&v<=max[k]))].sort((a,b)=>a-b);
  const shape=axes.map(k=>coordinates[k].length),idx=axes.map(k=>coordinates[k].indexOf(start[k]));
  if(idx.some(v=>v<0))return bad('起始位置超出柜体内部。');
  const encode=v=>(v[0]*shape[1]+v[1])*shape[2]+v[2];
  const decode=n=>[Math.floor(n/(shape[1]*shape[2])),Math.floor(n/shape[2])%shape[1],n%shape[2]];
  const position=v=>Object.fromEntries(axes.map((k,i)=>[k,coordinates[k][v[i]]]));
  const heuristic=p=>outside-p.x+prefs.downWeight*p.z+(p.y<minY?minY-p.y:p.y>maxY?p.y-maxY:0);
  if(best&&bestCost<=heuristic(start)+EPS)return finish(best);
  // Last movement axis is part of the state, so bend costs remain consistent.
  const root=encode(idx)*4,heap=new MinHeap(),cost=new Map([[root,0]]),previous=new Map(),closed=new Set();
  heap.push({id:root,score:heuristic(start)});
  let visited=0;
  while(heap.length&&visited<maxNodes){
    const entry=heap.pop();if(closed.has(entry.id))continue;
    if(best&&entry.score>=bestCost-EPS)return finish(best,visited);
    closed.add(entry.id);visited++;
    const v=decode(Math.floor(entry.id/4)),p=position(v),lastAxis=entry.id%4-1;
    if(Math.abs(p.x-outside)<EPS && p.z<EPS && p.y>=minY-EPS && p.y<=maxY+EPS){
      const route=[p];let id=entry.id;while(previous.has(id)){id=previous.get(id);route.push(position(decode(Math.floor(id/4))));}return finish(route.reverse(),visited);
    }
    for(let axis=0;axis<3;axis++)for(const sign of [1,-1]){
      const next=[...v];next[axis]+=sign;if(next[axis]<0||next[axis]>=shape[axis])continue;
      const id=encode(next)*4+axis+1;if(closed.has(id))continue;
      const q=position(next),distance=length(p,q),weight=axis===2?(q.z>p.z?prefs.upWeight:prefs.downWeight):1;
      const g=cost.get(entry.id)+distance*weight+(lastAxis>=0&&lastAxis!==axis?prefs.turnPenalty:0);
      if(g>=(cost.get(id)??Infinity)-EPS || !clear(p,q))continue;
      cost.set(id,g);previous.set(id,entry.id);heap.push({id,score:g+heuristic(q)});
    }
  }
  if(best)return finish(best,visited,visited>=maxNodes);
  return {ok:false,route:[],segments:[],visited,limited:visited>=maxNodes,reason:visited>=maxNodes?'已达到本次路径搜索上限，尚未找到路径；可先卸出阻挡件后重算。':`当前固定朝向${prefs.maxLift===null?'':`、最多抬升 ${prefs.maxLift} mm`}下未找到可通行路径；可先清障或调整参数后重算。`};
}

/** Distance-parametrised motion; reverse the exact verified path for loading. */
export function positionOnRoute(item, route, progress, mode='unload') {
  if(!route?.length)return {...item};
  const points=mode==='load'?[...route].reverse():route;
  const t=Math.max(0,Math.min(1,Number(progress)||0));
  const eased=t*t*(3-2*t),distances=points.slice(1).map((p,i)=>length(points[i],p));
  const total=distances.reduce((a,b)=>a+b,0);let target=total*eased;
  for(let i=0;i<distances.length;i++){
    if(target<=distances[i]||i===distances.length-1){const f=distances[i]>EPS?Math.min(1,target/distances[i]):1;return {...item,...Object.fromEntries(axes.map(k=>[k,points[i][k]+(points[i+1][k]-points[i][k])*f]))};}
    target-=distances[i];
  }
  return {...item,...points.at(-1)};
}
