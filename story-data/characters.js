(function (root) {
    'use strict';
    const base = document.currentScript?.src ? new URL('../', document.currentScript.src).href : '';
    // Refresh all 160 story portraits replaced by the 94b outline cleanup.
    const refreshedPortrait = /\/story\/portraits\/(?:chizuru|kanna|mai|takumi|akatsuki|tsuyoshi|classmate1|classmate2)-[a-z-]+\.webp$/;
    const portraits = (id, expressions, pose = 'default') => Object.assign(Object.create(null), Object.fromEntries(expressions.map(expression =>
        [expression, `assets/battle-images/story/portraits/${id}-${pose === 'default' ? '' : pose + '-'}${expression}.webp`])));
    const extraPoses = { chizuru: ['behind', 'cheer'], kanna: ['pocket'], mai: ['cheer', 'behind'] };
    const warnedPoses = new Set();
    // Claude's 99a proposal; owner may adjust this six-cell mapping later.
    const iconExpressions = Object.freeze({ normal: 'normal', serious: 'normal', cold: 'normal', thinking: 'normal', angry: 'normal',
        smile: 'smile', happy: 'smile', smug: 'smile', gentle: 'gentle', laugh: 'laugh',
        surprised: 'surprised', frozen: 'surprised', troubled: 'troubled', sad: 'troubled', embarrassed: 'troubled',
        exasperated: 'troubled', pout: 'troubled', flustered: 'troubled', worried: 'troubled', tired: 'troubled' });
    // Only these files are requested. Add artwork here before using it in an episode.
    const characters = {
        chizuru: { name: '千鶴', portraits: portraits('chizuru', ["angry","embarrassed","flustered","frozen","happy","laugh","normal","pout","sad","smile","smug","surprised","thinking","troubled","worried"]), standing: 'assets/battle-images/characters/standing/chizuru-standing.webp' },
        kanna: { name: '栞那', portraits: portraits('kanna', ["angry","exasperated","frozen","gentle","happy","laugh","normal","pout","sad","serious","smile","smug","surprised","thinking","troubled"]), standing: 'assets/battle-images/characters/standing/kanna-standing.webp' },
        mai: { name: '舞依', portraits: portraits('mai', ["angry","cold","embarrassed","gentle","happy","laugh","normal","pout","sad","serious","smile","smug","surprised","thinking","troubled"]), standing: 'assets/battle-images/characters/standing/mai-standing.webp' },
        takumi: { name: '拓海', portraits: portraits('takumi', ["embarrassed","exasperated","flustered","frozen","gentle","happy","laugh","normal","smile","surprised","thinking","troubled"]), standing: 'assets/battle-images/characters/standing/takumi-standing.webp' },
        akatsuki: { name: '暁', portraits: portraits('akatsuki', ["cold","embarrassed","exasperated","frozen","gentle","happy","laugh","normal","sad","serious","smile","smug","surprised","thinking","troubled"]), standing: 'assets/battle-images/characters/standing/akatsuki-standing.webp' },
        tsuyoshi: { name: '剛', portraits: portraits('tsuyoshi', ["happy","laugh","normal","smile","surprised","tired","troubled"]), standing: 'assets/battle-images/characters/standing/tsuyoshi-standing.webp' },
        // Classmates use only their explicitly registered story artwork.
        classmate1: { name: 'クラスメート', portraits: portraits('classmate1', ["normal","sick","smile"]), standing: null },
        classmate2: { name: 'クラスメート2', portraits: portraits('classmate2', ["normal","smile","worried"]), standing: null }
    };
    Object.setPrototypeOf(characters, null);
    Object.entries(characters).forEach(([id, character]) => {
        if (!id.startsWith('classmate')) character.icons = Object.freeze(Object.assign(Object.create(null),
            Object.fromEntries(['normal', 'smile', 'troubled', 'surprised', 'gentle', 'laugh'].map(cell => [cell, `assets/battle-images/story/icons/${id}-${cell}-alpha.webp`]))));
        if (!id.startsWith('classmate')) character.introStanding = `assets/battle-images/characters/standing/${id}-standing-alpha.webp`;
        character.poses = Object.assign(Object.create(null), { default: character.portraits },
            Object.fromEntries((extraPoses[id] || []).map(pose => [pose, portraits(id, Object.keys(character.portraits), pose)])));
        Object.values(character.poses).forEach(Object.freeze);
        Object.freeze(character.poses);
        const metrics = root.BattleStoryPortraitMetrics?.characters[id];
        if (metrics) {
            for (const value of [metrics, ...Object.values(metrics.poses || {})]) {
                for (const part of ['canvas', 'renderCanvas', 'head', 'figure']) Object.freeze(value[part]);
                Object.freeze(value);
            }
            if (metrics.poses) Object.freeze(metrics.poses);
            character.portraitMetrics = Object.freeze(metrics);
        }
        character.defaultPortrait = character.portraits.normal || character.standing;
        Object.setPrototypeOf(character.portraits, null);
        Object.freeze(character.portraits);
        Object.freeze(character);
    });
    function resolvePose(id, pose = 'default') {
        if (characters[id]?.poses[pose]) return pose;
        const key = id + '/' + pose;
        if (!warnedPoses.has(key)) {
            warnedPoses.add(key); console.warn('[story-data] unknown pose: ' + key);
        }
        return 'default';
    }
    function portraitMetrics(id, pose = 'default') {
        const metrics = characters[id]?.portraitMetrics;
        const resolved = metrics ? resolvePose(id, pose) : 'default';
        return resolved === 'default' ? metrics : metrics?.poses?.[resolved] || metrics;
    }
    function applyPortraitMetrics(element, id, pose = 'default') {
        const metrics = portraitMetrics(id, pose);
        if (!metrics) return false;
        const { canvas, renderCanvas, head, headTopOffset } = metrics;
        const scale = canvas.height / head.height, aspect = renderCanvas.width / renderCanvas.height;
        const values = {
            'canvas-scale': scale, 'canvas-aspect': aspect, 'center-x': head.centerX / canvas.width,
            'head-from-top': head.top / head.height, 'head-top-offset': headTopOffset,
            'head-top': head.top / canvas.height, 'eye-y': head.eyeLine / canvas.height,
            'head-left': (head.centerX - head.left) / canvas.width * aspect * scale,
            'head-right': (head.right - head.centerX + 1) / canvas.width * aspect * scale
        };
        for (const [key, value] of Object.entries(values)) element.style.setProperty('--adv-' + key, String(value));
        return true;
    }
    const backgrounds = Object.assign(Object.create(null), Object.fromEntries([
        'festival-classroom', 'festival-kitchen', 'classroom', 'festival-hallway', 'school-gate', 'festival-courtyard',
        'gym-stage', 'cooking-room', 'rooftop', 'shopping-street', 'small-restaurant',
        'festival-classroom-evening', 'classroom-after-festival', 'school-gate-evening'
    ].map(key => [key, `assets/battle-images/story/backgrounds/${key}.webp`])));
    const battleAssets = [
        'character-icons/kanna-icons', 'battle-mode-icons/kanna-battle-mode-icon',
        'skill-cutins/kanna-skill-cutin', 'battle-mode-cutins/kanna-battle-mode-cutin'
    ].flatMap(key => [`assets/battle-images/${key}.webp`, `assets/images/${key}.png`]);
    battleAssets.push('assets/images/characters/standing/kanna-standing.png');
    const portraitCandidates = (id, expression, pose = 'default') => {
        const character = characters[id];
        return character ? [...new Set([character.poses[resolvePose(id, pose)][expression], character.portraits[expression], character.portraits.normal, character.standing].filter(Boolean))] : [];
    };
    const iconCandidates = (id, expression = 'normal') => {
        const character = characters[id];
        if (!character?.icons) return portraitCandidates(id, expression);
        return [...new Set([character.icons[iconExpressions[expression]], character.icons.normal].filter(Boolean))];
    };
    root.BattleStoryAssets = Object.freeze({
        characters: Object.freeze(characters), backgrounds: Object.freeze(backgrounds),
        battleAssets: Object.freeze(battleAssets), portraitCandidates, iconCandidates, iconExpressions, applyPortraitMetrics, portraitMetrics, resolvePose,
        iconPath: (id, expression) => iconCandidates(id, expression)[0] || null,
        portraitPose: (id, file) => Object.entries(characters[id]?.poses || {}).find(([, expressions]) => Object.values(expressions).includes(file))?.[0] || 'default',
        portraitPath: (id, expression, pose = 'default') => portraitCandidates(id, expression, pose)[0] || null,
        url: file => file ? base + file + (/\/story\/icons\/|-standing-alpha\.webp$|\/characters\/standing\/tsuyoshi-standing\.webp$/.test(file) ? '?v=20261006-icons99e' : refreshedPortrait.test(file) ? '?v=20261005-face95b' : '') : null,
        paths: () => [...new Set([...Object.values(characters).flatMap(c => [...Object.values(c.poses).flatMap(Object.values), ...Object.values(c.icons || {}), c.standing, c.introStanding].filter(Boolean)), ...Object.values(backgrounds), ...battleAssets])]
    });
})(window);
