(function () {
    'use strict';

    let gesture = null;
    let ghost = null;
    let dropZone = null;
    let suppressClickUntil = 0;
    let lastResult = 'idle';
    let lastCardId = '';

    const canDrag = () => !GameState.gameEnded && !GameState.selectionMode &&
        getBattleViewModel().turn === 'me' && !document.body.classList.contains('online-operation-locked');

    function mark(element, card) {
        if (!element || card?.id == null || !['ingredient', 'event'].includes(card.type)) return;
        element.classList.add('card-drag-source');
        element.dataset.dragCardId = card.id;
        element.dataset.dragCardType = card.type;
        element.setAttribute('aria-label', `${card.name || 'カード'}。クリック、またはドラッグして使用`);
    }

    function destinationFor(type) {
        if (type === 'ingredient') {
            const set = document.getElementById('player-set');
            return { element: set?.closest('.player-set-zone, .panel-box') || set, label: 'セット' };
        }
        return {
            element: document.querySelector('.center-field, .center-panel'),
            label: '発動'
        };
    }

    function positionGhost(x, y) {
        if (!ghost) return;
        ghost.style.left = `${x}px`;
        ghost.style.top = `${y}px`;
    }

    function beginDrag(event) {
        const destination = destinationFor(gesture.type);
        if (!destination.element) return false;
        const sourceRect = gesture.source.getBoundingClientRect();
        const targetRect = destination.element.getBoundingClientRect();

        ghost = gesture.source.cloneNode(true);
        ghost.removeAttribute('id');
        ghost.removeAttribute('data-drag-card-id');
        ghost.classList.add('card-drag-ghost');
        ghost.setAttribute('aria-hidden', 'true');
        ghost.style.width = `${sourceRect.width}px`;
        ghost.style.height = `${sourceRect.height}px`;

        dropZone = document.createElement('div');
        dropZone.className = 'card-drop-zone';
        dropZone.textContent = destination.label;
        dropZone.dataset.dropAction = gesture.type === 'ingredient' ? 'set' : 'activate';
        Object.assign(dropZone.style, {
            left: `${targetRect.left}px`, top: `${targetRect.top}px`,
            width: `${targetRect.width}px`, height: `${targetRect.height}px`
        });

        document.body.append(ghost, dropZone);
        document.body.classList.add('card-dragging');
        gesture.dragging = true;
        lastResult = 'dragging';
        gesture.targetRect = targetRect;
        positionGhost(event.clientX, event.clientY);
        return true;
    }

    function isInside(x, y, rect) {
        return !!rect && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
    }

    function cleanup() {
        ghost?.remove();
        dropZone?.remove();
        ghost = null;
        dropZone = null;
        document.body.classList.remove('card-dragging');
    }

    document.addEventListener('pointerdown', event => {
        if (event.button !== 0 || !canDrag()) return;
        const source = event.target.closest('#player-hand-mixed .card[data-drag-card-id]');
        if (!source) return;
        gesture = {
            pointerId: event.pointerId,
            source,
            id: source.dataset.dragCardId,
            type: source.dataset.dragCardType,
            startX: event.clientX,
            startY: event.clientY,
            dragging: false,
            horizontalScroll: false,
            targetRect: null
        };
        lastCardId = source.dataset.dragCardId;
        lastResult = 'armed';
    }, true);

    document.addEventListener('pointermove', event => {
        if (!gesture || event.pointerId !== gesture.pointerId) return;
        const dx = event.clientX - gesture.startX;
        const dy = event.clientY - gesture.startY;
        if (!gesture.dragging) {
            if (Math.hypot(dx, dy) < 9) return;
            if (event.pointerType !== 'mouse' && Math.abs(dx) > Math.abs(dy) * 1.15) {
                gesture.horizontalScroll = true;
                return;
            }
            if (gesture.horizontalScroll || !beginDrag(event)) return;
        }
        event.preventDefault();
        event.stopPropagation();
        positionGhost(event.clientX, event.clientY);
        dropZone?.classList.toggle('is-ready', isInside(event.clientX, event.clientY, gesture.targetRect));
    }, { capture: true, passive: false });

    function finish(event, cancelled) {
        if (!gesture || event.pointerId !== gesture.pointerId) return;
        const current = gesture;
        const accepted = current.dragging && !cancelled && isInside(event.clientX, event.clientY, current.targetRect);
        if (current.dragging) {
            event.preventDefault();
            event.stopPropagation();
            suppressClickUntil = performance.now() + 350;
        }
        cleanup();
        gesture = null;
        lastResult = accepted ? 'accepted' : current.dragging ? 'missed' : 'tap';
        if (!accepted) return;
        if (!canDrag()) { lastResult = 'blocked'; return; }
        const sourceCards = current.type === 'ingredient'
            ? GameState.players.player.hand
            : GameState.players.player.events;
        const sourceCard = sourceCards.find(card => String(card.id) === current.id);
        if (!sourceCard) { lastResult = 'missing'; return; }
        if (current.type === 'ingredient') window.playerSetCard?.(sourceCard.id);
        else window.playerUseEvent?.(sourceCard.id);
        lastResult = `accepted:${GameState.selectionMode || 'none'}`;
    }

    document.addEventListener('pointerup', event => finish(event, false), true);
    document.addEventListener('pointercancel', event => finish(event, true), true);
    document.addEventListener('click', event => {
        if (performance.now() >= suppressClickUntil) return;
        if (!event.target.closest('#player-hand-mixed .card')) return;
        event.preventDefault();
        event.stopImmediatePropagation();
    }, true);

    window.CardDragActions = Object.freeze({ mark, getLastResult: () => lastResult, getLastCardId: () => lastCardId });
})();
