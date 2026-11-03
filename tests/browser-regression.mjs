import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.REALLOAD_URL || process.env.TEST_URL || 'http://localhost:4202';
const output = resolve(process.env.TEST_ARTIFACTS || 'artifacts/browser');
await mkdir(output, {recursive: true});
const launchBrowser = () => chromium.launch({headless: true, args: ['--enable-unsafe-swiftshader'], ...(process.env.CHROME_EXECUTABLE ? {executablePath: process.env.CHROME_EXECUTABLE} : {})});
const results = [];
async function run(name, action, options = {}) {
  if(process.env.BROWSER_CASE&&!new RegExp(process.env.BROWSER_CASE).test(name))return;
  const browser=await launchBrowser();
  const context = await browser.newContext({viewport: {width: 1440, height: 900}, ...options});
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const errors = [];
  console.log('RUN', name);
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(base); await page.waitForLoadState('networkidle');
    await page.waitForSelector('#stage[data-playback-state]');
    if(await page.locator('#guide-dialog').evaluate(d=>d.open))await page.locator('#guide-skip').click();
    await action(page, context);
    assert.deepEqual(errors, [], '页面存在未处理脚本错误');
    results.push({name, passed: true}); console.log('PASS', name);
  } catch (error) {
    results.push({name, passed: false, error: error.message}); console.log('FAIL', name, error.message);
    await page.screenshot({path: resolve(output, `failure-${results.length}.png`), fullPage: true}).catch(() => {});
  } finally {await context.close();await browser.close();}
}
async function pack(page) {
  await page.locator('#pack-btn').click();
  await page.waitForFunction(() => document.querySelector('#metric-count').textContent === '53 / 53');
  assert.equal(await page.locator('.workflow-step').count(), 53);
}
async function waitState(page, state) {
  await page.waitForFunction(value => document.querySelector('#stage').dataset.playbackState === value, state);
}
await run('新手教程可重开，试放一件后可编辑', async page => {
  assert.equal(await page.locator('dialog[open]').count(), 0);
  await page.locator('#help-btn').click();
  assert.equal(await page.locator('#guide-progress button').count(),6);
  await page.locator('#guide-close').click();
  await page.locator('#sku-list [data-action=place]').first().click();
  assert.equal(await page.locator('#metric-count').textContent(), '1 / 53');
  await page.locator('#context-remove').click();
  assert.equal(await page.locator('#metric-count').textContent(), '0 / 53');
});
await run('示例53件可完成严格门洞装卸规划', async page => {
  await pack(page);
  await page.locator('#workflow-route-mode').selectOption('strict');
  assert.match(await page.locator('#workflow-model-note').textContent(), /固定 Y\/Z/);
  await page.screenshot({path: resolve(output, 'desktop-packed.png'), fullPage: true});
});
await run('实际位移、暂停稳定、继续与单步只提交一件', async page => {
  await pack(page);
  await page.locator('#workflow-next').click();
  await page.waitForFunction(() => Number(document.querySelector('#stage').dataset.motionProgress) > .15);
  assert.equal(await page.locator('#workflow-count').textContent(), '0 / 53 件');
  await page.locator('#workflow-play').click();
  await waitState(page, 'paused');
  const before = await page.locator('#stage').getAttribute('data-motion-progress');
  await page.waitForTimeout(220);
  assert.equal(await page.locator('#stage').getAttribute('data-motion-progress'), before);
  await page.locator('#workflow-play').click();
  await page.waitForFunction(() => Number(document.querySelector('#stage').dataset.playbackIndex) >= 1);
  assert.equal(await page.locator('#workflow-count').textContent(), '1 / 53 件');
  await waitState(page, 'paused');
  await page.locator('.workflow-settings > summary').click();
  await page.locator('#workflow-back').click();
  assert.equal(await page.locator('#workflow-count').textContent(), '0 / 53 件');
  await page.locator('#workflow-next').click();
  await page.waitForFunction(() => document.querySelector('#stage').dataset.playbackIndex === '1');
  await waitState(page, 'paused');
});
await run('53件装入与卸出完整播放，原方案不变', async page => {
  await pack(page);
  const original = await page.evaluate(() => JSON.parse(localStorage.getItem('realload-v117')).placements);
  await page.locator('#workflow-play').click(); await waitState(page, 'complete');
  assert.equal(await page.locator('#workflow-count').textContent(), '53 / 53 件');
  await page.locator('[data-playback-mode="unload"]').click();
  await page.locator('#workflow-play').click(); await waitState(page, 'complete');
  assert.equal(await page.locator('#workflow-count').textContent(), '53 / 53 件');
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('realload-v117')).placements), original);
  assert.equal(await page.locator('#metric-count').textContent(), '53 / 53');
  await page.locator('.workflow-settings > summary').click();
  await page.locator('#workflow-back').click();
  assert.equal(await page.locator('#workflow-count').textContent(), '52 / 53 件');
}, {reducedMotion: 'reduce'});
await run('卸出单件后可以继续主播放器，不误报剩余受阻', async page => {
  await pack(page);
  await page.locator('.rail-item[data-section="unload"]').click();
  await page.locator('[data-unload-take]:not([disabled])').first().click();
  await page.waitForFunction(() => document.querySelector('#stage').dataset.playbackIndex === '1');
  await waitState(page, 'paused');
  assert.equal(await page.locator('#workflow-next').isEnabled(), true);
  assert.doesNotMatch(await page.locator('#workflow-status').textContent(), /受阻/);
  await page.locator('#workflow-next').click();
  await page.waitForFunction(() => document.querySelector('#stage').dataset.playbackIndex === '2');
  await waitState(page, 'paused');
}, {reducedMotion: 'reduce'});
await run('播放中重新装柜和切换模块会彻底取消旧动画', async page => {
  await pack(page); await page.locator('#workflow-play').click();
  await page.locator('#pack-btn').click();
  await waitState(page, 'idle');
  await page.waitForTimeout(250);
  assert.equal(await page.locator('#stage').getAttribute('data-motion-id'), '');
  assert.equal(await page.locator('#metric-count').textContent(), '53 / 53');
  await page.locator('#workflow-play').click();
  await page.locator('.rail-item[data-section="container"]').click();
  await waitState(page, 'idle');
});
await run('输入框与按钮的快捷键不会误改场景', async page => {
  await page.locator('#sku-list [data-action=place]').first().click();
  await page.locator('.rail-item[data-section=free]').click();
  await page.locator('#free-mode-select').click();
  await page.locator('#free-loaded-search').fill('hfr123');
  assert.equal(await page.locator('#metric-count').textContent(), '1 / 53');
  await page.locator('#free-loaded-search').press('Backspace');
  assert.equal(await page.locator('#metric-count').textContent(), '1 / 53');
  await page.locator('#help-btn').click();
  await page.locator('#guide-close').focus();
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('dialog[open]').count(), 0);
  assert.equal(await page.locator('#help-btn').evaluate(el => el === document.activeElement), true);
});
await run('货物新增、验证、撤销和重做', async page => {
  await page.locator('#add-sku').click();
  const form = page.locator('#sku-form');
  for (const [key, value] of Object.entries({id:'QA-ONE',name:'回归测试纸箱',L:'500',W:'400',H:'300',weight:'12',qty:'2',stackLimit:'2'})) await form.locator(`[name="${key}"]`).fill(value);
  await form.locator('[type="submit"]').click();
  assert.match(await page.locator('#sku-total').textContent(), /5/);
  await page.locator('#global-overflow summary').click(); await page.locator('#undo-btn').click();
  assert.match(await page.locator('#sku-total').textContent(), /4/);
  await page.locator('#global-overflow summary').click(); await page.locator('#redo-btn').click();
  assert.match(await page.locator('#sku-total').textContent(), /5/);
});
await run('导出JSON与CSV及真实JSON回导', async page => {
  await pack(page);
  await page.locator('#global-overflow summary').click(); await page.locator('#export-btn').click();
  const jsonDownload = page.waitForEvent('download'); await page.locator('#export-json').click();
  const download = await jsonDownload, path = resolve(output, 'roundtrip.json'); await download.saveAs(path);
  await page.locator('#import-btn').click();
  await page.locator('#import-sheet-file').setInputFiles(path);
  await page.waitForFunction(() => !document.querySelector('#import-dialog').open);
  assert.equal(await page.locator('#metric-count').textContent(), '53 / 53');
  await page.locator('#global-overflow summary').click(); await page.locator('#export-btn').click();
  const csvDownload = page.waitForEvent('download'); await page.locator('#export-csv').click();
  assert.match((await csvDownload).suggestedFilename(), /\.csv$/);
});
await run('CSV模板导入经过映射与确认，不直接覆盖原方案', async page => {
  await page.locator('#import-btn').click();
  await page.locator('#import-sheet-file').setInputFiles({name:'qa.csv',mimeType:'text/csv',buffer:Buffer.from('SKU,货物名称,长度mm,宽度mm,高度mm,毛重kg,数量,最大层数\nQA-CSV,测试纸箱,500,400,300,12,3,2\n')});
  await page.waitForSelector('#import-map-pane:not(.hidden)');
  if (await page.locator('#import-units-confirm').isVisible()) await page.locator('#import-units-confirm').check();
  await page.locator('#import-next').click();
  await page.waitForSelector('#import-review-pane:not(.hidden)');
  assert.match(await page.locator('#import-summary').textContent(), /1/);
  await page.locator('#import-confirm').click();
  await page.waitForFunction(() => !document.querySelector('#import-dialog').open);
  assert.match(await page.locator('#sku-total').textContent(), /5/);
});
await run('点击编号步骤暂停并回看对应箱件，不再高亮旧动画', async page => {
  await pack(page);
  await page.locator('#workflow-play').click();
  await page.locator('#workflow-sequence-panel > summary').click();
  const target = page.locator('.workflow-step').nth(4);
  const id = await target.getAttribute('data-playback-id');
  await target.click();
  await waitState(page, 'paused');
  assert.equal(await page.locator('#stage').getAttribute('data-playback-index'), '5');
  assert.equal(await page.locator('#stage').getAttribute('data-motion-id'), '');
  assert.ok((await page.locator('#selection-action-title').textContent()).includes(id));
  await page.locator('[data-playback-mode="unload"]').click();
  await page.locator('.workflow-step').nth(4).click();
  await waitState(page, 'paused');
  assert.equal(await page.locator('#stage').getAttribute('data-playback-index'), '4');
});
await run('大订单达到计算上限后仍准确显示未装件数', async page => {
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('realload-v117'));
    state.skus = [{...state.skus[0], id:'LIMIT-QA', name:'上限回归纸箱', L:100, W:100, H:100, weight:1, qty:1000, stackLimit:1, numbering:undefined}];
    state.placements = []; state.selectedSku = 'LIMIT-QA';
    localStorage.setItem('realload-v117', JSON.stringify(state));
  });
  await page.reload(); await page.waitForSelector('#stage[data-playback-state]');
  await page.locator('#pack-btn').click();
  await page.waitForFunction(() => document.querySelector('#metric-count').textContent === '180 / 1000');
  assert.match(await page.locator('#message').textContent(), /未装 820 件/);
  assert.match(await page.locator('#message').textContent(), /最多计算 180 件/);
});
await run('常用工具与更多工具的键盘开合，步骤导航可浏览完整队列', async page => {
  await pack(page);
  const more = page.locator('#viewport-more');
  await more.locator('summary').focus(); await page.keyboard.press('Enter');
  assert.equal(await more.getAttribute('open'), '');
  await page.locator('#display-settings').click();
  assert.equal(await more.getAttribute('open'), null);
  assert.equal(await page.locator('#display-pop').isVisible(), true);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#display-pop').isVisible(), false);
  await page.locator('#workflow-sequence-panel > summary').click();
  assert.equal(await page.locator('#workflow-scroll-back').isDisabled(), true);
  await page.locator('#workflow-scroll-next').click();
  await page.waitForFunction(() => document.querySelector('#workflow-steps').scrollLeft > 100);
  assert.equal(await page.locator('#workflow-scroll-back').isEnabled(), true);
  await page.locator('#workflow-scroll-back').click();
  await page.waitForFunction(() => document.querySelector('#workflow-steps').scrollLeft < 2);
  const colour = await page.locator('button[data-playback-mode="load"]').evaluate(el => getComputedStyle(el).backgroundColor);
  assert.notEqual(colour, 'rgba(0, 0, 0, 0)', 'selected direction needs a visible background');
});
await run('手机外观按需展开，标题入口可抵达货物清单', async page => {
  const appearance = page.locator('#container-appearance');
  assert.equal(await appearance.getAttribute('open'), null);
  await appearance.locator('summary').click();
  await page.locator('[data-shell="ghost"]').waitFor({state:'visible'});
  assert.equal(await page.locator('[data-shell="ghost"]').isVisible(), true);
  await page.locator('[data-shell="hidden"]').click();
  assert.equal(await page.locator('[data-shell="hidden"]').getAttribute('aria-pressed'), 'true');
  await page.locator('#container-appearance-close').click();
  await page.locator('#v117-library-toggle').click();
  assert.equal(await page.locator('#add-sku').isVisible(), true);
  assert.equal(await page.locator('.cargo-management').getAttribute('open'), null);
  await page.locator('.cargo-management > summary').click();
  assert.equal(await page.locator('#group-filter').isVisible(), true);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
}, {viewport:{width:390,height:600},isMobile:true,hasTouch:true});
await writeFile(resolve(output, 'results.json'), JSON.stringify({testedAt:new Date().toISOString(),engine:'Installed Chrome, headless',results}, null, 2));
console.log(`${results.filter(r=>r.passed).length}/${results.length} browser scenarios passed`);
if (results.some(r=>!r.passed)) process.exitCode = 1;
