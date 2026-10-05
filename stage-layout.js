(function (root) {
    'use strict';

    function computeStageScale(available, logical) {
        return Math.min(available.width / logical.width, available.height / logical.height);
    }

    function screenToStage(point, stageRect, scale) {
        return { x: (point.x - stageRect.left) / scale, y: (point.y - stageRect.top) / scale };
    }

    function rectToStage(rect, stageRect, scale) {
        if (!rect) return null;
        const origin = screenToStage({ x: rect.left, y: rect.top }, stageRect, scale);
        return { left: origin.x, top: origin.y, width: rect.width / scale, height: rect.height / scale,
            right: origin.x + rect.width / scale, bottom: origin.y + rect.height / scale };
    }

    const api = { computeStageScale, screenToStage, rectToStage };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (!root.document) return;

    const stage = root.document.getElementById('app-stage');
    if (!stage) return;
    const logical = { width: Number(stage.dataset.stageWidth), height: Number(stage.dataset.stageHeight) };
    let scale = 1;
    const probe = root.document.createElement('div');
    probe.setAttribute('aria-hidden', 'true');
    probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
    root.document.body.appendChild(probe);

    function fit() {
        const viewport = root.visualViewport;
        const width = viewport ? viewport.width : root.innerWidth;
        const height = viewport ? viewport.height : root.innerHeight;
        const originX = viewport ? viewport.offsetLeft : 0;
        const originY = viewport ? viewport.offsetTop : 0;
        const style = root.getComputedStyle(probe);
        const safe = { top: parseFloat(style.paddingTop) || 0, right: parseFloat(style.paddingRight) || 0,
            bottom: parseFloat(style.paddingBottom) || 0, left: parseFloat(style.paddingLeft) || 0 };
        const available = { width: Math.max(1, width - safe.left - safe.right),
            height: Math.max(1, height - safe.top - safe.bottom) };
        scale = computeStageScale(available, logical);
        stage.style.left = `${originX + safe.left + (available.width - logical.width * scale) / 2}px`;
        stage.style.top = `${originY + safe.top + (available.height - logical.height * scale) / 2}px`;
        stage.style.transform = `scale(${scale})`;
    }

    function prompt(message, confirm) {
        return new Promise(resolve => {
            const previousFocus = root.document.activeElement;
            const overlay = root.document.createElement('div');
            overlay.className = 'stage-prompt-overlay';
            overlay.setAttribute('role', 'dialog');
            overlay.setAttribute('aria-modal', 'true');
            overlay.addEventListener('pointerdown', event => event.stopPropagation());
            overlay.addEventListener('click', event => event.stopPropagation());
            const panel = root.document.createElement('div');
            panel.className = 'stage-prompt-panel';
            const text = root.document.createElement('p');
            text.textContent = message;
            const actions = root.document.createElement('div');
            actions.className = 'stage-prompt-actions';
            const close = answer => {
                overlay.remove();
                previousFocus?.focus?.();
                resolve(answer);
            };
            if (confirm) {
                const cancel = root.document.createElement('button');
                cancel.type = 'button';
                cancel.textContent = 'キャンセル';
                cancel.addEventListener('click', () => close(false));
                actions.appendChild(cancel);
            }
            const accept = root.document.createElement('button');
            accept.type = 'button';
            accept.textContent = '確認';
            accept.addEventListener('click', () => close(true));
            actions.appendChild(accept);
            panel.append(text, actions);
            overlay.appendChild(panel);
            overlay.addEventListener('keydown', event => {
                if (event.key === 'Escape') { event.preventDefault(); close(false); }
                if (event.key === 'Tab') {
                    const buttons = [...actions.querySelectorAll('button')];
                    if (event.shiftKey && root.document.activeElement === buttons[0]) {
                        event.preventDefault(); buttons[buttons.length - 1].focus();
                    } else if (!event.shiftKey && root.document.activeElement === buttons[buttons.length - 1]) {
                        event.preventDefault(); buttons[0].focus();
                    }
                }
            });
            stage.appendChild(overlay);
            accept.focus();
        });
    }

    let destructivePromptOpen = false;
    function confirmDestructive({ title, erased = [], kept = [], confirmText = '初期化する', erasedLabel = '初期化されるもの' }) {
        // Repeated taps must not queue a second destructive action.
        if (destructivePromptOpen) return Promise.resolve(false);
        destructivePromptOpen = true;
        return new Promise(resolve => {
            const previousFocus = root.document.activeElement;
            const overlay = root.document.createElement('div');
            overlay.className = 'stage-prompt-overlay destructive-prompt-overlay';
            overlay.setAttribute('role', 'dialog');
            overlay.setAttribute('aria-modal', 'true');
            overlay.setAttribute('aria-labelledby', 'destructive-prompt-title');
            overlay.setAttribute('aria-describedby', 'destructive-prompt-details');
            const panel = root.document.createElement('div');
            panel.className = 'stage-prompt-panel destructive-prompt-panel';
            const heading = root.document.createElement('h2');
            heading.id = 'destructive-prompt-title';
            heading.textContent = title;
            const details = root.document.createElement('div');
            details.id = 'destructive-prompt-details';
            details.className = 'destructive-prompt-details';
            const list = (label, items) => {
                if (!items.length) return;
                const caption = root.document.createElement('h3');
                caption.textContent = label;
                const ul = root.document.createElement('ul');
                items.forEach(item => {
                    const li = root.document.createElement('li');
                    li.textContent = item; ul.appendChild(li);
                });
                details.append(caption, ul);
            };
            list(erasedLabel, erased);
            list('初期化されないもの', kept);
            const warning = root.document.createElement('p');
            warning.className = 'destructive-prompt-warning';
            warning.textContent = 'この操作は元に戻せません。';
            details.appendChild(warning);
            const actions = root.document.createElement('div');
            actions.className = 'stage-prompt-actions';
            const cancel = root.document.createElement('button');
            cancel.type = 'button'; cancel.className = 'start-sub-button'; cancel.textContent = 'やめる';
            const accept = root.document.createElement('button');
            accept.type = 'button'; accept.className = 'danger-confirm-button'; accept.textContent = confirmText;
            accept.disabled = true;
            const delayHint = root.document.createElement('p');
            delayHint.className = 'destructive-prompt-delay';
            delayHint.setAttribute('role', 'status');
            delayHint.textContent = '内容をご確認ください（1秒後に操作できます）';
            let closed = false;
            const readyAt = Date.now() + 1000;
            const timer = root.setTimeout(() => {
                if (closed) return;
                accept.disabled = false;
                delayHint.textContent = '内容を確認したうえで操作してください';
            }, 1000);
            const siblings = [...stage.children].map(node => [node, node.inert]);
            siblings.forEach(([node]) => { node.inert = true; });
            const close = answer => {
                if (closed) return;
                closed = true; root.clearTimeout(timer);
                root.document.removeEventListener('keydown', onKey, true);
                overlay.remove();
                siblings.forEach(([node, inert]) => { node.inert = inert; });
                destructivePromptOpen = false;
                previousFocus?.focus?.();
                resolve(answer);
            };
            const onKey = event => {
                if (event.key === 'Escape') {
                    event.preventDefault(); event.stopImmediatePropagation(); close(false);
                } else if (event.key === 'Tab') {
                    event.preventDefault();
                    const buttons = accept.disabled ? [cancel] : [cancel, accept];
                    const current = buttons.indexOf(root.document.activeElement);
                    buttons[(current + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length].focus();
                }
            };
            cancel.addEventListener('click', () => close(false));
            accept.addEventListener('click', () => {
                if (accept.disabled || Date.now() < readyAt) return;
                close(true);
            });
            overlay.addEventListener('pointerdown', event => event.stopPropagation());
            overlay.addEventListener('click', event => {
                event.stopPropagation();
                if (event.target === overlay) close(false);
            });
            actions.append(cancel, accept);
            panel.append(heading, details, delayHint, actions);
            overlay.appendChild(panel); stage.appendChild(overlay);
            root.document.addEventListener('keydown', onKey, true);
            cancel.focus();
        });
    }

    root.StageLayout = Object.freeze({ ...api, stage, logical, getScale: () => scale,
        toStagePoint: point => screenToStage(point, stage.getBoundingClientRect(), scale),
        toStageRect: rect => rectToStage(rect, stage.getBoundingClientRect(), scale),
        confirm: message => prompt(message, true), confirmDestructive,
        alert: message => prompt(message, false), fit });
    root.addEventListener('resize', fit);
    root.addEventListener('orientationchange', fit);
    root.visualViewport?.addEventListener('resize', fit);
    root.visualViewport?.addEventListener('scroll', fit);
    fit();
})(typeof window !== 'undefined' ? window : globalThis);
