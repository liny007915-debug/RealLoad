import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const css=readFileSync(new URL('../src/v27.css',import.meta.url),'utf8');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const app=readFileSync(new URL('../src/app.mjs',import.meta.url),'utf8');
const renderer=readFileSync(new URL('../src/webgl.mjs',import.meta.url),'utf8');

test('responsive skin is loaded after earlier styles to override old fixed-height rules',()=>{
 assert.ok(html.indexOf('src/v27.css')>html.indexOf('src/v26.css'));
 assert.match(css,/body:not\(\.v112-fullscreen\) #app\{[^}]+height:auto!important/);
 assert.match(css,/overflow-y:auto!important/);
});
test('compact screens use document scroll rather than hidden workspace scroll',()=>{
 assert.match(css,/body:not\(\.v112-fullscreen\) \.workspace\{[^}]+overflow:visible!important/);
 assert.match(css,/body:not\(\.v112-fullscreen\) \.layout/);
 assert.match(css,/\.library:not\(\.collapsed\)\{[^}]+position:relative!important/);
});
test('the scene is displayed before secondary toolbars on compact screens',()=>{
 assert.match(css,/\.viewport-shell>\.stage\{order:0!important/);
 assert.match(css,/\.viewport-shell>\.viewport-toolbar\{order:1!important/);
});
test('compact stage wheel defaults to native document scroll',()=>{
 assert.match(app,/if\(!full&&!wantZoom\)return/);
 assert.match(renderer,/if\(!isFullscreen&&!zoomIntent\)return/);
});
test('quick controls are real functional buttons with accessible expand state',()=>{
 assert.match(html,/id="v117-library-toggle"[^>]+aria-controls="library"[^>]+aria-expanded="false"/);
 assert.match(app,/function setupV117\(/);
 assert.match(app,/\$\('v117-fit'\).*click\(\)/);
 assert.match(app,/\$\('v117-fullscreen'\).*click\(\)/);
});
