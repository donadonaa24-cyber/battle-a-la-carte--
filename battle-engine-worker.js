// HOST-only worker. Reuses the actual game rules without rendering or local coin rewards.
self.window = self;
importScripts('battle-protocol.js', 'cards.js', 'state.js', 'rules.js', 'player.js');
// Rule timers only schedule presentation; deliver those cues with the committed action.
self.setTimeout = callback => { callback(); return 0; };
let effects = [], logs = [];
for (const name of ['updateUI', 'hideDiscardBanner', 'showDiscardBanner', 'disablePlayerControls', 'setCPUStatus']) {
    self[name] = () => {};
}
for (const name of ['playSfx', 'playCookBgm', 'showSpotlightRecipeCard', 'showSpotlightEventCard',
    'showSpotlightSkillCutin', 'showSpotlightPackCardAsync', 'setBattleModeBgmLocked', 'playBattleModeBGM', 'showBattleALaCarteModeCutin']) {
    self[name] = (...args) => { effects.push({ name, args }); };
}
self.addLog = text => logs.push(String(text));
self.FriendBattle = { isActive: () => true };
// The next human must choose their own discard pickup, never use CPU auto-selection.
self.triggerBattleModeDiscardPickupAfterDrawForCpu = owner => triggerBattleModeDiscardPickupAfterDrawForPlayer(owner);
self.endGame = winner => {
    GameState.gameEnded = true;
    GameState.winner = winner;
    GameState.currentTurn = null;
    GameState.currentPhase = 'ゲーム終了';
    GameState.selectionMode = null;
    GameState.candidateRecipes = [];
    GameState.pendingEventContext = null;
    GameState.pendingSkillContext = null;
};
function loadSnapshot(snapshot) {
    for (const key of Object.keys(GameState)) delete GameState[key];
    Object.assign(GameState, BattleProtocol.clone(snapshot));
}
const names = { chizuru: '千鶴', mai: '舞依', takumi: '拓海', akatsuki: '暁' };
async function execute(request) {
    effects = []; logs = [];
    let actor = request.role || 'host';
    if (request.kind === 'init') {
        initGame();
        // Original sequential IDs identify card names; replace IDs, not cards or rules.
        for (const zone of [GameState.deck, ...Object.values(GameState.players).flatMap(p => [p.hand, p.set, p.events])]) {
            for (const card of zone) card.id = crypto.randomUUID();
        }
        for (const [key, role] of [['player', 'host'], ['cpu', 'guest']]) {
            const info = request[role] || {};
            const id = Object.hasOwn(names, info.character) ? info.character : 'chizuru';
            GameState.characterIds[key] = id;
            GameState.characterNames[key] = names[id];
            setPlayerSelectedSkill(GameState.players[key], info.skill);
        }
    } else {
        loadSnapshot(request.snapshot);
        if (GameState.gameEnded) throw new Error('MATCH_ENDED');
        if ((GameState.currentTurn === 'player' ? 'host' : 'guest') !== actor) throw new Error('NOT_YOUR_TURN');
        if (!BattleProtocol.validAction(request.action)) throw new Error('INVALID_ACTION');
        if (actor === 'guest') loadSnapshot(BattleProtocol.swap(GameState));
        await self[request.action.name](...request.action.args);
        if (actor === 'guest') loadSnapshot(BattleProtocol.swap(GameState));
    }
    const snapshot = BattleProtocol.clone(GameState);
    const views = {};
    for (const role of ['host', 'guest']) {
        const adapted = BattleProtocol.clone(effects);
        if (role !== actor) {
            for (const e of adapted) if (['showSpotlightSkillCutin', 'showBattleALaCarteModeCutin'].includes(e.name))
                e.args[0] = e.args[0] === 'player' ? 'cpu' : 'player';
        }
        const projected = BattleProtocol.view(snapshot, role);
        const skillStatus = getSkillActivationStatusForSide(role === 'host' ? 'player' : 'cpu');
        projected.onlineSkillStatus = { ok: skillStatus.ok, reason: skillStatus.reason };
        views[role] = { state: projected, effects: adapted,
            logs: role === actor ? logs : (request.kind === 'init' ? [] : ['相手が操作しました。']) };
    }
    return { snapshot, views };
}
self.onmessage = async ({ data }) => {
    try { self.postMessage({ id: data.id, result: await execute(data) }); }
    catch (error) { self.postMessage({ id: data.id, error: error.message }); }
};
