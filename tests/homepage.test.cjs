const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('official homepage links back to the ANIANI portal', () => {
    const html = fs.readFileSync('index.html', 'utf8');
    const portalUrl = 'https://donadonaa24-cyber.github.io/aniani-asobiba/';
    assert.ok((html.match(new RegExp(portalUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length >= 2);
    assert.match(html, /<nav class="header-nav">[\s\S]*?あにあにの遊び場[\s\S]*?<\/nav>/);
    assert.match(html, /<a class="link-card"[^>]*>[\s\S]*?<span class="link-title">あにあにの遊び場<\/span>/);
});
