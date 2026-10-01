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

function pcTree() {
    const html = fs.readFileSync(path.join(__dirname, '../web.html'), 'utf8');
    const stack = [];
    const ids = new Map();
    const voidTags = new Set(['meta', 'link', 'input', 'img', 'br', 'hr', 'source']);
    for (const match of html.matchAll(/<(\/)?([a-z][a-z0-9-]*)\b([^>]*)>/gi)) {
        const [, close, tag, attrs] = match;
        if (close) { assert.equal(stack.pop()?.tag, tag, `balanced ${tag}`); continue; }
        const id = /\bid="([^"]+)"/.exec(attrs)?.[1];
        if (id) {
            assert.ok(!ids.has(id), `unique #${id}`);
            ids.set(id, { ancestors: stack.map(node => node.id).filter(Boolean), attrs });
        }
        if (!voidTags.has(tag)) stack.push({ tag, id });
    }
    assert.equal(stack.length, 0);
    return { html, ids };
}

test('PC field has three rows, piles beside player set and a separate bounded story strip', () => {
    const { html, ids } = pcTree();
    const regions = ['pc-opponent-field', 'pc-player-field', 'pc-hand-actions'];
    assert.deepEqual([...ids].filter(([, node]) => node.ancestors.at(-1) === 'pc-battle-field').map(([id]) => id), regions);
    for (const [id, region] of [
        ['cpu-hud-name', regions[0]], ['cpu-hand-mixed', regions[0]], ['cpu-set', regions[0]],
        ['cpu-packs', regions[0]], ['cpu-latest-dish', regions[0]],
        ['deck-pile-button', regions[1]], ['discard-pile-button', regions[1]],
        ['player-hud-name', regions[1]], ['player-set', regions[1]], ['player-packs', regions[1]],
        ['player-latest-dish', regions[1]], ['player-hand-mixed', regions[2]],
        ['cook-button', regions[2]], ['player-skill-button', regions[2]],
        ['end-turn-button', regions[2]], ['confirm-discard-button', regions[2]],
        ['final-field-actions', regions[2]], ['final-field-exit-button', regions[2]], ['show-match-result-button', regions[2]]
    ]) assert.ok(ids.get(id)?.ancestors.includes(region), `#${id} in #${region}`);
    assert.ok(!ids.has('pc-shared-field'));
    assert.ok(ids.get('realtime-log-panel').ancestors.includes('pc-top-bar'));
    assert.equal(ids.get('story-hud-panel').ancestors.at(-1), 'game-container');
    assert.ok(html.indexOf('id="story-hud-panel"') < html.indexOf('id="pc-battle-field"'));
    for (const id of ['player-set', 'cpu-set']) assert.match(ids.get(id).attrs, /data-set-slots="3"/);
    assert.match(ids.get('pc-pile-zone').attrs, /class="center-panel panel-box"/);
    for (const id of ['deck-pile-button', 'discard-pile-button']) assert.ok(ids.get(id).ancestors.includes('pc-pile-zone'));
    assert.match(ids.get('player-set').ancestors.at(-1), /pc-player-field/);
    assert.ok(ids.get('mission-banner').ancestors.includes('pc-top-bar'));
    assert.ok(!ids.get('final-field-actions').ancestors.includes('pc-battle-actions'),
        'final actions remain separate from active-turn controls');
    assert.equal(ids.get('candidate-recipes-panel').ancestors.at(-1), 'game-container');
    assert.match(ids.get('candidate-recipes-panel').attrs, /aria-modal="true"/);
    assert.match(ids.get('candidate-recipes-panel').attrs, /\bhidden\b/);
    assert.ok(!ids.get('candidate-recipes-actions').ancestors.includes('candidate-recipes'));
    assert.doesNotMatch(html, /class="side-panel|class="bottom-info-grid/);
    assert.match(html, /style\.css\?v=20261001-discard1/);
    assert.match(html, /render\.js\?v=20261001-discard1/);
    assert.match(ids.get('cpu-hand-mixed').attrs, /data-hand-fan="true"/);
    assert.ok(ids.get('cpu-hand-heading').ancestors.includes('pc-opponent-field'));
    assert.ok(html.indexOf('class="panel-box cpu-set-zone"') < html.indexOf('class="panel-box cpu-hand-zone"'),
        'opponent set aligns above player set; opponent hand aligns above piles');
});

