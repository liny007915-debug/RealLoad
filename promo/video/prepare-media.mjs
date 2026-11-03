import {readFile,writeFile,copyFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
import {createHash} from 'node:crypto';
const root=dirname(fileURLToPath(import.meta.url));
const capture=resolve(root,'../capture');
const cli=resolve(root,'node_modules/@remotion/cli/remotion-cli.js');
const entries=[
 ['01-fullscreen-orbit.webm','orbit.mp4',2.9,7.4],
 ['02-precise-cargo-edit.webm','movement.mp4',2.9,6.4],
 ['06-independent-physical-specifications.webm','specifications.mp4',4.6,7.7],
 ['03-shell-opacity-and-doors.webm','shell.mp4',3,8.8],
 ['04-shared-coordinate-four-views.webm','views.mp4',2.45,9.8],
 ['05-ordered-load-and-unload.webm','unloading.mp4',15.7,11],
];
const records=[];
for(const [input,output,start,duration] of entries){
 const r=spawnSync(process.execPath,[cli,'ffmpeg','-y','-ss',String(start),'-i',resolve(capture,input),'-t',String(duration),'-an','-map_metadata','-1','-c:v','libx264','-preset','medium','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart',resolve(root,'public',output)],{cwd:root,encoding:'utf8',maxBuffer:10*1024*1024});
 if(r.status!==0)throw Error(r.stderr||r.stdout);
 records.push({source:input,output,startSeconds:start,durationSeconds:duration,sourceSha256:createHash('sha256').update(await readFile(resolve(capture,input))).digest('hex')});
 console.log('Prepared '+output);
}
const audio=spawnSync(process.execPath,[cli,'ffmpeg','-y','-i',resolve(root,'../audio/realload-product-60s.wav'),'-map_metadata','-1','-c:a','aac','-b:a','192k','-f','mp4',resolve(root,'public/music.m4a')],{cwd:root,encoding:'utf8',maxBuffer:10*1024*1024});
if(audio.status!==0)throw Error(audio.stderr||audio.stdout);
await copyFile(resolve(capture,'hero-clean.png'),resolve(root,'public/hero.png'));
await writeFile(resolve(root,'media-production.json'),JSON.stringify({source:'RealLoad Studio 1.27 Beta1, real isolated browser capture',fixture:'examples/v127-beta-mixed-specs.json',syntheticData:true,captureFps:25,compositionFps:30,clips:records,audio:'Original procedural score, no third-party samples',retimedClips:true},null,2)+'\n');
