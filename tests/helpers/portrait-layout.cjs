'use strict';
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const css = fs.readFileSync(path.join(root, 'story-adv.css'), 'utf8');
// Evaluate the shipped CSS arithmetic, rather than copying its numeric formula.
function declaration(selector, property, source = css) {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const matchSelector = new RegExp('(?:^|\\n)[ \\t]*' + escaped + ' \\{').exec(source);
    if (!matchSelector) throw Error('Missing CSS selector: ' + selector);
    const start = source.indexOf(selector, matchSelector.index);
    const block = source.slice(start, source.indexOf('}', start)).replace(/\/\*[\s\S]*?\*\//g, '');
    const match = block.match(new RegExp('(?:[;{]\\s*)' + property + ':\\s*([^;]+);'));
    if (!match) throw Error('Missing CSS declaration: ' + property);
    return match[1];
}
function evaluate(source, variables, viewport, percent = viewport[0]) {
    let text = source;
    while (text.includes('var(')) {
        const start = text.lastIndexOf('var('); let end = start + 4, depth = 1;
        for (; end < text.length; end++) { if (text[end] === '(') depth++; if (text[end] === ')' && --depth === 0) break; }
        const args = text.slice(start + 4, end), comma = args.indexOf(','), key = (comma < 0 ? args : args.slice(0, comma)).trim();
        const value = variables[key] ?? (comma < 0 ? undefined : args.slice(comma + 1).trim());
        if (value === undefined) throw Error('Undefined CSS variable: ' + key);
        text = text.slice(0, start) + '(' + evaluate(String(value), variables, viewport, percent) + ')' + text.slice(end + 1);
    }
    text = text.replace(/(\d+(?:\.\d+)?|\.\d+)(dvh|vh|vw|cqw|px|%)/g, (_, n, unit) => String(Number(n) * ({ dvh: viewport[1] / 100, vh: viewport[1] / 100, vw: viewport[0] / 100, cqw: percent / 100, px: 1, '%': percent / 100 })[unit]));
    if (!/^[\d\s.,()+*/a-z-]+$/.test(text)) throw Error('Unsupported CSS arithmetic: ' + text);
    const calc = n => n, min = Math.min, max = Math.max, clamp = (lo, value, hi) => Math.max(lo, Math.min(value, hi));
    return Function('calc', 'min', 'max', 'clamp', 'return (' + text + ')')(calc, min, max, clamp);
}
const context = { document: { currentScript: null } }; context.window = context;
for (const file of ['portrait-metrics.js', 'characters.js']) vm.runInNewContext(fs.readFileSync(path.join(root, 'story-data', file), 'utf8'), context);
const assets = context.BattleStoryAssets;
function styleFor(id, pose = 'default') {
    const style = {}; assets.applyPortraitMetrics({ style: { setProperty: (name, value) => style[name] = value } }, id, pose); return style;
}
function geometry(id, viewport, { toolbar = viewport[0] <= 600 ? 102 : 66, dialogue = viewport[1] <= 500 ? 161.7 : viewport[0] <= 600 ? 226 : 272, position = 'center', arc = false, style, pose = 'default' } = {}) {
    const [width, height] = viewport, mobile = width <= 600, landscape = height <= 500 && width > height;
    const metric = assets.portraitMetrics(id, pose), variables = { ...(style || styleFor(id, pose)) }, gap = landscape ? 8 : 14;
    const dialogueTop = height - dialogue - gap;
    let localWidth = width, top, imageHeight, x;
    if (arc) {
        const columns = mobile ? 3 : 6, gridGap = Math.max(6, Math.min(width * .012, 18));
        const gridWidth = Math.min(mobile ? width - 32 : width - 48, mobile ? 450 : 1100);
        localWidth = (gridWidth - (columns - 1) * gridGap) / columns - 2;
        variables['--adv-frame-height'] = landscape ? '100px' : mobile ? 'clamp(100px, 20vh, 180px)' : declaration('.adv-arc-portrait-frame', '--adv-frame-height');
        variables['--adv-head-height'] = declaration('.adv-arc-portrait-frame', '--adv-head-height');
        imageHeight = evaluate(declaration('.adv-arc-portrait-frame img', 'height'), variables, viewport, localWidth);
        top = evaluate(declaration('.adv-arc-portrait-frame img', 'top'), variables, viewport, localWidth);
        x = localWidth / 2;
    } else {
        variables['--adv-toolbar-height'] = toolbar + 'px'; variables['--adv-dialogue-top'] = dialogueTop + 'px';
        for (const key of ['--adv-stage-height', '--adv-head-height', '--portrait-height']) variables[key] = declaration('.adv-portrait', key);
        variables['--adv-position'] = ({ center: 50, left: mobile ? 28 : 25, right: mobile ? 72 : 75, farLeft: 12, farRight: 88 })[position] + '%';
        imageHeight = evaluate(declaration('.adv-portrait', 'height'), variables, viewport);
        top = evaluate(declaration('.adv-portrait', 'top'), variables, viewport);
        x = evaluate(declaration('.adv-portrait', 'left'), variables, viewport);
    }
    const scale = imageHeight / metric.canvas.height, sx = imageHeight * metric.renderCanvas.width / metric.renderCanvas.height / metric.canvas.width;
    const imageLeft = x - sx * metric.head.centerX;
    return { headHeight: scale * metric.head.height, hairTop: top + scale * metric.head.top, chin: top + scale * metric.head.chin, eyeLine: top + scale * metric.head.eyeLine,
        headLeft: imageLeft + sx * metric.head.left, headRight: imageLeft + sx * (metric.head.right + 1), imageHeight, imageTop: top, toolbar, dialogueTop,
        width: localWidth, frameHeight: arc ? evaluate(variables['--adv-frame-height'], variables, viewport, localWidth) : height };
}
// The bust proof reads the shipped opt-in rules, including the portrait-phone overrides.
const bustSelector = '.story-adv[data-portrait-style="bust"]';
const bustSource = css.slice(css.indexOf('/* Episode opt-in:'));
const phoneStart = bustSource.indexOf('@media (max-width: 600px) and (orientation: portrait)');
const bustBase = bustSource.slice(0, phoneStart), bustPhone = bustSource.slice(phoneStart);
function bustDeclaration(selector, property, phone = false) {
    if (phone) {
        try { return declaration(selector, property, bustPhone); } catch (_) { /* inherit desktop */ }
    }
    return declaration(selector, property, bustBase);
}
function bustLayout(viewport, { toolbar = viewport[0] <= 600 ? 102 : 66, narration = false } = {}) {
    const [width, height] = viewport, phone = width <= 600 && height > width, landscape = height <= 500 && width > height;
    const phoneRules = css.slice(css.indexOf('@media (max-width: 600px) {\n    .adv-arc-portraits'));
    const shortRules = css.slice(css.indexOf('@media (max-height: 500px) and (orientation: landscape) {'));
    const variables = { '--adv-toolbar-height': toolbar + 'px',
        '--adv-text-size': declaration('.story-adv', '--adv-text-size', landscape ? shortRules : phone ? phoneRules : css),
        '--adv-leading': declaration('.story-adv', '--adv-leading', landscape ? shortRules : phone ? phoneRules : css) };
    for (const key of ['--adv-bust-head-height', '--adv-bust-speaker-top', '--adv-bust-width', '--adv-bust-gap', '--adv-bust-dialogue-height', '--adv-bust-text-top'])
        variables[key] = bustDeclaration(bustSelector, key, phone);
    const calc = (value, percent = width) => evaluate(value, variables, viewport, percent);
    const dialogueHeight = calc(variables['--adv-bust-dialogue-height']), dialogueTop = height - dialogueHeight;
    variables['--adv-dialogue-top'] = dialogueTop + 'px'; variables['--adv-dialogue-height'] = dialogueHeight + 'px';
    const border = phone ? 3 : 4;
    // Box sizing is border-box; these are the actual content bounds, independent of text length.
    const textLeft = narration || phone ? 12 : calc('calc(var(--adv-bust-width) + var(--adv-bust-gap))');
    const textTop = narration && phone ? 12 : calc(variables['--adv-bust-text-top']);
    const rect = (left, top, right, bottom) => ({ left, top, right, bottom, width: right - left, height: bottom - top });
    return { width, height, phone, toolbar, variables, calc, border, dialogueTop,
        dialogue: rect(0, dialogueTop, width, height),
        text: rect(border + textLeft, dialogueTop + border + textTop, width - border - 12, height - border - 8),
        nameLeft: border + (narration ? 12 : calc('calc(var(--adv-bust-width) + var(--adv-bust-gap))')),
        lineHeight: calc('calc(var(--adv-text-size) * var(--adv-leading))'),
        z: { parent: bustDeclaration(bustSelector + ' .adv-portraits', 'z-index'),
            speaker: Number(bustDeclaration(bustSelector + ' .adv-portrait.speaking', 'z-index')),
            listener: Number(bustDeclaration(bustSelector + ' .adv-portrait', 'z-index')),
            dialogue: Number(bustDeclaration(bustSelector + ' .adv-dialogue', 'z-index')) } };
}
function bustGeometry(id, viewport, { side = 'left', dimmed = false, pose = 'default', ...options } = {}) {
    const layout = bustLayout(viewport, options), { width, height, phone, dialogueTop, border } = layout;
    const metric = assets.portraitMetrics(id, pose), variables = { ...layout.variables, ...styleFor(id, pose) };
    const portrait = bustSelector + ' .adv-portrait', img = portrait + ' img';
    const property = key => dimmed && ['--adv-bust-factor', '--adv-bust-top', 'width', 'bottom'].includes(key) ?
        bustDeclaration(portrait + '.dimmed', key, phone) : bustDeclaration(portrait, key, phone);
    for (const key of ['--adv-bust-factor', '--adv-head-height', '--portrait-height', '--adv-bust-top']) variables[key] = property(key);
    const calc = (value, percent = width) => evaluate(value, variables, viewport, percent);
    const frameWidth = calc(property('width')), frameTop = calc(property('top')), frameBottom = height - calc(property('bottom'), height);
    const frameLeft = side === 'right' ? width - frameWidth : 0;
    const imageHeight = calc(bustDeclaration(img, 'height')), imageTop = frameTop + calc(bustDeclaration(img, 'top'));
    const imageLeft = frameLeft + calc(bustDeclaration(img, 'left'), frameWidth);
    const scale = imageHeight / metric.canvas.height, sx = imageHeight * metric.renderCanvas.width / metric.renderCanvas.height / metric.canvas.width;
    const hairTop = imageTop + scale * metric.head.top, chin = imageTop + scale * metric.head.chin;
    const headLeft = imageLeft + sx * metric.head.left, headRight = imageLeft + sx * (metric.head.right + 1);
    // Conservatively reserve the whole clipped portrait frame, not only opaque pixels.
    const visible = { left: frameLeft, top: frameTop, right: frameLeft + frameWidth, bottom: Math.min(frameBottom, dimmed ? dialogueTop : height) };
    return { headHeight: scale * metric.head.height, hairTop, chin, eyeLine: imageTop + scale * metric.head.eyeLine, headLeft, headRight,
        cropTop: frameTop, cropBottom: frameBottom, cropLeft: frameLeft, cropRight: frameLeft + frameWidth,
        visibleBottom: visible.bottom, visible, face: { left: headLeft, top: hairTop, right: headRight, bottom: chin },
        dialogueTop, textLeft: layout.text.left, textTop: layout.text.top, text: layout.text, nameLeft: layout.nameLeft,
        width, height, toolbar: layout.toolbar, imageHeight, imageTop, imageLeft, z: dimmed ? layout.z.listener : layout.z.speaker,
        layout: { dialogue: layout.dialogue, text: layout.text, lineHeight: layout.lineHeight, z: layout.z, phone } };
}
// Use the actual icon crop implementation, not a second copy of its math.
vm.runInNewContext(fs.readFileSync(path.join(root, 'story-adv.js'), 'utf8').replace(/\}\)\(window\);\s*$/,
    'root.__applyIconMetrics = applyIconMetrics;\n})(window);'), context);
