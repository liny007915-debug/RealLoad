import {surfaceMaps} from './materials.mjs';
let promise;
/** Original generated raster albedo, shipped locally. It is a visual example,
 * not a measured scan or a statement of material strength. No network runtime. */
export function loadAuthoredSurfaces(){
 if(promise)return promise;
 promise=new Promise(resolve=>{
  const image=new Image();image.decoding='async';
  image.onerror=()=>resolve(null);
  image.onload=()=>{
   try{
    const materials={carton:[0,0],crate:[1,0],board:[1,0],pallet:[1,0],reel:[1,0],jute:[0,1],sack:[0,1],containerPaint:[1,1]},maps={};
    for(const [kind,[x,y]] of Object.entries(materials)){
     const canvas=document.createElement('canvas');canvas.width=canvas.height=512;
     const ctx=canvas.getContext('2d'),repeat=['jute','sack'].includes(kind)?3:1;
     for(let u=0;u<repeat;u++)for(let v=0;v<repeat;v++)ctx.drawImage(image,x*image.width/2,y*image.height/2,image.width/2,image.height/2,u*512/repeat,v*512/repeat,512/repeat,512/repeat);
     maps[kind]={albedo:canvas,...surfaceMaps(canvas,kind)};
    }
    resolve(maps);
   }catch{resolve(null);}
  };
  image.src=new URL('../assets/materials/packaging-atlas-v121.png',import.meta.url).href;
 });
 return promise;
}
