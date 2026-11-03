/**
 * Browser layout and input regression against a running local RealLoad server.
 *
 * node tests/layout-browser.mjs
 *
 * Optional environment variables:
 * PLAYWRIGHT_MODULE   npm module name or absolute path to Playwright's index.mjs
 * CHROME_EXECUTABLE   local Chrome/Chromium executable (otherwise bundled Chromium)
 * REALLOAD_URL        local test server URL, defaults to http://localhost:4202
 *
 * Screenshots and results are written to artifacts/layout. Every viewport uses
 * a fresh isolated context, preserving browser-local work in existing sessions.
 * Touch input uses Chromium CDP; this does not verify physical iOS/Android devices.
 */
import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {isAbsolute, resolve} from 'node:path';

const modulePath = process.env.PLAYWRIGHT_MODULE || 'playwright';
const moduleUrl = isAbsolute(modulePath) || modulePath.startsWith('.')
  ? pathToFileURL(resolve(modulePath)).href : modulePath;
const {chromium} = await import(moduleUrl);
const launchBrowser=()=>chromium.launch({
  headless:true,args:['--enable-unsafe-swiftshader'],
  ...(process.env.CHROME_EXECUTABLE ? {executablePath: process.env.CHROME_EXECUTABLE} : {})
});
let browser;
const baseUrl = process.env.REALLOAD_URL || 'http://localhost:4202';
const outputDir = process.env.LAYOUT_ARTIFACTS ? resolve(process.env.LAYOUT_ARTIFACTS) : fileURLToPath(new URL('../artifacts/layout/', import.meta.url));
await mkdir(outputDir, {recursive: true});
const results = [];

function assertInside(rect, width, height, label) {
  assert.ok(rect && rect.width > 0 && rect.height > 0, `${label} must be visible`);
  assert.ok(rect.x >= -1 && rect.x + rect.width <= width + 1, `${label} must fit horizontally`);
  assert.ok(rect.y >= -1 && rect.y + rect.height <= height + 1, `${label} must fit vertically`);
}

