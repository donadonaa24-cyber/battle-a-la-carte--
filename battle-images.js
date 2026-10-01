(function (root) {
    'use strict';
    const lightPath = path => typeof path === 'string' ? path.replace('assets/images/', 'assets/battle-images/').replace(/\.png$/i, '.webp') : path;
    const originalPath = path => typeof path === 'string' ? path.replace('assets/battle-images/', 'assets/images/').replace(/\.webp$/i, '.png') : path;
    const standingPaths = Object.freeze(Object.fromEntries(['chizuru', 'mai', 'takumi', 'akatsuki']
        .map(id => [id, `assets/battle-images/characters/standing/${id}-standing.webp`])));
    const standingPath = id => standingPaths[id] || standingPaths.chizuru;
    root.BattleImages = Object.freeze({ lightPath, originalPath, standingPaths, standingPath });
})(window);
