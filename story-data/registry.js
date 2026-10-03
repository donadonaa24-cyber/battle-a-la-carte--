(function (root) {
    'use strict';
    const episodes = new Map(), warned = new Set();
    const positions = ['left', 'right', 'center', 'farLeft', 'farRight'];
    const assets = root.BattleStoryAssets;
    function warn(message) {
        if (warned.has(message)) return;
        warned.add(message);
        console.warn(`[story-data] ${message}`);
    }
    function background(key) {
        if (key == null || assets.backgrounds[key]) return key;
        warn(`unknown background: ${key}`);
        return null; // CSS gradient
    }
    function actor(value) {
        const result = { ...value };
        const character = assets.characters[result.id];
        if (!character) warn(`unknown character: ${result.id}`);
        if (!positions.includes(result.position)) {
            if (result.position != null) warn(`unknown position: ${result.position}`);
            result.position = 'center';
        }
        if (result.expression && !character?.portraits[result.expression] && result.expression !== 'normal') {
            warn(`unknown expression: ${result.id}/${result.expression}`);
            result.expression = 'normal';
        }
        return result;
    }
    function validate(episode) {
        if (!episode || typeof episode.id !== 'string' || !Array.isArray(episode.scenes)) {
            warn('invalid episode'); return null;
        }
        return { ...episode, afterBattle: { ...(episode.afterBattle || {}) },
            clear: { title: episode.title || '', ...(episode.clear || {}) }, scenes: episode.scenes.map(scene => ({ ...scene, background: background(scene.background),
            lines: (Array.isArray(scene.lines) ? scene.lines : []).map(line => {
                const result = { ...line };
                if (!['narration', 'announce'].includes(line.speaker)) {
                    const speaker = actor({ id: line.speaker, position: line.position || episode.defaultPositions?.[line.speaker], expression: line.expression });
                    result.position = speaker.position;
                    result.expression = speaker.expression || 'normal';
                }
                if (line.background !== undefined) result.background = background(line.background);
                if (Array.isArray(line.show)) result.show = line.show.map(actor);
                return result;
            }) })) };
    }
    root.BattleStoryData = Object.freeze({
        register(episode) { const value = validate(episode); if (value) episodes.set(value.id, value); return value; },
        get: id => episodes.get(id) || null,
        all: () => [...episodes.values()], validate
    });
})(window);
