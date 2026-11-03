import {Sequence,useVideoConfig} from 'remotion';
import {Base,Footnote,Header,PageTitle,Recording,Reveal} from './Visual';

export const Container = () => {
 const {fps}=useVideoConfig();
 return <Base><Header chapter="04 / 换个角度看方案"/>
   <PageTitle number="04" title="柜内柜外，都看清。" sub="完整柜体 · 可调透明度 · 四视图 · 图像全屏"/>
   <Reveal delay={12} style={{position:'absolute',left:360,top:328,width:1200,height:675}}>
     <Sequence name="透明度与门向" durationInFrames={5*fps} premountFor={fps}><Recording clip="shell" rate={1.76} style={{width:1200,height:675}}/></Sequence>
     <Sequence name="四视图" from={5*fps} durationInFrames={4*fps} premountFor={fps}><Recording clip="views" rate={2.45} style={{width:1200,height:675}}/></Sequence>
   </Reveal>
   <Footnote text="参数化柜体示意 · 使用实测参数可进一步调整 · 录屏加速"/>
 </Base>;
};
