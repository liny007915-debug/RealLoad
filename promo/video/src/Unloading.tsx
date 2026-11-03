import {Base,Footnote,Header,MUTED,PageTitle,Recording,Reveal} from './Visual';

export const Unloading = () => <Base><Header chapter="05 / 先预演，再作业"/>
 <PageTitle number="05" title="装卸，按顺序预演。" sub="尝试计算路径，让每一步都有顺序。"/>
 <Reveal delay={12} style={{position:'absolute',left:96,top:340}}><Recording clip="unloading" rate={1.1} style={{width:1190,height:669}}/></Reveal>
 <Reveal delay={26} style={{position:'absolute',left:1380,top:418,width:430}}>
   <div style={{fontSize:36,lineHeight:2.1}}>查看顺序<br/>暂停检查<br/>单步回看</div>
   <p style={{fontSize:26,color:MUTED,lineHeight:1.7,marginTop:45}}>有遮挡时，<br/>尝试智能绕行。</p>
 </Reveal>
 <Footnote text="装卸预演节选，应用内 2× 速度 · 有限搜索，不能保证所有方案均可解"/>
</Base>;