try {
  for (const [width, height] of [[320,568], [390,600], [820,500], [1366,720], [1440,900], [1920,1080]]) {
    browser=await launchBrowser();
    const context = await browser.newContext({
      viewport: {width, height}, isMobile: width < 600, hasTouch: width < 600
    });
    const page = await context.newPage();
    const errors = [];
    const result = {viewport: [width, height], errors};
    page.on('pageerror', error => errors.push(error.message));
    try {
      await page.goto(baseUrl, {waitUntil: 'networkidle'});
      if(await page.locator('#guide-dialog').evaluate(d=>d.open))await page.locator('#guide-skip').click();
      await page.screenshot({path: `${outputDir}/empty-${width}x${height}.png`, fullPage: true});
      assert.equal(await page.locator('.workspace-footer .stepper').isVisible(), false,
        'Legacy player must stay hidden');
      await page.locator('#pack-btn').click();
      await page.waitForFunction(() => document.getElementById('metric-count').textContent.startsWith('53'));
      result.packed = await page.evaluate(() => ({
        count: document.getElementById('metric-count').textContent,
        steps: document.querySelectorAll('.workflow-step').length,
        overflow: document.documentElement.scrollWidth - innerWidth
      }));
      assert.equal(result.packed.count, '53 / 53', 'Demo packing must preserve all units');
      assert.equal(result.packed.steps, 53, 'Every packed unit needs a numbered step');
      assert.ok(result.packed.overflow <= 1, 'Document must not overflow horizontally');
      const layout = await page.evaluate(() => ({
        stage: document.querySelector('#stage').getBoundingClientRect().toJSON(),
        player: document.querySelector('#workflow-play').getBoundingClientRect().toJSON(),
        steps: [...document.querySelectorAll('.workflow-step')].map(el => el.getBoundingClientRect().height),
        columns: getComputedStyle(document.querySelector('.layout')).display
      }));
      result.layout = layout;
      assert.ok(layout.steps.every(value => value <= 64), 'Long unit identifiers must not stretch the sequence');
      if (width > 1040) {
        assert.equal(layout.columns, 'grid', 'Wide low-height windows retain desktop columns');
        assert.ok(layout.player.top < height, 'Primary playback action must appear in the desktop first viewport');
      }

      // Wait for the temporary action notification to clear before visual QA.
      await page.locator('#message.visible').waitFor({state: 'hidden', timeout: 10000});
      await page.screenshot({path: `${outputDir}/packed-${width}x${height}.png`, fullPage: true});

      await page.locator('#stage').scrollIntoViewIfNeeded();
      result.scrollBefore = await page.evaluate(() => scrollY);
      const stage = await page.locator('#stage').boundingBox();
      assert.ok(stage && stage.height >= 200, 'Cargo scene must retain usable height');
      if (width < 600) {
        const cdp = await context.newCDPSession(page);
        const x = Math.round(stage.x + stage.width * .6);
        const y = Math.round(Math.min(height - 50, stage.y + stage.height * .8));
        await cdp.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [{x,y}]});
        for (let i=1; i<=8; i++) {
          await cdp.send('Input.dispatchTouchEvent', {type: 'touchMove', touchPoints: [{x,y:y-i*20}]});
          await page.waitForTimeout(25);
        }
        await cdp.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
        await cdp.detach();
      } else {
        await page.mouse.move(stage.x + stage.width * .6, stage.y + stage.height * .6);
        await page.mouse.wheel(0, 400);
      }
      if(width<760) await page.waitForFunction(before => scrollY > before, result.scrollBefore);
      else {
        const shell=await page.locator('#app').boundingBox();
        assertInside(shell,width,height,'Desktop workspace');
        assert.equal(await page.evaluate(()=>scrollY),result.scrollBefore,'Desktop workspace stays inside the viewport');
      }
      result.scrollAfter = await page.evaluate(() => ({
        y: scrollY, touchAction: getComputedStyle(document.querySelector('.view-cell')).touchAction
      }));

      if (width <= 1040) await page.locator(width<760?'#v117-library-toggle':'.rail-item[data-section=cargo]').click();
      result.library = await page.locator('#library').boundingBox();
      assert.ok(result.library && result.library.width > 0, 'Cargo library must be reachable');
      await page.locator('#add-sku').click();
      result.cargoDialog = await page.locator('#sku-dialog').boundingBox();
      assertInside(result.cargoDialog, width, height, 'Cargo editor');
      await page.locator('#sku-dialog-cancel').click();
      await page.locator(width<=1040?'#sidebar-import':'#import-btn').click();
      result.importDialog = await page.locator('#import-dialog').boundingBox();
      assertInside(result.importDialog, width, height, 'Import dialog');
      await page.keyboard.press('Escape');

      if(width<=1040)await page.locator('#library-return-scene').click();
      await page.locator('#editor-fullscreen').click();
      assert.ok(await page.locator('body').evaluate(body => body.classList.contains('v112-fullscreen')),
        'Fullscreen must activate');
      await page.locator('#fullscreen-playback').click();
      await page.locator('.workflow-settings > summary').click();
      await page.locator('#workflow-reset').scrollIntoViewIfNeeded();
      assert.ok(await page.locator('#workflow-reset').isVisible(), 'Player must remain reachable in fullscreen');
      await page.locator('.workflow-settings > summary').click();
      await page.locator('#fullscreen-cargo').click();
      result.fullscreenLibrary = await page.locator('#library').boundingBox();
      assertInside(result.fullscreenLibrary, width, height, 'Fullscreen cargo library');
      await page.keyboard.press('Escape');
      assert.deepEqual(errors, [], 'Browser must not raise application errors');
      result.passed = true;
    } catch (error) {
      result.passed = false;
      result.failure = error.message;
      await page.screenshot({path: `${outputDir}/failure-${width}x${height}.png`, fullPage: true}).catch(() => {});
    } finally {
      results.push(result);
      await context.close();await browser.close();
    }
  }
} finally {
  if(browser?.isConnected())await browser.close();
  await writeFile(`${outputDir}/results.json`, JSON.stringify({
    createdAt: new Date().toISOString(), baseUrl, engine: 'Chromium',
    touchInput: 'CDP synthesized touch, no physical device coverage', results
  }, null, 2));
}

for (const result of results) {
  console.log(`${result.passed ? 'PASS' : 'FAIL'} ${result.viewport.join('x')}${result.failure ? `: ${result.failure}` : ''}`);
}
if (results.some(result => !result.passed)) process.exitCode = 1;