const iconSelector = '.story-adv[data-portrait-style="icon"]';
const iconSource = css.slice(css.indexOf('/* Icon trial:'), css.indexOf('/* Episode opt-in:'));
const iconPhoneStart = iconSource.indexOf('@media (max-width: 600px)'), iconShortStart = iconSource.indexOf('@media (max-height: 500px)');
const iconBase = iconSource.slice(0, iconPhoneStart), iconPhone = iconSource.slice(iconPhoneStart, iconShortStart), iconShort = iconSource.slice(iconShortStart);
function iconDeclaration(selector, property, viewport) {
    const override = viewport[1] <= 500 && viewport[0] > viewport[1] ? iconShort : viewport[0] <= 600 && viewport[1] > viewport[0] ? iconPhone : '';
    if (override) { try { return declaration(selector, property, override); } catch (_) { /* inherited */ } }
    return declaration(selector, property, iconBase);
}
function iconLayout(viewport, { narration = false } = {}) {
    const [width, height] = viewport, phone = width <= 600 && height > width, landscape = height <= 500 && width > height;
    const phoneRules = css.slice(css.indexOf('@media (max-width: 600px) {\n    .adv-arc-portraits'));
    const shortRules = css.slice(css.indexOf('@media (max-height: 500px) and (orientation: landscape) {'));
    const variables = { '--adv-text-size': declaration('.story-adv', '--adv-text-size', landscape ? shortRules : phone ? phoneRules : css),
        '--adv-leading': declaration('.story-adv', '--adv-leading', landscape ? shortRules : phone ? phoneRules : css) };
    for (const key of ['--adv-icon-size', '--adv-icon-inset', '--adv-icon-gap', '--adv-icon-dialogue-height', '--adv-icon-bottom', '--adv-icon-narration-inset'])
        variables[key] = iconDeclaration(iconSelector, key, viewport);
    const calc = value => evaluate(value, variables, viewport);
    const rect = (left, top, right, bottom) => ({ left, top, right, bottom, width: right - left, height: bottom - top });
    const margin = phone ? 2 : calc(declaration('.story-adv', '--adv-pad')), gap = landscape ? 8 : 14, border = phone ? 3 : 4;
    const dialogueHeight = calc(variables['--adv-icon-dialogue-height']), top = height - gap - dialogueHeight;
    const inset = calc(variables['--adv-icon-inset']), size = calc(variables['--adv-icon-size']);
    const left = margin + border + inset, iconTop = top + border + inset;
    const textLeft = margin + border + (narration ? calc(variables['--adv-icon-narration-inset']) : inset + size + calc(variables['--adv-icon-gap']));
    let rightPadding;
    try { rightPadding = iconDeclaration(iconSelector + ' .adv-dialogue', 'padding-right', viewport); }
    catch (_) { rightPadding = declaration(iconSelector + ' .adv-dialogue', 'padding', iconBase).split(' ')[1]; }
    const rightPad = calc(rightPadding);
    const nameFont = landscape ? 21 : phone ? 24 : calc('clamp(24px, 1.95vw, 28px)');
    // Name tag's measured font line + vertical padding/borders + margin beneath it.
    const nameHeight = nameFont * (landscape ? 1.3 : 1.35) + (landscape ? 5 : phone ? 8 : 9) + 2;
    const nameGap = landscape ? 5 : phone ? 8 : 10;
    return { variables, calc, phone, landscape, border, lineHeight: calc('calc(var(--adv-text-size) * var(--adv-leading))'),
        dialogue: rect(margin, top, width - margin, height - gap), icon: narration ? null : rect(left, iconTop, left + size, iconTop + size),
        name: rect(textLeft, top + border + inset, width - margin - border - rightPad, top + border + inset + nameHeight),
        text: rect(textLeft, top + border + inset + (narration ? 0 : nameHeight + nameGap), width - margin - border - rightPad,
            height - gap - border - calc(variables['--adv-icon-bottom'])) };
}
function iconGeometry(id, viewport, { pose = 'default', ...options } = {}) {
    const layout = iconLayout(viewport, options), metric = assets.portraitMetrics(id, pose), variables = { ...layout.variables };
    context.__applyIconMetrics({ style: { setProperty: (key, value) => variables[key] = value } }, id, pose);
    const icon = layout.icon, iconBorder = 4, innerSize = icon.width - 2 * iconBorder;
    const calc = value => evaluate(value, variables, viewport, innerSize);
    const imageHeight = calc(declaration('.adv-icon-crop img', 'height'));
    const imageTop = icon.top + iconBorder + calc(declaration('.adv-icon-crop img', 'top'));
    const imageLeft = icon.left + iconBorder + calc(declaration('.adv-icon-crop img', 'left'));
    const sy = imageHeight / metric.canvas.height, sx = imageHeight * metric.renderCanvas.width / metric.renderCanvas.height / metric.canvas.width;
    return { layout, headHeight: sy * metric.head.height, imageHeight, imageTop, imageLeft,
        crop: { left: icon.left + iconBorder, top: icon.top + iconBorder, right: icon.right - iconBorder, bottom: icon.bottom - iconBorder },
        head: { left: imageLeft + sx * metric.head.left, right: imageLeft + sx * (metric.head.right + 1), top: imageTop + sy * metric.head.top, bottom: imageTop + sy * metric.head.chin },
        faceCenterX: imageLeft + sx * metric.head.centerX };
}
function intersects(a, b) { return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom; }
module.exports = { evaluate, declaration, geometry, bustGeometry, bustLayout, iconGeometry, iconLayout, intersects, assets, styleFor };
