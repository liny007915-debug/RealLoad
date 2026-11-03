import {Base,Footnote,Header,MUTED,PageTitle,Recording,Reveal} from './Visual';

export const Cargo = () => <Base><Header chapter="01 / 看清每件货物"/>
 <PageTitle number="01" title="每种货物，都有模样。" sub="16 类包装，包含不规则货物。"/>
 <Reveal delay={12} style={{position:'absolute',left:96,top:340}}><Recording clip="orbit" rate={.92} style={{width:1190,height:669}}/></Reveal>
 <Reveal delay={30} style={{position:'absolute',left:1380,top:405,width:430}}>
   <div style={{fontSize:104,letterSpacing:-7,fontWeight:600,lineHeight:1}}>16<span style={{fontSize:32,letterSpacing:0,marginLeft:15}}>类包装</span></div>
   <div style={{height:1,background:'#d4d3cb',margin:'36px 0'}}/>
   <div style={{fontSize:32,lineHeight:2.1}}>纸箱 · 木箱 · 托盘<br/>桶装 · 线盘 · 捆扎<br/>设备 · 不规则货物</div>
   <p style={{fontSize:25,lineHeight:1.7,color:MUTED,marginTop:34}}>从实际外廓出发，<br/>让不同货物各就各位。</p>
 </Reveal>
 <Footnote/>
</Base>;
