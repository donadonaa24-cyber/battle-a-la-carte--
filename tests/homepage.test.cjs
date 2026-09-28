const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('official homepage links back to the ANIANI portal', () => {
    const html = fs.readFileSync('index.html', 'utf8');
    const portalUrl = 'https://donadonaa24-cyber.github.io/aniani-asobiba/';
    assert.ok((html.match(new RegExp(portalUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length >= 2);
    assert.match(html, /<nav class="header-nav"[^>]*>[\s\S]*?あにあにの遊び場[\s\S]*?<\/nav>/);
    assert.match(html, /<a class="link-card"[^>]*>[\s\S]*?<span class="link-title">あにあにの遊び場<\/span>/);
});

test('official homepage shows the current news, modes and Unity link', () => {
    const html = fs.readFileSync('index.html', 'utf8');
    assert.match(html, /<section id="news"/);
    assert.match(html, /<section id="demo"/);
    assert.match(html, /<section id="modes"/);
    assert.match(html, /先攻は1ターン目にイベントカードを使えません/);
    assert.match(html, /https:\/\/donadonaa24-cyber\.github\.io\/battle-a-la-carte-3d\//);
    assert.match(html, /home\.js\?v=/);
});

test('official homepage wording follows the owner rules', () => {
    const html = fs.readFileSync('index.html', 'utf8');
    assert.doesNotMatch(html, /スマホ/, 'use モバイル版 instead of スマホ版');
    assert.doesNotMatch(html, /先行して使用/);
    assert.doesNotMatch(html, /作品リンクを追加していけます/);
    assert.match(html, /モバイル版で遊ぶ/);
});

test('official homepage texts match the game data', () => {
    const html = fs.readFileSync('index.html', 'utf8');
    const cards = fs.readFileSync('cards.js', 'utf8');
    const state = fs.readFileSync('state.js', 'utf8');
    for (const match of cards.matchAll(/name: '([^']+)', cost: (\d), imageFile: '[^']+', description: '([^']+)'/g)) {
        assert.ok(html.includes(match[3]), `pack description for ${match[1]}`);
        assert.match(html, new RegExp(`${match[1]}</span><span class="menu-dots" aria-hidden="true"></span><span class="menu-price">${match[2]}点`));
    }
    for (const name of ['爆買い', '大掃除', '食材探索', '創作料理']) {
        const description = cards.match(new RegExp(`name: '${name}', count: \\d, description: '([^']+)'`))[1];
        assert.ok(html.includes(description), `event description for ${name}`);
    }
    for (const match of state.matchAll(/name: '([^']+)',\s*recommendStars: (\d),\s*recommendTag: '([^']+)',\s*condition: '([^']+)',\s*effect: '([^']+)'/g)) {
        const stars = '★'.repeat(Number(match[2])) + '☆'.repeat(3 - Number(match[2]));
        assert.ok(html.includes(`<span>${match[1]}</span>`), `skill ${match[1]}`);
        assert.ok(html.includes(stars), `stars for ${match[1]}`);
        assert.ok(html.includes(`条件：${match[4]}<br>効果：${match[5]}`), `skill text for ${match[1]}`);
    }
});

test('homepage assets referenced by index.html exist', () => {
    const html = fs.readFileSync('index.html', 'utf8') + fs.readFileSync('home.js', 'utf8');
    for (const match of html.matchAll(/assets\/[\w./-]+\.(?:png|webp)/g)) {
        assert.ok(fs.existsSync(match[0]), `missing ${match[0]}`);
    }
});
