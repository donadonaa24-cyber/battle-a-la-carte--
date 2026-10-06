(function (root) {
    'use strict';
    const active = new URLSearchParams(root.location?.search || '').has('viewer');
    let episodes = [];
    let blockedWrites = 0;

    if (active) {
        // Installed in <head>, before any game script can capture persistent storage.
        // A fresh page-local store exposes no saved progress, settings or account state.
        // Fail closed on every mutation, including accidental property assignments.
        const rejectWrite = () => { blockedWrites++; throw new Error('Story viewer: persistent storage is disabled'); };
        const storage = new Proxy(Object.freeze({
            getItem: () => null, key: () => null, length: 0,
            setItem: rejectWrite, removeItem: rejectWrite, clear: rejectWrite
        }), { set: rejectWrite, deleteProperty: rejectWrite, defineProperty: rejectWrite });
        Object.defineProperty(root, 'localStorage', { value: storage, writable: false, configurable: false });
        Object.defineProperty(root, 'sessionStorage', { value: storage, writable: false, configurable: false });
    }

    const byId = id => document.getElementById(id);
    function tutorialEpisode(episode) {
        return root.BattleStoryData.validate({
            id: episode.id, number: Number(episode.id.slice(7)), arc: episode.arc,
            title: episode.title.replace(/^第\d+話\s*/, ''), summary: episode.summary,
            protagonist: episode.protagonist, tutorial: true,
            portraitStyle: episode.portraitStyle,
            defaultPositions: Object.fromEntries(Object.keys(root.BattleStoryAssets.characters).map(id =>
                [id, id === episode.protagonist ? 'right' : 'left'])),
            battle: { after: 'viewer-battle' }, afterBattle: { win: 'win', lose: 'lose' },
            scenes: [
                { id: 'pre', background: episode.background, lines: [...episode.pre,
                    { id: 'viewer-battle', speaker: 'narration', text: '', battle: true }] },
                { id: 'win', background: episode.background, lines: episode.postWin || [] },
                { id: 'lose', background: episode.background, lines: episode.postLose || [] }
            ]
        });
    }
    function appendCards(list) {
        let arc;
        episodes.forEach(episode => {
            if (arc !== episode.arc) {
                arc = episode.arc;
                const heading = document.createElement('h2'); heading.className = 'story-arc-heading';
                heading.textContent = root.BattleStoryData.arcs[arc]; list.appendChild(heading);
            }
            const card = document.createElement('article'); card.className = 'story-episode-card';
            for (const [cls, text] of [['story-episode-title', root.BattleStoryData.episodeTitle(episode)],
                ['story-episode-summary', episode.summary || '']]) {
                const item = document.createElement('div'); item.className = cls; item.textContent = text; card.appendChild(item);
            }
            if (episode.arcLabel) { const label = document.createElement('small'); label.className = 'story-special-label'; label.textContent = episode.arcLabel; card.appendChild(label); }
            const button = document.createElement('button'); button.type = 'button'; button.className = 'story-episode-start';
            button.textContent = '会話を読む'; button.setAttribute('data-story-episode-id', episode.id);
            button.onclick = () => root.StoryAdv.start(episode.id);
            card.appendChild(button); list.appendChild(card);
        });
    }
    function open() {
        if (!active) return;
        root.StoryAdv.stop();
        byId('start-overlay')?.classList.remove('hidden');
        document.querySelectorAll('.start-stage').forEach(stage => stage.classList.toggle('hidden', stage.id !== 'start-story-stage'));
        const stage = byId('start-story-stage'); stage?.classList.add('story-viewer-list');
        stage?.classList.remove('mission-view');
        document.body.classList.add('story-viewer-mode');
        byId('story-stage-subtitle').textContent = 'ストーリービューア — 本編10話・特別編の会話を確認';
        byId('story-stage-message').textContent = '対戦をせずに読めます。進行・報酬・再開位置は保存されません。';
        const list = byId('story-episode-list'); list.replaceChildren(); list.classList.remove('hidden'); appendCards(list);
        ['story-dialogue-panel', 'story-battle-guide', 'story-primary-button', 'story-secondary-button',
            'story-hud-panel', 'start-story-back-button', 'mission-section'].forEach(id => byId(id)?.classList.add('hidden'));
        list.children[0]?.scrollIntoView?.({ block: 'nearest' });
        root.CharacterNotice.showOnce();
    }
    function init(tutorials) {
        if (!active) return;
        episodes = [...tutorials.map(tutorialEpisode), ...root.BattleStoryData.all()];
        document.addEventListener('pointerdown', () => root.unlockAudio?.(), { once: true, passive: true });
        open();
    }
    root.StoryViewer = Object.freeze({ active, init, open, get: id => active ? episodes.find(episode => episode.id === id) : null,
        all: () => episodes.slice(), get blockedWrites() { return blockedWrites; } });
})(window);
