(function (root) {
    'use strict';
    const lightPath = path => typeof path === 'string' ? path.replace('assets/images/', 'assets/battle-images/').replace(/\.png$/i, '.webp') : path;
    const originalPath = path => typeof path === 'string' ? path.replace('assets/battle-images/', 'assets/images/').replace(/\.webp$/i, '.png') : path;
    const standingPaths = Object.freeze(Object.fromEntries(['chizuru', 'mai', 'takumi', 'akatsuki']
        .map(id => [id, `assets/battle-images/characters/standing/${id}-standing.webp`])));
    const standingPath = id => standingPaths[id] || standingPaths.chizuru;
    const expressionCells = Object.freeze(['normal', 'smile', 'troubled', 'surprised', 'gentle', 'laugh']);
    const expressionCharacters = Object.freeze(['chizuru', 'mai', 'takumi', 'akatsuki', 'kanna']);
    const expressionAliases = Object.freeze({ happy: 'smile', worried: 'troubled' });
    const expressionPath = (id, expression = 'normal', prefix = 'assets/') => {
        const character = expressionCharacters.includes(id) ? id : 'chizuru';
        const cell = expressionAliases[expression] || expression;
        return `${prefix}battle-images/story/icons/${character}-${expressionCells.includes(cell) ? cell : 'normal'}-alpha.webp?v=20261006-icons99c`;
    };
    const expressionImages = new WeakMap();
    // Retain each frame's dimensions and decoration; apply the shared face alignment.
    function applyExpressionPath(element, file) {
        if (!element) return;
        let image = expressionImages.get(element);
        if (!file?.includes('/story/icons/')) {
            if (image) image.hidden = true;
            return;
        }
        if (!image) {
            image = (element.ownerDocument || root.document).createElement('img');
            image.alt = '';
            image.setAttribute('aria-hidden', 'true');
            Object.assign(image.style, { position: 'absolute', inset: '0', width: '100%', height: '100%',
                objectFit: 'cover', objectPosition: '50% 35%', borderRadius: 'inherit', pointerEvents: 'none' });
            element.appendChild(image);
            expressionImages.set(element, image);
        }
        element.style.position = 'relative';
        element.style.backgroundImage = 'none';
        element.style.backgroundColor = '#142441';
        element.style.overflow = 'hidden';
        const match = file.match(/\/icons\/([a-z]+)-([a-z]+)-alpha\.webp/);
        if (match) root.BattleStoryIconMetrics?.apply(image, match[1], match[2]);
        image.hidden = false;
        if (image.getAttribute('src') !== file) image.setAttribute('src', file);
    }
    const applyExpression = (element, id, expression, prefix = 'assets/') => applyExpressionPath(element, expressionPath(id, expression, prefix));
    root.BattleImages = Object.freeze({ lightPath, originalPath, standingPaths, standingPath,
        expressionCells, expressionCharacters, expressionPath, applyExpression, applyExpressionPath });
})(window);
