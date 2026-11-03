import {Img, Easing, interpolate, staticFile, useCurrentFrame} from 'remotion';
import {Base, Footnote, Header, INK, MUTED, Reveal} from './Visual';

export const Opening = () => {
 const frame = useCurrentFrame();
 return <Base><Header/>
   <div style={{position:'absolute',right:-160,top:132,width:1450,height:820,overflow:'hidden',maskImage:'linear-gradient(to right, transparent 0%, black 18%)'}}>
     <Img src={staticFile('hero.png')} style={{width:'100%',height:'100%',objectFit:'cover',scale:interpolate(frame,[0,180],[.94,1.04],{extrapolateRight:'clamp',easing:Easing.bezier(.16,1,.3,1)})}}/>
   </div>
   <Reveal style={{position:'absolute',left:96,top:280,width:900}}>
     <div style={{fontSize:26,letterSpacing:6,color:MUTED,marginBottom:34}}>装载规划，放到眼前。</div>
     <h1 style={{fontSize:132,letterSpacing:-9,lineHeight:1.13,fontWeight:650,color:INK,margin:0}}>装得下。<br/>也看得清。</h1>
   </Reveal>
   <Reveal delay={32} style={{position:'absolute',left:104,top:707,fontSize:30,color:MUTED}}>三维规划 · 自由摆放 · 装卸预演</Reveal>
   <Footnote text="RealLoad Studio 1.27 Beta1 · 合成演示数据"/>
 </Base>;
};
