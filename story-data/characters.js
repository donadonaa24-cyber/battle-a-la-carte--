(function (root) {
    'use strict';
    const base = document.currentScript?.src ? new URL('../', document.currentScript.src).href : '';
    const portraits = (id, expressions) => Object.assign(Object.create(null), Object.fromEntries(expressions.map(expression =>
        [expression, `assets/battle-images/story/portraits/${id}-${expression}.webp`])));
    // Only these files are requested. Add artwork here before using it in an episode.
    const characters = {
        chizuru: { name: '千鶴', portraits: portraits('chizuru', ['normal', 'smile', 'troubled', 'surprised', 'angry', 'embarrassed']), standing: 'assets/battle-images/characters/standing/chizuru-standing.webp' },
        kanna: { name: '栞那', portraits: portraits('kanna', ['normal', 'smile', 'smug', 'troubled', 'surprised']), standing: 'assets/battle-images/characters/standing/kanna-standing.webp' },
        mai: { name: '舞依', portraits: {}, standing: 'assets/battle-images/characters/standing/mai-standing.webp', focusY: .018 },
        takumi: { name: '拓海', portraits: {}, standing: 'assets/battle-images/characters/standing/takumi-standing.webp', focusY: .018 },
        akatsuki: { name: '暁', portraits: {}, standing: 'assets/battle-images/characters/standing/akatsuki-standing.webp', focusY: .008 },
        tsuyoshi: { name: '剛', portraits: {}, standing: null }
    };
    Object.setPrototypeOf(characters, null);
    Object.values(characters).forEach(character => {
        // Fractions of the source image: top of hair; full-body framing multiplier.
        character.focusY ??= .055;
        character.scale ??= 1.35;
        character.defaultPortrait = character.portraits.normal || character.standing;
        Object.setPrototypeOf(character.portraits, null);
        Object.freeze(character.portraits);
        Object.freeze(character);
    });
    const backgrounds = Object.assign(Object.create(null), Object.fromEntries([
        'festival-classroom', 'classroom', 'festival-hallway', 'school-gate', 'festival-courtyard',
        'gym-stage', 'cooking-room', 'rooftop', 'shopping-street', 'small-restaurant'
    ].map(key => [key, `assets/battle-images/story/backgrounds/${key}.webp`])));
    const battleAssets = [
        'character-icons/kanna-icons', 'battle-mode-icons/kanna-battle-mode-icon',
        'skill-cutins/kanna-skill-cutin', 'battle-mode-cutins/kanna-battle-mode-cutin'
    ].flatMap(key => [`assets/battle-images/${key}.webp`, `assets/images/${key}.png`]);
    battleAssets.push('assets/images/characters/standing/kanna-standing.png');
    const portraitCandidates = (id, expression) => {
        const character = characters[id];
        return character ? [...new Set([character.portraits[expression], character.portraits.normal, character.standing].filter(Boolean))] : [];
    };
    root.BattleStoryAssets = Object.freeze({
        characters: Object.freeze(characters), backgrounds: Object.freeze(backgrounds),
        battleAssets: Object.freeze(battleAssets), portraitCandidates,
        portraitPath: (id, expression) => portraitCandidates(id, expression)[0] || null,
        url: file => file ? base + file : null,
        paths: () => [...new Set([...Object.values(characters).flatMap(c => [...Object.values(c.portraits), c.standing].filter(Boolean)), ...Object.values(backgrounds), ...battleAssets])]
    });
})(window);
