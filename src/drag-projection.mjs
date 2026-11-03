/** Screen gestures are inverted through the shared world projection. Geometry
 * remains authoritative in mm; there are no fixed pixel-to-mm conversion rates. */
export function intersectPlane(ray,normal,point){
 if(!ray)return null;const dot=(a,b)=>a.reduce((n,v,i)=>n+v*b[i],0),den=dot(ray.d,normal);
 if(Math.abs(den)<1e-9)return null;
 const t=dot(point.map((v,i)=>v-ray.o[i]),normal)/den;
 return Number.isFinite(t)&&t>=0?ray.o.map((v,i)=>v+ray.d[i]*t):null;
}
export function dragPlaneDelta(rayAt,start,current,item,mode='iso',axis='free',eye=null){
 const point=[(item.x+item.L/2)/1000,(item.z+item.H/2)/1000,(item.y+item.W/2)/1000];
 let normal=mode==='side'?[0,0,1]:mode==='door'?[1,0,0]:[0,1,0];
 if(axis==='z'&&mode==='iso')normal=eye?[eye[0]-point[0],0,eye[2]-point[2]]:[1,0,1];
 const a=intersectPlane(rayAt(start.x,start.y),normal,point),b=intersectPlane(rayAt(current.x,current.y),normal,point);
 if(!a||!b)return null;
 const result={x:(b[0]-a[0])*1000,y:(b[2]-a[2])*1000,z:(b[1]-a[1])*1000};
 if(axis!=='free')for(const name of ['x','y','z'])if(name!==axis)result[name]=0;
 return result;
}
