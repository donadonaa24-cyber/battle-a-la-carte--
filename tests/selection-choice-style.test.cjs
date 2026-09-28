const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const css = fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8');

function declarationsFor(selector) {
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
    const rule = rules.find(([, selectors]) => selectors.split(',').some(item => item.trim() === selector));
    assert.ok(rule, `Missing CSS rule for ${selector}`);
    return Object.fromEntries([...rule[2].matchAll(/([\w-]+)\s*:\s*([^;]+);/g)]
        .map(([, name, value]) => [name, value.trim()]));
}

test('PC selection buttons keep dark text on light cards in every state', () => {
    const normal = declarationsFor('.selection-choice');
    assert.match(normal.color, /^#[\da-f]{6}$/i);
    const [red, green, blue] = normal.color.slice(1).match(/../g).map(hex => parseInt(hex, 16));
    assert.ok((red * 0.2126 + green * 0.7152 + blue * 0.0722) < 140,
        `Selection text must stay dark: ${normal.color}`);
    assert.equal(normal.background, '#fffdf8');
    assert.equal(normal.border, '2px solid #d8c3a0');

    const hover = declarationsFor('button.selection-choice:hover:not(:disabled)');
    assert.equal(hover.background, '#fffdf8');
    assert.ok(hover['border-color']);
    const active = declarationsFor('button.selection-choice.active:hover:not(:disabled)');
    assert.equal(active.background, '#effcf4');
    assert.equal(active['border-color'], '#26a65b');

    const disabled = declarationsFor('button.selection-choice:disabled');
    assert.equal(disabled.background, '#fffdf8');
    assert.equal(disabled.color, normal.color);
    assert.ok(declarationsFor('button.selection-choice:focus-visible').outline);
});
