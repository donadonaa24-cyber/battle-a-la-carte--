(function (root) {
    'use strict';
    const lightPath = path => typeof path === 'string' ? path.replace('assets/images/', 'assets/battle-images/').replace(/\.png$/i, '.webp') : path;
    const originalPath = path => typeof path === 'string' ? path.replace('assets/battle-images/', 'assets/images/').replace(/\.webp$/i, '.png') : path;
    const standingPaths = Object.freeze(Object.fromEntries(['chizuru', 'mai', 'takumi', 'akatsuki', 'tsuyoshi', 'kanna', 'yuzuki', 'ryuta']
        .map(id => [id, `assets/battle-images/characters/standing/${id}-standing.webp`])));
    const standingCostumes = Object.freeze({ tsuyoshi: ['summer'], akatsuki: ['summer'], kanna: ['halloween'], chizuru: ['halloween'], yuzuki: ['kyudo'], takumi: ['kyudo'], mai: ['kyudo'] });
    const standingPath = (id, costume = 'default') => standingCostumes[id]?.includes(costume)
        ? `assets/battle-images/characters/standing/${id}-${costume}-standing.webp?v=20261007-osananajimi105a`
        : (standingPaths[id] || standingPaths.chizuru) + (['tsuyoshi', 'kanna', 'yuzuki', 'ryuta'].includes(id) ? '?v=20261007-osananajimi105a' : '');
    const expressionCells = Object.freeze(['normal', 'smile', 'troubled', 'surprised', 'gentle', 'laugh']);
    const expressionCharacters = Object.freeze(['chizuru', 'mai', 'takumi', 'akatsuki', 'kanna', 'tsuyoshi', 'yuzuki', 'ryuta']);
    const expressionAliases = Object.freeze({ happy: 'smile', worried: 'troubled' });
    const expressionPath = (id, expression = 'normal', prefix = 'assets/', side = null) => {
        const character = expressionCharacters.includes(id) ? id : 'chizuru';
        const cell = expressionAliases[expression] || expression;
        const resolved = expressionCells.includes(cell) ? cell : 'normal';
        // Scripted episodes take precedence. Opponents always keep their default wardrobe.
        const storyId = root.GameState?.storyEpisodeId;
        const costume = storyId ? root.BattleStoryData?.get(storyId)?.costumes?.[character]
            : side === 'player' ? root.getSelectedCharacterCostume?.(character) : null;
        const costumePath = costume && root.BattleStoryAssets?.iconPath(character, resolved, costume);
        return costumePath ? prefix + costumePath.replace(/^assets\//, '') + '?v=20261007-osananajimi105a'
            : `${prefix}battle-images/story/icons/${character}-${resolved}-alpha.webp?v=20261007-osananajimi105a`;
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
        const match = file.match(/\/icons\/([a-z]+)-((?:[a-z0-9]+-)*)([a-z]+)-alpha\.webp/);
        if (match) root.BattleStoryIconMetrics?.apply(image, match[1], match[3], match[2].replace(/-$/, ''));
        image.hidden = false;
        if (image.getAttribute('src') !== file) image.setAttribute('src', file);
    }
    const applyExpression = (element, id, expression, prefix = 'assets/', side = null) => applyExpressionPath(element, expressionPath(id, expression, prefix, side));
    root.BattleImages = Object.freeze({ lightPath, originalPath, standingPaths, standingPath,
        expressionCells, expressionCharacters, expressionPath, applyExpression, applyExpressionPath });
})(window);
