const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { computeStageScale, screenToStage, rectToStage } = require('../stage-layout.js');

test('PC and mobile declare their fixed logical stages', () => {
    const root = path.resolve(__dirname, '..');
    const pc = fs.readFileSync(path.join(root, 'web.html'), 'utf8');
    const mobile = fs.readFileSync(path.join(root, 'mobile/mobile.html'), 'utf8');
    assert.match(pc, /id="app-stage" data-stage-width="1440" data-stage-height="810"/);
    assert.match(mobile, /id="app-stage" data-stage-width="432" data-stage-height="768"/);
    assert.match(pc, /<\/div>\s*<script src="stage-layout\.js\?v=20260929-ui1"/);
    assert.match(mobile, /<\/div>\s*<script src="\.\.\/stage-layout\.js\?v=20260929-ui1"/);
});

test('uniform scale fits both dimensions and can grow', () => {
    assert.equal(computeStageScale({ width: 720, height: 600 }, { width: 1440, height: 810 }), 0.5);
    assert.equal(computeStageScale({ width: 2160, height: 1620 }, { width: 1440, height: 810 }), 1.5);
    assert.equal(computeStageScale({ width: 390, height: 700 }, { width: 432, height: 768 }), 390 / 432);
});

test('screen point and rectangle map into stage coordinates', () => {
    const stageRect = { left: 40, top: 90 };
    assert.deepEqual(screenToStage({ x: 140, y: 240 }, stageRect, 0.5), { x: 200, y: 300 });
    assert.deepEqual(rectToStage({ left: 90, top: 140, width: 35, height: 60 }, stageRect, 0.5),
        { left: 100, top: 100, width: 70, height: 120, right: 170, bottom: 220 });
    assert.equal(rectToStage(null, stageRect, 0.5), null);
});
