import {Base,Footnote,Header,PageTitle,Recording,Reveal} from './Visual';

export const Movement = () => <Base><Header chapter="02 / 调整每个位置"/>
 <PageTitle number="02" title="摆放，直接上手。" sub="自由拖动，也能用 XYZ 精确调整。"/>
 <Reveal delay={12} style={{position:'absolute',left:360,top:328}}><Recording clip="movement" rate={.7} style={{width:1200,height:675}}/></Reveal>
 <Footnote text="实际应用录屏，片段放慢 · 位置调整后检查边界、碰撞与承托"/>
</Base>;
