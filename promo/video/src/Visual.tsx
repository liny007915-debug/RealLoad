import React from 'react';
import {AbsoluteFill, CanvasImage, Easing, interpolate, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {Video} from '@remotion/media';
import {CLIPS, READY} from './media';

export const PAPER = '#f4f2ed';
export const INK = '#252724';
export const MUTED = '#676962';
export const FONT = '-apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';
const clamp = {extrapolateLeft: 'clamp' as const, extrapolateRight: 'clamp' as const};

export const Mark = ({size = 40, color = INK}: {size?: number; color?: string}) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-label="RealLoad">
    <path d="M8 13h29v27H8zM8 7h29l6-4M37 13l6-6v27l-6 6M15 19v15m7-15v15m7-15v15" stroke={color} strokeWidth="2.3" strokeLinejoin="round" strokeLinecap="round" />
  </svg>
);

export const Base = ({children, dark = false}: {children: React.ReactNode; dark?: boolean}) => (
  <AbsoluteFill style={{background: dark ? INK : PAPER, color: dark ? PAPER : INK, fontFamily: FONT, overflow: 'hidden'}}>{children}</AbsoluteFill>
);

export const Header = ({chapter, dark = false}: {chapter?: string; dark?: boolean}) => (
  <div style={{position:'absolute', left:88, right:88, top:54, height:50, display:'flex', alignItems:'center', justifyContent:'space-between', color:dark ? PAPER : INK, zIndex:10, transform:'translateZ(0)'}}>
    <div style={{display:'flex', gap:15, alignItems:'center', background:dark ? INK : PAPER, transform:'translateZ(0)', opacity:.999}}><Mark color={dark ? PAPER : INK}/><span style={{fontSize:35, fontWeight:650, letterSpacing:-1}}>RealLoad</span><span style={{fontSize:23, marginLeft:8, opacity:.65}}>装载工作台</span></div>
    <span style={{fontSize:23, letterSpacing:1, opacity:.65}}>{chapter || 'STUDIO · 1.27 BETA1'}</span>
  </div>
);

export const Reveal = ({children, delay = 0, style}: {children: React.ReactNode; delay?: number; style?: React.CSSProperties}) => {
  const frame = useCurrentFrame();
  return <div style={{...style, opacity: interpolate(frame,[delay,delay+18],[0,1],{...clamp,easing:Easing.bezier(.16,1,.3,1)}), translate: interpolate(frame,[delay,delay+24],['0px 28px','0px 0px'],{...clamp,easing:Easing.bezier(.16,1,.3,1)})}}>{children}</div>;
};

export const PageTitle = ({number, title, sub}: {number: string; title: string; sub: string}) => (
  <Reveal delay={3} style={{position:'absolute',left:96,top:148,right:96}}>
    <div style={{display:'flex', alignItems:'baseline',gap:28}}><span style={{fontSize:24,color:MUTED,fontVariantNumeric:'tabular-nums'}}>{number}</span><h1 style={{fontSize:79,lineHeight:1.18,letterSpacing:-4,fontWeight:650,margin:0}}>{title}</h1></div>
    <p style={{fontSize:34,color:MUTED,margin:'20px 0 0 62px',lineHeight:1.5}}>{sub}</p>
  </Reveal>
);

export const Footnote = ({text = '合成演示数据 · 实际应用录屏', dark = false}: {text?: string; dark?: boolean}) => (
  <div style={{position:'absolute', left:96, bottom:35, fontSize:23, color:dark ? '#cfcec6' : MUTED}}>{text}</div>
);

export const Recording = ({clip, style, crop = false, rate = 1}: {clip: keyof typeof CLIPS; style?: React.CSSProperties; crop?: boolean; rate?: number}) => {
  const {fps} = useVideoConfig();
  const item=CLIPS[clip];
  return <div style={{position:'relative',overflow:'hidden',borderRadius:18,background:'#efeeeb',boxShadow:'0 20px 60px #24262116',...style}}>
    {READY ? <Video name={`实际录屏 ${clip}`} src={staticFile(item.src)} trimBefore={item.start*fps} playbackRate={rate} objectFit={crop?'cover':'contain'} muted premountFor={fps} style={{width:'100%',height:'100%'}}/> : <CanvasImage src={staticFile('hero.png')} premountFor={fps} style={{width:'100%',height:'100%',objectFit:'cover'}}/>}
  </div>;
};