test('PC preserves key IDs used by game, story, missions, confirmations and online screens', () => {
    const { ids } = pcTree();
    const required = `app-stage game-container turn-indicator phase-indicator cpu-status
        mission-banner discard-banner player-hud-name player-side-score player-skill-name player-skill-state
        player-hand-mixed player-set player-packs player-latest-dish cpu-hud-name cpu-side-score
        cpu-skill-name cpu-skill-state cpu-hand-mixed cpu-set cpu-packs cpu-latest-dish
        deck-pile-button deck-count discard-pile-button discard-count candidate-recipes
        realtime-log-panel realtime-log-list cook-button player-skill-button confirm-discard-button end-turn-button
        open-recipes-tab open-events-tab open-packs-tab open-rules-tab open-log-tab open-settings-tab
        battle-menu-button battle-menu-panel open-surrender-button surrender-dialog surrender-question
        confirm-surrender-button cancel-surrender-button modal-input-backdrop
        selection-panel selection-title selection-description selection-options selection-confirm-button selection-cancel-button
        set-confirm-panel set-confirm-description set-confirm-yes-button set-confirm-no-button
        ingredient-action-panel ingredient-action-title ingredient-action-description ingredient-combo-list
        ingredient-action-set-button ingredient-action-combo-button ingredient-action-back-button ingredient-action-close-button
        event-confirm-panel event-confirm-description event-confirm-yes-button event-confirm-no-button
        skill-confirm-panel skill-confirm-name skill-confirm-condition skill-confirm-effect skill-confirm-usage
        skill-confirm-status skill-confirm-yes-button skill-confirm-no-button set-view-panel set-view-description set-view-close-button
        pile-view-panel pile-view-title pile-view-description pile-view-list pile-view-close-button
        end-turn-confirm-panel end-turn-confirm-description end-turn-confirm-yes-button end-turn-confirm-no-button
        dish-history-panel dish-history-title dish-history-description dish-history-list dish-history-close-button
        info-overlay info-overlay-title info-overlay-content info-overlay-close-button
        pack-shop-overlay pack-shop-list pack-shop-close-button pack-confirm-panel pack-confirm-description
        pack-confirm-yes-button pack-confirm-no-button board-cycle-overlay board-cycle-panel board-cycle-title
        board-cycle-description board-cycle-reason board-cycle-start-button board-cycle-close-button
        recipe-hints-overlay recipe-hints-list recipe-hints-close-button
        result-overlay result-text result-mission result-field-button result-exit-button result-retry-button
        final-field-exit-button show-match-result-button start-overlay start-menu-stage
        menu-cpu-button menu-story-button menu-friend-button menu-rules-button menu-gallery-button menu-user-button
        start-cpu-setup-stage start-setup-button start-character-step start-skill-step start-skill-list
        start-turn-stage start-turn-card-left start-turn-card-right start-story-stage story-episode-list
        story-hud-panel story-hud-title story-hud-note story-hud-objectives story-dialogue-panel
        story-dialogue-text story-speaker-name story-speaker-icon story-line-progress story-primary-button
        story-secondary-button story-battle-guide story-objective-note story-objective-list start-story-back-button
        mission-section mission-list mission-account-note start-mission-opponent
        sleeve-picker start-friend-stage friend-passphrase-input friend-create-button friend-join-button
        friend-private-toggle friend-search-public-button friend-public-room-list friend-room-message
        start-friend-back-button`.trim().split(/\s+/);
    for (const id of required) assert.ok(ids.has(id), `kept #${id}`);
});
