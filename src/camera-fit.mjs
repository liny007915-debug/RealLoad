/** Camera-space fitting in metres; deliberately independent of browser/WebGL.
 * X=container depth, Y=height, Z=width. All eight corners must fit, not just
 * the long axis. This prevents narrow screens from cropping long containers. */
export function fitDistance({L,W,H,yaw=.75,pitch=.45,aspect=1,fov=Math.PI/4,margin=1.14}){
 if(![L,W,H,yaw,pitch,aspect,fov,margin].every(Number.isFinite)||Math.min(L,W,H,aspect,margin)<=0||fov<=0||fov>=Math.PI)throw Error('相机尺寸或视角无效');
 const sy=Math.sin(yaw),cy=Math.cos(yaw),sp=Math.sin(pitch),cp=Math.cos(pitch);
 const right=[cy,0,-sy],up=[-sp*sy,cp,-sp*cy],forward=[cp*sy,sp,cp*cy];
 const tanV=Math.tan(fov/2),tanH=tanV*aspect;let distance=0;
 for(const x of [-L/2,L/2])for(const y of [-H/2,H/2])for(const z of [-W/2,W/2]){
  const u=Math.abs(x*right[0]+y*right[1]+z*right[2]);
  const v=Math.abs(x*up[0]+y*up[1]+z*up[2]);
  const near=x*forward[0]+y*forward[1]+z*forward[2];
  distance=Math.max(distance,near+u/tanH,near+v/tanV);
 }
 return Math.max(.1,distance*margin);
}
/** Returns vertical half-extent of an orthographic viewport that fits the full
 * container cross-section in every standard view for the actual aspect ratio. */
export function orthographicHalfExtent({L,W,H,mode,aspect=1,margin=1.13}){
 if(![L,W,H,aspect].every(Number.isFinite)||Math.min(L,W,H,aspect)<=0)throw Error('箱体相机尺寸无效');
 let horizontal,vertical;
 if(mode==='top'){horizontal=L;vertical=W;}
 else if(mode==='door'){horizontal=W;vertical=H;}
 else if(mode==='side'){horizontal=L;vertical=H;}
 else throw Error('不支持的正交视图');
 return Math.max(horizontal/(2*aspect),vertical/2)*margin;
}
