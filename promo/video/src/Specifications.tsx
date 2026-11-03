import {interpolate,useCurrentFrame} from 'remotion';
import {Base,Footnote,Header,MUTED,PageTitle,Recording,Reveal} from './Visual';

export const Specifications = () => {
 const frame=useCurrentFrame();
 return <Base><Header chapter="03 / 每件保留自己的规格"/>
   <PageTitle number="03" title="模板更新，旧件照旧。" sub="新规格，从下一件开始。"/>
   <Reveal delay={12} style={{position:'absolute',left:96,top:340}}><Recording clip="specifications" rate={.7} style={{width:1190,height:669}}/></Reveal>
   <Reveal delay={25} style={{position:'absolute',left:1370,top:384,width:445}}>
     <div style={{fontSize:25,color:MUTED,marginBottom:17}}>已经放入</div>
     <div style={{fontSize:50,fontWeight:600,lineHeight:1.4}}>尺寸 · 毛重<br/>包装，各自保留</div>
     <div style={{height:1,background:'#d4d3cb',margin:'36px 0'}}/>
     <div style={{fontSize:25,color:MUTED,marginBottom:17}}>之后新增</div>
     <div style={{fontSize:50,fontWeight:600,lineHeight:1.4,opacity:interpolate(frame,[85,110],[.2,1],{extrapolateLeft:'clamp',extrapolateRight:'clamp'})}}>使用最新模板</div>
     <div style={{fontSize:25,color:MUTED,lineHeight:1.7,marginTop:30}}>同一 SKU，<br/>也可以有不同的实物规格。</div>
   </Reveal>
   <Footnote text="合成演示货单 · 同一 SKU 保留三种旧规格 · 录屏片段放慢"/>
 </Base>;
};
