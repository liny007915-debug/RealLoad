import {Series,useVideoConfig} from 'remotion';
import {Audio} from '@remotion/media';
import {staticFile} from 'remotion';
import {Opening} from './Opening';
import {Cargo} from './Cargo';
import {Movement} from './Movement';
import {Specifications} from './Specifications';
import {Container} from './Container';
import {Unloading} from './Unloading';
import {Closing} from './Closing';

export const Promo = () => {
 const {fps}=useVideoConfig();
 return <>
   <Audio name="原创产品配乐" src={staticFile('music.m4a')} volume={.72} premountFor={fps}/>
   <Series>
     <Series.Sequence name="装得下，也看得清" durationInFrames={180} premountFor={fps}><Opening/></Series.Sequence>
     <Series.Sequence name="16类货物" durationInFrames={240} premountFor={fps}><Cargo/></Series.Sequence>
     <Series.Sequence name="自由摆放与坐标" durationInFrames={270} premountFor={fps}><Movement/></Series.Sequence>
     <Series.Sequence name="逐件保存规格" durationInFrames={330} premountFor={fps}><Specifications/></Series.Sequence>
     <Series.Sequence name="柜体与四视图" durationInFrames={270} premountFor={fps}><Container/></Series.Sequence>
     <Series.Sequence name="装卸顺序预演" durationInFrames={300} premountFor={fps}><Unloading/></Series.Sequence>
     <Series.Sequence name="邀请Beta试用" durationInFrames={210} premountFor={fps}><Closing/></Series.Sequence>
   </Series>
 </>;
};
