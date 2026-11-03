/** Geometry-only manual placement helpers. Distances always mm; no physics claims.
 * X=0 is the closed container end, X=L is doors; Y=0 is left-side wall.
 */
const EPS=1e-7;
export const clamp=(n,lo,hi)=>Math.min(hi,Math.max(lo,n));
export const roundStep=(n,step)=>Math.round(n/step)*step;
function finite(...args){return args.every(Number.isFinite)}
/** Centre-pointer landing, with floor boundaries snapping exactly to edge coordinates.
 * A point outside the physical floor by > 80mm is rejected instead of mysteriously placed.
 */
export function landOnFloor(point,size,box,{step=10,magnet=80}={}){
 if(!point||!finite(point.x,point.y)||!size||!box||!finite(size.L,size.W,box.L,box.W))return null;
 if(size.L>box.L+EPS||size.W>box.W+EPS)return null;
 if(point.x< -magnet||point.y< -magnet||point.x>box.L+magnet||point.y>box.W+magnet)return null;
 const st=step>0?step:1;
 const rawX=point.x-size.L/2,rawY=point.y-size.W/2;
 const maxX=box.L-size.L,maxY=box.W-size.W;
 const edge=(raw,max)=>raw<=magnet?0:raw>=max-magnet?max:clamp(roundStep(raw,st),0,max);
 return{x:edge(rawX,maxX),y:edge(rawY,maxY),z:0};
}
/** Same snapped placement logic for moving an existing item; preserve its dimensions. */
export function boundedMove(position,item,box,{step=10,magnet=85,neighbors=[],axis='free'}={}){
 if(!position||!finite(position.x,position.y,position.z)||!item)return null;
 const st=step>0?step:1;
 const dims={x:item.L,y:item.W,z:item.H};
 let result={...position};
 for(const key of ['x','y','z']){
   if(axis!=='free'&&axis!==key){result[key]=item[key];continue;}
   const max=box[{x:'L',y:'W',z:'H'}[key]]-dims[key];
   if(max<-EPS)return null;
   const value=position[key];
   if(Math.abs(value-item[key])<0.01){result[key]=item[key];continue;}
   result[key]=value<=magnet?0:value>=max-magnet?max:clamp(roundStep(value,st),0,max);
 }
 // Repeated floor-level rectangle contacts have unambiguous corner/face snaps.
 if(magnet>0&&(axis==='free'||axis==='x'||axis==='y')){
   const activeAxes=['x','y'].filter(key=>(axis==='free'||axis===key)&&Math.abs(position[key]-item[key])>=0.01);
   for(const active of activeAxes)result=snapNearFaces(result,item,box,neighbors,{tolerance:Math.max(22,Math.min(100,st*2)),axis:active});
 }
 if(Math.abs(position.z-item.z)>=0.01){
   const tops=neighbors.filter(p=>!['drum','roll','round_pack','reel','bundle','irregular','bag','sack'].includes(p.kind)&&result.x>=p.x-EPS&&result.y>=p.y-EPS&&result.x+item.L<=p.x+p.L+EPS&&result.y+item.W<=p.y+p.W+EPS).map(p=>p.z+p.H);
   const near=tops.filter(z=>z+item.H<=box.H+EPS&&Math.abs(z-position.z)<=Math.max(30,Math.min(100,st*2))).sort((a,b)=>Math.abs(a-position.z)-Math.abs(b-position.z));
   if(near.length)result.z=near[0];
 }
 return result;
}
/** Snap a floor footprint to nearby carton faces without moving outside the container. */
export function snapNearFaces(pos,size,box,neighbors,{tolerance=65,axis='free'}={}){
 const result={...pos};
 for(const key of ['x','y']){
  if(axis!=='free'&&axis!==key)continue;
  const dim=key==='x'?'L':'W',max=box[dim]-size[dim];
  if(max<-EPS)continue;
  const faces=[0,max];
  for(const b of neighbors||[]){
    // Only face-snap against cargo intersecting in the other horizontal axis and vertical range.
    const other=key==='x'?'y':'x',side=other==='x'?'L':'W';
    if(pos[other]+size[side]<b[other]-EPS||b[other]+b[side]<pos[other]-EPS)continue;
    if(pos.z+size.H<b.z-EPS||b.z+b.H<pos.z-EPS)continue;
    faces.push(b[key]+b[dim],b[key]-size[dim]);
  }
  const near=faces.map(value=>({value,distance:Math.abs(result[key]-value)})).filter(v=>v.value>=-EPS&&v.value<=max+EPS&&v.distance<=tolerance).sort((a,b)=>a.distance-b.distance);
  if(near.length)result[key]=clamp(near[0].value,0,max);
 }
 return result;
}
/** Repeatedly solve perspective fall-back floor projection. Linear inverse alone drifts near corners. */
export function invertFloorProjection(project,screen,{L,W}={}){
 if(typeof project!=='function'||!screen||!finite(screen.x,screen.y,L,W)||L<=0||W<=0)return null;
 const o=project({x:0,y:0,z:0}),a=project({x:1000,y:0,z:0}),b=project({x:0,y:1000,z:0});
 const ax=(a.x-o.x)/1000,ay=(a.y-o.y)/1000,bx=(b.x-o.x)/1000,by=(b.y-o.y)/1000,det=ax*by-ay*bx;
 if(!finite(det)||Math.abs(det)<1e-10)return null;
 let x=((screen.x-o.x)*by-(screen.y-o.y)*bx)/det,y=(ax*(screen.y-o.y)-ay*(screen.x-o.x))/det;
 x=clamp(x,-L,L*2);y=clamp(y,-W,W*2);
 for(let i=0;i<12;i++){
  const p=project({x,y,z:0}),dx=screen.x-p.x,dy=screen.y-p.y;
  if(!finite(p.x,p.y,dx,dy))return null;
  if(Math.hypot(dx,dy)<.055)return{x,y};
  const h=Math.max(.5,Math.min(L,W)*.0005),u=project({x:x+h,y,z:0}),v=project({x,y:y+h,z:0});
  const A=(u.x-p.x)/h,B=(v.x-p.x)/h,C=(u.y-p.y)/h,D=(v.y-p.y)/h,J=A*D-B*C;
  if(!finite(J)||Math.abs(J)<1e-11)break;
  x=clamp(x+(dx*D-dy*B)/J,-L,L*2);y=clamp(y+(dy*A-dx*C)/J,-W,W*2);
 }
 const p=project({x,y,z:0});return Math.hypot(screen.x-p.x,screen.y-p.y)<2?{x,y}:null;
}
/** Clamp rigid group translation to container walls without changing relative positions. */
export function boundedGroupDelta(placements,ids,delta,box){
 const selected=placements.filter(p=>ids.includes(p.id));if(!selected.length)return delta;
 const out={...delta};
 for(const [axis,dimension] of [['x','L'],['y','W'],['z','H']]){
  const min=Math.min(...selected.map(p=>p[axis])),max=Math.max(...selected.map(p=>p[axis]+p[dimension]));
  out[axis]=clamp(Number(delta[axis]||0),-min,box[dimension]-max);
 }
 return out;
}
