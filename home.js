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

    function setupDemo() {
        const layout = document.querySelector('.demo-layout');
        const stage = document.querySelector('[data-demo-stage]');
        const toggle = document.querySelector('[data-demo-toggle]');
        if (!layout || !stage || !toggle) return;

        let pausedByUser = false;
        let offscreen = false;
        const apply = () => {
            layout.classList.toggle('demo-paused', pausedByUser || offscreen);
            toggle.textContent = pausedByUser ? 'アニメを再生' : 'アニメを一時停止';
            toggle.setAttribute('aria-pressed', String(pausedByUser));
        };

        toggle.addEventListener('click', () => {
            pausedByUser = !pausedByUser;
            apply();
        });

        if ('IntersectionObserver' in window) {
            new IntersectionObserver(entries => {
                offscreen = !entries[0].isIntersecting;
                apply();
            }).observe(stage);
        }
        apply();
    }

    document.addEventListener('DOMContentLoaded', () => {
        showDailySpecial();
        setupFlipCards();
        setupDemo();
    });
})();
