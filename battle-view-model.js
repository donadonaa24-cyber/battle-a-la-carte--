(function (root) {
    'use strict';
    const ownSide = value => value === 'player' ? 'me' : value === 'cpu' ? 'opponent' : value;
    function fromState(state, online = false) {
        const participant = key => ({
            ...state.players[key], characterId: state.characterIds?.[key],
            characterName: state.characterNames?.[key]
        });
        const me = participant('player'), opponent = participant('cpu');
        return {
            me, opponent, turn: ownSide(state.currentTurn), winner: ownSide(state.winner), online,
            opponentLabel: online ? '相手' : 'CPU',
            forSide: key => key === 'me' || key === 'player' ? me : opponent
        };
    }
    root.BattleViewModel = Object.freeze({ fromState });
    root.getBattleViewModel = () => fromState(root.GameState, !!root.FriendBattle?.isActive());
})(typeof window === 'undefined' ? globalThis : window);
