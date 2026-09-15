(function (root) {
    'use strict';
    const lightPath = path => typeof path === 'string' ? path.replace('assets/images/', 'assets/battle-images/').replace(/\.png$/i, '.webp') : path;
    const originalPath = path => typeof path === 'string' ? path.replace('assets/battle-images/', 'assets/images/').replace(/\.webp$/i, '.png') : path;
    root.BattleImages = Object.freeze({ lightPath, originalPath });
})(window);
