import {Base,Footnote,Header,Mark,Reveal} from './Visual';

export const Closing = () => <Base dark><Header dark chapter="BETA1 · 邀你试用"/>
 <Reveal style={{position:'absolute',left:104,top:230,right:104,textAlign:'center'}}>
   <div style={{display:'flex',justifyContent:'center',alignItems:'center',gap:24}}><Mark size={74} color="#f4f2ed"/><span style={{fontSize:72,fontWeight:600,letterSpacing:-3}}>RealLoad Studio</span></div>
   <h1 style={{fontSize:116,letterSpacing:-6,lineHeight:1.3,margin:'55px 0 22px',fontWeight:600}}>装得下，也看得清。</h1>
   <div style={{fontSize:35,color:'#c8c9c1'}}>本地运行 · JSON 分享方案 · 20 个功能指南主题</div>
 </Reveal>
 <Reveal delay={18} style={{position:'absolute',left:104,right:104,top:737,textAlign:'center'}}>
   <div style={{fontSize:30,letterSpacing:1}}>1.27 Beta1 测试版</div>
   <div style={{fontSize:26,color:'#c8c9c1',marginTop:22}}>本版验收：488 项核心测试 · 148 项浏览器案例通过</div>
   <div style={{fontSize:27,color:'#f4f2ed',marginTop:38}}>github.com/liny007915-debug/RealLoad</div>
 </Reveal>
 <Footnote dark text="合成演示数据 · 运输安全须专业核验 · 测试范围见仓库内报告"/>
</Base>;
