(function (root) {
    'use strict';
    // オーナー編集用。紹介本文は現在空欄です。空欄の項目は表示されません。
    // introAt: 全10話で一度だけ紹介する位置（話番号、scene ID、1始まりの行番号）。
    // 初登場の計算候補: node tools/measure-story-intros.cjs（読取のみ）。
    // 通常／再読／viewer共通。行・showのintro:false/true/本文オブジェクトが優先。
    // title: 名前の上の短い見出し / subtitle: 名前の下の補足 / text: 紹介本文。
    // 例: takumi.text = 'ここに承認した紹介文'; に相当する text 欄を編集。
    // 名前は千鶴・舞依・拓海・暁・栞那・剛のみ。姓や未承認の設定は足さないでください。
    root.BattleStoryCharacterIntros = {
        chizuru: { name: '千鶴', introAt: { episode: 3, scene: 'pre', line: 2 }, title: '', subtitle: '', text: '' },
        mai: { name: '舞依', introAt: { episode: 1, scene: 'pre', line: 1 }, title: '', subtitle: '', text: '' },
        takumi: { name: '拓海', introAt: { episode: 1, scene: 'pre', line: 2 }, title: '', subtitle: '', text: '' },
        akatsuki: { name: '暁', introAt: { episode: 3, scene: 'pre', line: 1 }, title: '', subtitle: '', text: '' },
        kanna: { name: '栞那', introAt: { episode: 3, scene: 'pre', line: 8 }, title: '', subtitle: '', text: '' },
        tsuyoshi: { name: '剛', introAt: { episode: 3, scene: 'pre', line: 5 }, title: '', subtitle: '', text: '' }
    };
})(window);
