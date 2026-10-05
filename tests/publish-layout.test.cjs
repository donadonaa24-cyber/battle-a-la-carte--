'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '..');

test('publish layout without docs or raw audio keeps every story/runtime/pack check and skips only authoring comparisons', async t => {
    const hidden = file => {
        const relative = path.relative(root, path.resolve(String(file))).replaceAll('\\', '/');
        return relative.startsWith('docs/') || /(?:^|\/)assets\/audio(?:\/|$)/.test(relative) || /\.mp3$/i.test(relative);
    };
    const portableFs = Object.create(fs), skipped = [];
    portableFs.existsSync = file => !hidden(file) && fs.existsSync(file);
    portableFs.readFileSync = (file, ...args) => {
        assert.equal(hidden(file), false, 'publish tests must not try to read omitted input: ' + path.relative(root, file));
        return fs.readFileSync(file, ...args);
    };
    portableFs.readdirSync = (file, ...args) => {
        assert.equal(hidden(file), false, 'publish tests must not enumerate omitted inputs');
        return fs.readdirSync(file, ...args);
    };
    let assertions = 0, executed = 0;
    // Assertions run in the host; normalize data containers across the VM boundary.
    // Preserve primitives, functions, buffers and typed arrays for their usual checks.
    const normalize = value => {
        if (Array.isArray(value)) return Array.from(value, normalize);
        if (value && Object.prototype.toString.call(value) === '[object Object]') {
            return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalize(item)]));
        }
        return value;
    };
    const countedAssert = new Proxy(assert, { get(target, key) {
        return typeof target[key] === 'function' ? (...args) => {
            assertions++;
            if (['deepEqual', 'deepStrictEqual', 'notDeepEqual', 'notDeepStrictEqual'].includes(key)) {
                args[0] = normalize(args[0]); args[1] = normalize(args[1]);
            }
            return target[key](...args);
        } : target[key];
    } });
    for (const file of ['story-adv.test.cjs', 'audio-pack.test.cjs']) {
        const cases = [], nativeRequire = createRequire(path.join(__dirname, file));
        vm.runInNewContext(fs.readFileSync(path.join(__dirname, file), 'utf8'), {
            __dirname, URL, URLSearchParams, Buffer, Blob, setTimeout, clearTimeout, require(name) {
                if (name === 'node:test') return (name, callback) => cases.push({ name, callback });
                if (name === 'node:fs') return portableFs;
                if (name === 'node:assert/strict') return countedAssert;
                return nativeRequire(name);
            }
        }, { filename: file });
        const context = name => ({
            skip: reason => { assert.match(reason, /(?:comparison|catalog)/i); skipped.push({ name, reason }); },
            test: async (child, callback) => { executed++; await callback(context(name + ' / ' + child)); }
        });
        for (const entry of cases) { executed++; await entry.callback(context(entry.name)); }
    }
    assert.ok(executed > 280, 'all runtime/playback/pack and viewer cases executed');
    assert.ok(assertions > 10000, 'runtime assertions remain active');
    assert.ok(skipped.some(item => item.reason.includes('tutorial-rewrite')));
    assert.ok(skipped.some(item => item.reason.includes('emphasis-changes')));
    assert.ok(skipped.some(item => item.reason.includes('story-fixes')));
    assert.ok(skipped.filter(item => item.reason.includes('assets/audio/')).length >= 17);
    assert.ok(skipped.every(item => /comparison|catalog/i.test(item.reason)));
    t.diagnostic(`Simulated publish layout: ${executed} cases, ${assertions} assertions; ${skipped.length} missing-input comparisons skipped, no omitted files read.`);
});
