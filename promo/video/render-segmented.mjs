import {spawnSync} from 'node:child_process';
import {mkdirSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// Work around long-lived Chrome renderer interruptions on the production Mac.
// Every rendered frame still comes from the same composition and absolute timeline.
const dir=path.dirname(fileURLToPath(import.meta.url));
const cli=path.join(dir,'node_modules/@remotion/cli/remotion-cli.js');
const chunks=path.join(dir,'out/chunks');
mkdirSync(chunks,{recursive:true});
const output=path.resolve(dir,process.argv[2] || '../../release/RealLoad-Studio-v1.27-Beta1-Promo-1080p.mp4');
mkdirSync(path.dirname(output),{recursive:true});
const chrome=process.env.REALLOAD_RENDER_BROWSER || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const run=(args,timeout=180000)=>spawnSync(process.execPath,[cli,...args],{cwd:dir,encoding:'utf8',timeout,maxBuffer:8*1024*1024});
const results=[];
for(let i=0;i<10;i++){
 const start=i*180,end=start+179,file=path.join(chunks,`part-${String(i).padStart(2,'0')}.mp4`);
 let ok=false;
 for(let attempt=1;attempt<=3;attempt++){
  const r=run(['render','src/index.ts','RealLoad-Promo',file,`--frames=${start}-${end}`,'--codec=h264','--crf=20','--pixel-format=yuv420p','--concurrency=1','--muted','--disable-shared-memory-capture',`--browser-executable=${chrome}`,'--gl=swangle','--log=error']);
  writeFileSync(path.join(chunks,`part-${i}-attempt-${attempt}.log`),(r.stdout||'')+(r.stderr||'')+(r.error?.message||''));
  if(r.status===0){ok=true;results.push({start,end,file:path.basename(file),attempt});break;}
  process.stdout.write(`Retry part ${i+1}/10, attempt ${attempt}\n`);
 }
 if(!ok)throw new Error(`Could not render frames ${start}-${end}; inspect out/chunks logs`);
 process.stdout.write(`Rendered part ${i+1}/10: frames ${start}-${end}\n`);
}
writeFileSync(path.join(chunks,'concat.txt'),results.map(r=>`file '${r.file}'`).join('\n')+'\n');
const joined=run(['ffmpeg','-y','-f','concat','-safe','0','-i',path.join(chunks,'concat.txt'),'-i',path.join(dir,'public/music.m4a'),'-map','0:v:0','-map','1:a:0','-vf','scale=in_range=pc:out_range=tv','-pix_fmt','yuv420p','-color_range','tv','-c:v','libx264','-crf','18','-preset','fast','-af','volume=0.72','-c:a','aac','-b:a','192k','-t','60','-movflags','+faststart','-map_metadata','-1',output]);
if(joined.status!==0)throw new Error(joined.stderr||joined.error?.message||'Join failed');
const probe=run(['ffprobe','-v','error','-show_entries','format=duration,size','-show_entries','stream=codec_name,width,height,r_frame_rate,pix_fmt,color_range,sample_rate,channels,nb_frames','-of','json',output]);
if(probe.status!==0)throw new Error('Final probe failed');
const report={method:'10 contiguous six-second ranges of the same Remotion composition; one continuous original audio track',results,probe:JSON.parse(probe.stdout)};
writeFileSync(path.join(dir,'out/render-report.json'),JSON.stringify(report,null,2));
process.stdout.write(`Completed ${output}\n${probe.stdout}\n`);
