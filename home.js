// Official homepage only: daily special, flip cards and the how-to-play demo.
// Does not load or depend on the game scripts; the static HTML works without it.
(function () {
    'use strict';

    // 10-point recipes, mirrored from rules.js (name, image, ingredients).
    const TEN_POINT_SPECIALS = [
        {
            name: '満腹カレー',
            image: 'assets/battle-images/recipes/manpuku-curry.webp',
            recipe: 'ごはん・牛肉・たまねぎ・にんじん・じゃがいも・カレー粉'
        },
        {
            name: '爆弾おにぎり',
            image: 'assets/battle-images/recipes/bakudan-onigiri.webp',
            recipe: 'ごはん×4・のり・魚'
        }
    ];

    function showDailySpecial() {
        const image = document.querySelector('[data-special-image]');
        const name = document.querySelector('[data-special-name]');
        const recipe = document.querySelector('[data-special-recipe]');
        if (!image || !name || !recipe) return;

        const now = new Date();
        const dayNumber = Math.floor(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86400000);
        const special = TEN_POINT_SPECIALS[dayNumber % TEN_POINT_SPECIALS.length];
        image.src = special.image;
        image.alt = special.name;
        name.textContent = special.name;
        recipe.textContent = special.recipe;
    }

    function setupFlipCards() {
        document.querySelectorAll('.flip-card').forEach(card => {
            card.addEventListener('click', () => {
                const flipped = card.classList.toggle('is-flipped');
                card.setAttribute('aria-pressed', String(flipped));
            });
        });
    }

    function setupPauseToggle(container, toggle, isOffscreen) {
        let pausedByUser = false;
        const apply = () => {
            container.classList.toggle('demo-paused', pausedByUser || isOffscreen());
            toggle.textContent = pausedByUser ? 'アニメを再生' : 'アニメを一時停止';
            toggle.setAttribute('aria-pressed', String(pausedByUser));
        };
        toggle.addEventListener('click', () => {
            pausedByUser = !pausedByUser;
            apply();
        });
        return apply;
    }

    function setupDemo() {
        const dialog = document.getElementById('demo-dialog');
        const dialogToggle = dialog && dialog.querySelector('[data-demo-toggle]');
        if (dialogToggle) setupPauseToggle(dialog, dialogToggle, () => false)();

        const layout = document.querySelector('.demo-inline');
        const stage = layout && layout.querySelector('[data-demo-stage]');
        const toggle = layout && layout.querySelector('[data-demo-toggle]');
        if (!layout || !stage || !toggle) return;

        let offscreen = false;
        const apply = setupPauseToggle(layout, toggle, () => offscreen);

        if ('IntersectionObserver' in window) {
            new IntersectionObserver(entries => {
                offscreen = !entries[0].isIntersecting;
                apply();
            }).observe(stage);
        }
        apply();
    }

    function selectDemoTab(dialog, number) {
        dialog.querySelectorAll('[data-demo-tab-button]').forEach(tab => {
            const active = tab.dataset.demoTabButton === String(number);
            tab.setAttribute('aria-selected', String(active));
            tab.tabIndex = active ? 0 : -1;
            document.getElementById(tab.getAttribute('aria-controls')).hidden = !active;
        });
    }

    function setupDialogs() {
        document.querySelectorAll('[data-open-dialog]').forEach(button => {
            button.addEventListener('click', () => {
                const dialog = document.getElementById(button.dataset.openDialog);
                if (!dialog || typeof dialog.showModal !== 'function') return;
                if (button.dataset.demoTab) selectDemoTab(dialog, button.dataset.demoTab);
                dialog.showModal();
            });
        });
        document.querySelectorAll('dialog.home-dialog').forEach(dialog => {
            dialog.addEventListener('click', event => {
                // Close on the close button or a click on the backdrop (outside the dialog box).
                const rect = dialog.getBoundingClientRect();
                const outside = event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right
                    || event.clientY < rect.top || event.clientY > rect.bottom);
                if (outside || event.target.closest('[data-close-dialog]')) dialog.close();
            });
            const tabs = [...dialog.querySelectorAll('[data-demo-tab-button]')];
            tabs.forEach((tab, index) => {
                tab.addEventListener('click', () => selectDemoTab(dialog, tab.dataset.demoTabButton));
                tab.addEventListener('keydown', event => {
                    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
                    if (!step) return;
                    const next = tabs[(index + step + tabs.length) % tabs.length];
                    selectDemoTab(dialog, next.dataset.demoTabButton);
                    next.focus();
                });
            });
        });
    }

    document.addEventListener('DOMContentLoaded', () => {
        setupDialogs();
        showDailySpecial();
        setupFlipCards();
        setupDemo();
    });
})();
