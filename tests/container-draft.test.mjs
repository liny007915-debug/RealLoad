import test from 'node:test';
import assert from 'node:assert/strict';
import {linkedContainerDimensions,containerFieldErrors} from '../src/container-editing.mjs';
import {auditContainerSpec} from '../src/dimension-audit.mjs';

const box={L:5900,W:2352,H:2395,doorW:2340,doorH:2292,payload:28130};
test('linked door drafts preserve the entered frame margins without changing the input or another axis',()=>{
 const before=structuredClone(box),draft={...box,W:2200};
 const next=linkedContainerDimensions(box,draft,'W');
 assert.equal(next.doorW,2188);assert.equal(next.doorH,2292);assert.deepEqual(box,before);assert.equal(draft.doorW,2340);
 assert.equal(linkedContainerDimensions(box,{...box,H:2300},'H').doorH,2197);
 assert.equal(linkedContainerDimensions(box,{...box,W:2300.125},'W').doorW,2288.125);
});
test('linking a door never fabricates a positive aperture if the recorded frame cannot fit',()=>{
 const next=linkedContainerDimensions(box,{...box,W:10},'W');
 assert.equal(next.doorW,-2);assert.equal(auditContainerSpec(next).ok,false);assert.match(containerFieldErrors(next).doorW,/大于零/);
 assert.ok(Number.isNaN(linkedContainerDimensions(box,{...box,W:NaN},'W').W));
 assert.equal(linkedContainerDimensions(box,{...box,L:3000},'L').doorW,box.doorW);
});
test('container field errors identify the specific door and missing or invalid measurements',()=>{
 const errors=containerFieldErrors({...box,L:NaN,doorW:2400,doorH:2500,payload:-1});
 assert.deepEqual(Object.keys(errors).sort(),['L','doorW','doorH','payload'].sort());
 assert.match(errors.doorW,/2352/);assert.match(errors.doorH,/2395/);assert.equal(Object.keys(containerFieldErrors(box)).length,0);
});
test('short custom enclosures have no invented minimum aspect ratio, while real aperture bounds still apply',()=>{
 const shallow={L:400,W:2000,H:1800,doorW:1900,doorH:1700,payload:5000};
 assert.equal(auditContainerSpec(shallow).ok,true);
 assert.equal(auditContainerSpec({...shallow,doorW:2001}).ok,false);
 assert.equal(auditContainerSpec({...shallow,doorH:1801}).ok,false);
});
