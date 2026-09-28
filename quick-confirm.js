(function (root) {
    'use strict';
    const key = 'battle-a-la-carte:operation-confirm:v1';
    let draggedEvent = false;
    function mode() {
        try { return root.localStorage?.getItem(key) === 'quick' ? 'quick' : 'standard'; }
        catch (_) { return 'standard'; }
    }
    function setMode(value) {
        const next = value === 'quick' ? 'quick' : 'standard';
        try { root.localStorage?.setItem(key, next); } catch (_) {}
        return next;
    }
    function withDraggedEvent(action) {
        draggedEvent = true;
        try { return action(); } finally { draggedEvent = false; }
    }
    function autoAction(name) {
        if (mode() !== 'quick') return null;
        if (name === 'playerEndTurn') return 'confirmEndTurn';
        if (name === 'playerSetCard') return 'confirmSetCard';
        if (name === 'playerUseEvent' && draggedEvent) return 'confirmEventCard';
        return null;
    }
    const api = { key, mode, setMode, withDraggedEvent, autoAction };
    root.QuickConfirm = api;
    if (typeof module !== 'undefined') module.exports = api;
})(typeof window === 'undefined' ? globalThis : window);
