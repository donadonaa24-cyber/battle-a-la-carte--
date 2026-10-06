// オーナー原文: docs/story/special-kyudo-scenario.md（2026-10-06）。呼称2か所のみ暫定変更。
// 簡易説明はCodex案、敗北会話はClaude案・オーナーレビュー待ち。
(function () {
    const address = '結月さん'; // PROVISIONAL：同学年の呼称。ここ一語で差し替え。
    window.BattleStoryData.register({
    "id": "special-kyudo",
    "arcLabel": "弓道編",
    "arc": "special",
    "title": "恋の的はひとつ？",
    "protagonist": "yuzuki",
    "unlockRequires": [
        "episode4",
        "episode5",
        "episode6",
        "episode7",
        "episode8",
        "episode9",
        "episode10"
    ],
    "summary": "弓道部の放課後。結月が舞依に挑む、拓海とのクレープをかけたカード勝負。",
    "costumes": {
        "yuzuki": "kyudo",
        "takumi": "kyudo",
        "mai": "kyudo"
    },
    "defaultPositions": {
        "yuzuki": "right",
        "takumi": "left",
        "mai": "left"
    },
    "scenes": [
        {
            "id": "scene1",
            "background": "kyudo-dojo-afternoon",
            "lines": [
                {
                    "id": "scene1-001",
                    "speaker": "yuzuki",
                    "position": "right",
                    "expression": "normal",
                    "direction": "【右：結月／弓道着】",
                    "text": "……"
                },
                {
                    "id": "scene1-002",
                    "speaker": "narration",
                    "text": "結月の視線の先",
                    "direction": "（結月の視線の先）"
                },
                {
                    "id": "scene1-003",
                    "speaker": "takumi",
                    "position": "left",
                    "expression": "normal",
                    "direction": "【左：拓海／弓道着】",
                    "text": "舞依、もう少し肩の力抜いてみて"
                },
                {
                    "id": "scene1-004",
                    "speaker": "mai",
                    "position": "left",
                    "expression": "normal",
                    "direction": "【左：舞依／弓道着】",
                    "text": "こうですか？"
                },
                {
                    "id": "scene1-005",
                    "speaker": "takumi",
                    "position": "left",
                    "expression": "normal",
                    "direction": "",
                    "text": "うん、そのほうがいい"
                },
                {
                    "id": "scene1-006",
                    "speaker": "mai",
                    "position": "left",
                    "expression": "normal",
                    "direction": "",
                    "text": "ありがとうございます"
                },
                {
                    "id": "scene1-007",
                    "speaker": "yuzuki",
                    "position": "right",
                    "expression": "troubled",
                    "direction": "【右：結月／少し不満】",
                    "text": "……今日もいる"
                },
                {
                    "id": "scene1-008",
                    "speaker": "yuzuki",
                    "position": "right",
                    "expression": "troubled",
                    "direction": "",
                    "text": "まあ、同じ部活だから当たり前だけど"
                },
                {
                    "id": "scene1-009",
                    "speaker": "yuzuki",
                    "position": "right",
                    "expression": "normal",
                    "direction": "【結月／じっと見る】",
                    "text": "距離近くない？"
                },
                {
                    "id": "scene1-010",
                    "speaker": "narration",
                    "text": "拓海が舞依のフォームを見る",
                    "direction": "（拓海が舞依のフォームを見る）"
                },
                {
                    "id": "scene1-011",
                    "speaker": "yuzuki",
                    "position": "right",
                    "expression": "normal",
                    "direction": "",
                    "text": "近い"
                },
                {
                    "id": "scene1-012",
                    "speaker": "yuzuki",
                    "position": "right",
                    "expression": "normal",
                    "direction": "",
                    "text": "絶対近い"
                },
                {
                    "id": "scene1-013",
                    "speaker": "narration",
                    "text": "舞依が矢を放つ",
                    "direction": "（舞依が矢を放つ）"
                },
                {
                    "id": "scene1-014",
                    "speaker": "narration",
                    "text": "",
                    "direction": "SE：的中",
                    "se": "thud"
                },
                {
                    "id": "scene1-015",
                    "speaker": "takumi",
                    "position": "left",
                    "expression": "smile",
                    "direction": "【拓海／笑顔】",
                    "text": "いいね"
                },
                {
                    "id": "scene1-016",
                    "speaker": "mai",
                    "position": "left",
                    "expression": "normal",
                    "direction": "",
                    "text": "今日は調子いいです"
                },
                {
                    "id": "scene1-017",
                    "speaker": "yuzuki",
                    "position": "right",
                    "expression": "normal",
                    "direction": "【結月／小声】",
                    "text": "……褒めてもらってる"
                },
                {
                    "id": "scene1-018",
                    "speaker": "yuzuki",
                    "position": "right",
                    "expression": "normal",
                    "direction": "",
                    "text": "羨ましい"
                }
            ]
        },
        {
            "id": "scene2",
            "background": "kyudo-dojo-afternoon",
            "lines": [
                {
                    "id": "scene2-001",
                    "speaker": "yuzuki",
                    "position": "right",
                    "expression": "smile",
                    "direction": "【右：結月／笑顔】",
                    "text": "拓海くん"
                },
                {
                    "id": "scene2-002",
                    "speaker": "takumi",
                    "position": "left",
                    "expression": "normal",
                    "direction": "【左：拓海】",
                    "text": "ん？"
                },
                {
                    "id": "scene2-003",
                    "speaker": "yuzuki",
                    "position": "right",
                    "expression": "smile",
                    "direction": "",
                    "text": "今日一緒に帰らない？"
                },
                {
                    "id": "scene2-004",
                    "speaker": "takumi",
                    "position": "left",
                    "expression": "surprised",
                    "direction": "【拓海／少し驚く】",
                    "text": "今日？"
                },
                {
                    "id": "scene2-005",
                    "speaker": "yuzuki",
                    "position": "right",
                    "expression": "smile",
                    "direction": "",
                    "text": "うん"
                },
                {
                    "id": "scene2-006",
                    "speaker": "yuzuki",
                    "position": "right",
                    "expression": "smile",
                    "direction": "【結月／笑顔】",
                    "text": "駅前に新しいクレープ屋できたんだって"
                },
                {
                    "id": "scene2-007",
                    "speaker": "takumi",
                    "position": "left",
                    "expression": "surprised",
                    "direction": "",
                    "text": "へえ、知らなかった"
                },
                {
                    "id": "scene2-008",
                    "speaker": "yuzuki",
                    "position": "right",
                    "expression": "smile",
                    "direction": "",
                    "text": "だから行こうよ"
                },
                {
                    "id": "scene2-009",
                    "speaker": "takumi",
                    "position": "left",
                    "expression": "troubled",
                    "direction": "【拓海／少し困りつつ柔らかく】",
                    "text": "いいね"
                },
                {
                    "id": "scene2-010",
                    "speaker": "yuzuki",
                    "position": "right",
                    "expression": "smile",
                    "direction": "【結月／嬉しそう】",
                    "text": "ほんと？"
                },
                {
                    "id": "scene2-011",
                    "speaker": "takumi",
                    "position": "left",
                    "expression": "troubled",
                    "direction": "",
                    "text": "ただ、舞依も一緒でいい？"
                },
                {
                    "id": "scene2-012",
                    "speaker": "narration",
                    "text": "",
                    "direction": "（一瞬の間）",
                    "wait": 800
                },
                {
                    "id": "scene2-013",
                    "speaker": "yuzuki",
                    "position": "right",
                    "expression": "smile",
                    "direction": "",
                    "text": "……"
                },
                {
                    "id": "scene2-014",
                    "speaker": "yuzuki",
                    "position": "right",
                    "expression": "smile",
                    "direction": "【結月／笑顔を作る】",
                    "text": "もちろん！"
                },
                {
                    "id": "scene2-015",
                    "speaker": "narration",
                    "text": "少し離れたところ",
                    "direction": "（少し離れたところ）"
                },
                {
                    "id": "scene2-016",
                    "speaker": "mai",
                    "position": "left",
                    "expression": "normal",
                    "direction": "【舞依／真顔】",
                    "text": "私？"
                },
                {
                    "id": "scene2-017",
                    "speaker": "takumi",
                    "position": "left",
                    "expression": "troubled",
                    "direction": "",
                    "text": "嫌？"
                },
                {
                    "id": "scene2-018",
                    "speaker": "mai",
                    "position": "left",
                    "expression": "normal",
                    "direction": "",
                    "text": "別に嫌じゃないですけど"
                },
                {
                    "id": "scene2-019",
                    "speaker": "mai",
                    "position": "left",
                    "expression": "normal",
                    "direction": "",
                    "text": `${address}、拓海先輩と二人で行きたいんじゃないですか`,
                    "addressProvisional": true,
                    "addressOriginal": "結月先輩"
                },
                {
                    "id": "scene2-020",
                    "speaker": "takumi",
                    "position": "left",
                    "expression": "troubled",
                    "direction": "【拓海／少し困る】",
                    "text": "そうなの？"
                },
                {
                    "id": "scene2-021",
                    "speaker": "yuzuki",
                    "position": "right",
                    "expression": "smile",
                    "direction": "【結月／即答】",
                    "text": "そうだよ"
                },
                {
                    "id": "scene2-022",
                    "speaker": "takumi",
                    "position": "left",
                    "expression": "troubled",
                    "direction": "",
                    "text": "そっか"
                },
                {
                    "id": "scene2-023",
                    "speaker": "yuzuki",
                    "position": "right",
                    "expression": "smile",
                    "direction": "",
                    "text": "だから二人で行こう？"
                },
                {
                    "id": "scene2-024",
                    "speaker": "takumi",
                    "position": "left",
                    "expression": "laugh",
                    "direction": "【拓海／少し笑う】",
                    "text": "うれしいけど、今日は舞依も一緒かな"
                },
                {
                    "id": "scene2-025",
                    "speaker": "yuzuki",
                    "position": "right",
                    "expression": "smile",
                    "direction": "",
                    "text": "かな？"
                },
                {
                    "id": "scene2-026",
                    "speaker": "takumi",
                    "position": "left",
                    "expression": "laugh",
                    "direction": "",
                    "text": "帰る方向同じだし"
                },
                {
                    "id": "scene2-027",
                    "speaker": "mai",
                    "position": "left",
                    "expression": "troubled",
                    "direction": "【舞依／少し呆れる】",
                    "text": "……"
                },
                {
                    "id": "scene2-028",
                    "speaker": "takumi",
                    "position": "left",
                    "expression": "laugh",
                    "direction": "",
                    "text": "舞依？"
                },
                {
                    "id": "scene2-029",
                    "speaker": "mai",
                    "position": "left",
                    "expression": "troubled",
                    "direction": "",
                    "text": "なんでもないです"
                },
                {
                    "id": "scene2-030",
                    "speaker": "mai",
                    "position": "left",
                    "expression": "troubled",
                    "direction": "【舞依／小声】",
                    "text": "はっきりしない人"
                },
                {
                    "id": "scene2-031",
                    "speaker": "takumi",
                    "position": "left",
                    "expression": "laugh",
                    "direction": "",
                    "text": "何か言った？"
                },
                {
                    "id": "scene2-032",
                    "speaker": "mai",
                    "position": "left",
                    "expression": "troubled",
                    "direction": "",
                    "text": "別に"
                }
            ]
        },
        {
            "id": "scene3",
            "background": "kyudo-dojo-afternoon",
            "lines": [
                {
                    "id": "scene3-001",
                    "speaker": "yuzuki",
                    "position": "right",
                    "expression": "normal",
                    "direction": "【右：結月】",
                    "text": "舞依ちゃん"
                },
                {
                    "id": "scene3-002",
                    "speaker": "mai",
                    "position": "left",
                    "expression": "normal",
                    "direction": "【左：舞依】",
                    "text": "はい"
                },
                {
                    "id": "scene3-003",
                    "speaker": "yuzuki",
                    "position": "right",
                    "expression": "smile",
                    "direction": "【結月／笑顔】",
                    "text": "今度一緒に遊ばない？"
                },
                {
                    "id": "scene3-004",
                    "speaker": "mai",
                    "position": "left",
                    "expression": "surprised",
                    "direction": "【舞依／少し意外そう】",
                    "text": "私と？"
                },
                {
                    "id": "scene3-005",
                    "speaker": "yuzuki",
                    "position": "right",
                    "expression": "smile",
                    "direction": "",
                    "text": "うん"
                },
                {
                    "id": "scene3-006",
                    "speaker": "yuzuki",
                    "position": "right",
                    "expression": "smile",
                    "direction": "",
                    "text": "もっと仲良くなりたいなって"
                },
                {
                    "id": "scene3-007",
                    "speaker": "mai",
                    "position": "left",
                    "expression": "surprised",
                    "direction": "",
                    "text": "いいですよ"
                },
                {
                    "id": "scene3-008",
                    "speaker": "yuzuki",
                    "position": "right",
                    "expression": "surprised",
                    "direction": "【結月／少し驚く】",
                    "text": "即答なんだ"
                },
                {
                    "id": "scene3-009",
                    "speaker": "mai",
                    "position": "left",
                    "expression": "surprised",
                    "direction": "",
                    "text": "女の子から誘われたので"
                },
                {
                    "id": "scene3-010",
                    "speaker": "yuzuki",
                    "position": "right",
                    "expression": "surprised",
                    "direction": "",
                    "text": "……なるほど"
                },
                {
                    "id": "scene3-011",
                    "speaker": "narration",
                    "text": "",
                    "direction": "（少し間）",
                    "wait": 800
                },
                {
                    "id": "scene3-012",
                    "speaker": "yuzuki",
                    "position": "right",
                    "expression": "surprised",
                    "direction": "",
                    "text": "でもさ"
                },
                {
                    "id": "scene3-013",
                    "speaker": "mai",
                    "position": "left",
                    "expression": "surprised",
                    "direction": "",
                    "text": "？"
                },
                {
                    "id": "scene3-014",
                    "speaker": "yuzuki",
                    "position": "right",
                    "expression": "surprised",
                    "direction": "",
                    "text": "舞依ちゃんって拓海くんのことどう思ってるの？"
                },
                {
                    "id": "scene3-015",
                    "speaker": "mai",
                    "position": "left",
                    "expression": "surprised",
                    "direction": "",
                    "text": "拓海先輩？"
                },
                {
                    "id": "scene3-016",
                    "speaker": "mai",
                    "position": "left",
                    "expression": "surprised",
                    "direction": "",
                    "text": "優しい先輩です"
                },
                {
                    "id": "scene3-017",
                    "speaker": "yuzuki",
                    "position": "right",
                    "expression": "surprised",
                    "direction": "",
                    "text": "それだけ？"
                },
                {
                    "id": "scene3-018",
                    "speaker": "mai",
                    "position": "left",
                    "expression": "surprised",
                    "direction": "",
                    "text": "それだけです"
                },
                {
                    "id": "scene3-019",
                    "speaker": "yuzuki",
                    "position": "right",
                    "expression": "gentle",
                    "direction": "【結月／少し安心】",
                    "text": "ほんとに？"
                },
                {
                    "id": "scene3-020",
                    "speaker": "mai",
                    "position": "left",
                    "expression": "surprised",
                    "direction": "",
                    "text": "はい"
                },
                {
                    "id": "scene3-021",
                    "speaker": "yuzuki",
                    "position": "right",
                    "expression": "gentle",
                    "direction": "",
                    "text": "じゃあ私が拓海くんのこと好きでも問題ない？"
                },
                {
                    "id": "scene3-022",
                    "speaker": "mai",
                    "position": "left",
                    "expression": "surprised",
                    "direction": "",
                    "text": "どうぞ"
                },
                {
                    "id": "scene3-023",
                    "speaker": "yuzuki",
                    "position": "right",
                    "expression": "gentle",
                    "direction": "",
                    "text": "……"
                },
                {
                    "id": "scene3-024",
                    "speaker": "mai",
                    "position": "left",
                    "expression": "surprised",
                    "direction": "",
                    "text": "何ですか"
                },
                {
                    "id": "scene3-025",
                    "speaker": "yuzuki",
                    "position": "right",
                    "expression": "gentle",
                    "direction": "",
                    "text": "もうちょっと反応あるかと思った"
                },
                {
                    "id": "scene3-026",
                    "speaker": "mai",
                    "position": "left",
                    "expression": "surprised",
                    "direction": "",
                    "text": "なんでですか"
                },
                {
                    "id": "scene3-027",
                    "speaker": "yuzuki",
                    "position": "right",
                    "expression": "laugh",
                    "direction": "【結月／笑う】",
                    "text": "なんとなく"
                }
            ]
        },
        {
            "id": "scene4",
            "background": "kyudo-dojo-afternoon",
            "lines": [
                {
                    "id": "scene4-001",
                    "speaker": "narration",
                    "text": "練習再開。結月と舞依がそれぞれ矢を放つ。",
                    "direction": "練習再開。結月と舞依がそれぞれ矢を放つ。"
                },
                {
                    "id": "scene4-002",
                    "speaker": "narration",
                    "text": "",
                    "direction": "SE：的中",
                    "se": "thud"
                },
                {
                    "id": "scene4-003",
                    "speaker": "yuzuki",
                    "position": "right",
                    "expression": "troubled",
                    "direction": "【右：結月／少し悔しい】",
                    "text": "また当てた"
                },
                {
                    "id": "scene4-004",
                    "speaker": "mai",
                    "position": "left",
                    "expression": "normal",
                    "direction": "【左：舞依】",
                    "text": "今日は調子いいので"
                },
                {
                    "id": "scene4-005",
                    "speaker": "yuzuki",
                    "position": "right",
                    "expression": "troubled",
                    "direction": "",
                    "text": "舞依ちゃん強いよね"
                },
                {
                    "id": "scene4-006",
                    "speaker": "mai",
                    "position": "left",
                    "expression": "normal",
                    "direction": "",
                    "text": "ありがとうございます"
                },
                {
                    "id": "scene4-007",
                    "speaker": "yuzuki",
                    "position": "right",
                    "expression": "troubled",
                    "direction": "",
                    "text": "私、弓道じゃ勝てる気しない"
                },
                {
                    "id": "scene4-008",
                    "speaker": "mai",
                    "position": "left",
                    "expression": "normal",
                    "direction": "",
                    "text": "勝負してたんですか？"
                },
                {
                    "id": "scene4-009",
                    "speaker": "yuzuki",
                    "position": "right",
                    "expression": "troubled",
                    "direction": "",
                    "text": "今決めた"
                },
                {
                    "id": "scene4-010",
                    "speaker": "mai",
                    "position": "left",
                    "expression": "normal",
                    "direction": "",
                    "text": "そうですか"
                },
                {
                    "id": "scene4-011",
                    "speaker": "yuzuki",
                    "position": "right",
                    "expression": "troubled",
                    "direction": "【結月／少しむっとする】",
                    "text": "その余裕ちょっと悔しい"
                },
                {
                    "id": "scene4-012",
                    "speaker": "takumi",
                    "position": "left",
                    "expression": "normal",
                    "direction": "【左：拓海／近づく】",
                    "text": "二人とも何の話？"
                },
                {
                    "id": "scene4-013",
                    "speaker": "yuzuki",
                    "position": "right",
                    "expression": "troubled",
                    "direction": "",
                    "text": "勝負の話"
                },
                {
                    "id": "scene4-014",
                    "speaker": "takumi",
                    "position": "left",
                    "expression": "normal",
                    "direction": "",
                    "text": "勝負？"
                },
                {
                    "id": "scene4-015",
                    "speaker": "yuzuki",
                    "position": "right",
                    "expression": "troubled",
                    "direction": "",
                    "text": "舞依ちゃんに勝ちたい"
                },
                {
                    "id": "scene4-016",
                    "speaker": "mai",
                    "position": "left",
                    "expression": "normal",
                    "direction": "",
                    "text": "なんでですか"
                },
                {
                    "id": "scene4-017",
                    "speaker": "yuzuki",
                    "position": "right",
                    "expression": "troubled",
                    "direction": "",
                    "text": "なんとなく！"
                },
                {
                    "id": "scene4-018",
                    "speaker": "mai",
                    "position": "left",
                    "expression": "normal",
                    "direction": "",
                    "text": "絶対なんとなくじゃない"
                }
            ]
        },
        {
            "id": "scene5",
            "background": "kyudo-rest-area",
            "lines": [
                {
                    "id": "scene5-001",
                    "speaker": "takumi",
                    "position": "left",
                    "expression": "normal",
                    "direction": "【左：拓海】",
                    "text": "そういえば舞依"
                },
                {
                    "id": "scene5-002",
                    "speaker": "mai",
                    "position": "left",
                    "expression": "normal",
                    "direction": "",
                    "text": "はい"
                },
                {
                    "id": "scene5-003",
                    "speaker": "takumi",
                    "position": "left",
                    "expression": "normal",
                    "direction": "",
                    "text": "文化祭でやってたカードゲーム、まだ持ってる？"
                },
                {
                    "id": "scene5-004",
                    "speaker": "mai",
                    "position": "left",
                    "expression": "normal",
                    "direction": "",
                    "text": "Battle à la carte？"
                },
                {
                    "id": "scene5-005",
                    "speaker": "takumi",
                    "position": "left",
                    "expression": "normal",
                    "direction": "",
                    "text": "うん"
                },
                {
                    "id": "scene5-006",
                    "speaker": "yuzuki",
                    "position": "right",
                    "expression": "surprised",
                    "direction": "【右：結月／反応】",
                    "text": "何それ？"
                },
                {
                    "id": "scene5-007",
                    "speaker": "mai",
                    "position": "left",
                    "expression": "normal",
                    "direction": "",
                    "text": "料理を作って勝負するカードゲームです"
                },
                {
                    "id": "scene5-008",
                    "speaker": "yuzuki",
                    "position": "right",
                    "expression": "surprised",
                    "direction": "",
                    "text": "勝負？"
                },
                {
                    "id": "scene5-009",
                    "speaker": "takumi",
                    "position": "left",
                    "expression": "normal",
                    "direction": "",
                    "text": "文化祭で舞依と僕が遊んだんだ"
                },
                {
                    "id": "scene5-010",
                    "speaker": "yuzuki",
                    "position": "right",
                    "expression": "surprised",
                    "direction": "",
                    "text": "舞依ちゃん強い？"
                },
                {
                    "id": "scene5-011",
                    "speaker": "takumi",
                    "position": "left",
                    "expression": "smile",
                    "direction": "【拓海／笑顔】",
                    "text": "強いよ"
                },
                {
                    "id": "scene5-012",
                    "speaker": "yuzuki",
                    "position": "right",
                    "expression": "surprised",
                    "direction": "",
                    "text": "……"
                },
                {
                    "id": "scene5-013",
                    "speaker": "mai",
                    "position": "left",
                    "expression": "normal",
                    "direction": "",
                    "text": "嫌な予感する"
                },
                {
                    "id": "scene5-014",
                    "speaker": "yuzuki",
                    "position": "right",
                    "expression": "smile",
                    "direction": "【結月／笑顔】",
                    "text": "舞依ちゃん"
                },
                {
                    "id": "scene5-015",
                    "speaker": "mai",
                    "position": "left",
                    "expression": "normal",
                    "direction": "",
                    "text": "嫌です"
                },
                {
                    "id": "scene5-016",
                    "speaker": "yuzuki",
                    "position": "right",
                    "expression": "smile",
                    "direction": "",
                    "text": "まだ何も言ってない！"
                },
                {
                    "id": "scene5-017",
                    "speaker": "mai",
                    "position": "left",
                    "expression": "normal",
                    "direction": "",
                    "text": "勝負でしょ"
                },
                {
                    "id": "scene5-018",
                    "speaker": "yuzuki",
                    "position": "right",
                    "expression": "smile",
                    "direction": "",
                    "text": "正解！"
                },
                {
                    "id": "scene5-019",
                    "speaker": "mai",
                    "position": "left",
                    "expression": "normal",
                    "direction": "",
                    "text": "ルール知らないですよね？"
                },
                {
                    "id": "scene5-020",
                    "speaker": "yuzuki",
                    "position": "right",
                    "expression": "smile",
                    "direction": "",
                    "text": "教えて"
                },
                {
                    "id": "scene5-021",
                    "speaker": "mai",
                    "position": "left",
                    "expression": "normal",
                    "direction": "",
                    "text": "今から？"
                },
                {
                    "id": "scene5-022",
                    "speaker": "yuzuki",
                    "position": "right",
                    "expression": "smile",
                    "direction": "",
                    "text": "今から"
                },
                {
                    "id": "scene5-023",
                    "speaker": "mai",
                    "position": "left",
                    "expression": "laugh",
                    "direction": "【舞依／少し笑う】",
                    "text": "いいですよ"
                },
                {
                    "id": "scene5-024",
                    "speaker": "yuzuki",
                    "position": "right",
                    "expression": "smile",
                    "direction": "",
                    "text": "やった"
                },
                {
                    "id": "scene5-025",
                    "speaker": "narration",
                    "text": "",
                    "explanationChoice": {
                        "read": "rule-explanation",
                        "skip": "scene6"
                    }
                }
            ]
        },
        {
            "id": "rule-explanation",
            "background": "kyudo-rest-area",
            "next": "scene6",
            "lines": [
                {
                    "id": "rule-explanation-001",
                    "speaker": "mai",
                    "position": "left",
                    "expression": "normal",
                    "text": "まずは手札の材料をセットして、料理に必要な材料をそろえてください",
                    "authoredBy": "Codex",
                    "provisional": true
                },
                {
                    "id": "rule-explanation-002",
                    "speaker": "mai",
                    "position": "left",
                    "expression": "normal",
                    "text": "材料がそろったら料理を作れます。完成した料理の点数が入ります",
                    "authoredBy": "Codex",
                    "provisional": true
                },
                {
                    "id": "rule-explanation-003",
                    "speaker": "mai",
                    "position": "left",
                    "expression": "normal",
                    "text": "イベントは自分を助けたり、相手の邪魔をしたりするカードです。使いどころを考えてください",
                    "authoredBy": "Codex",
                    "provisional": true
                },
                {
                    "id": "rule-explanation-004",
                    "speaker": "mai",
                    "position": "left",
                    "expression": "normal",
                    "text": "ターンの終わりには、残った手札を上限まで減らして調整します",
                    "authoredBy": "Codex",
                    "provisional": true
                },
                {
                    "id": "rule-explanation-005",
                    "speaker": "mai",
                    "position": "left",
                    "expression": "normal",
                    "text": "先に目標の１０点を取った方が勝ちです。では、実際にやってみましょう",
                    "authoredBy": "Codex",
                    "provisional": true
                }
            ]
        },
        {
            "id": "scene6",
            "background": "kyudo-rest-area",
            "lines": [
                {
                    "id": "scene6-001",
                    "speaker": "yuzuki",
                    "position": "right",
                    "expression": "normal",
                    "direction": "【右：結月】",
                    "text": "分かった"
                },
                {
                    "id": "scene6-002",
                    "speaker": "mai",
                    "position": "left",
                    "expression": "normal",
                    "direction": "",
                    "text": "ほんとに？"
                },
                {
                    "id": "scene6-003",
                    "speaker": "yuzuki",
                    "position": "right",
                    "expression": "normal",
                    "direction": "",
                    "text": "多分"
                },
                {
                    "id": "scene6-004",
                    "speaker": "mai",
                    "position": "left",
                    "expression": "normal",
                    "direction": "",
                    "text": "不安"
                },
                {
                    "id": "scene6-005",
                    "speaker": "yuzuki",
                    "position": "right",
                    "expression": "normal",
                    "direction": "",
                    "text": "実戦で覚える！"
                },
                {
                    "id": "scene6-006",
                    "speaker": "mai",
                    "position": "left",
                    "expression": "normal",
                    "direction": "",
                    "text": "まあいいですけど"
                },
                {
                    "id": "scene6-007",
                    "speaker": "yuzuki",
                    "position": "right",
                    "expression": "normal",
                    "direction": "",
                    "text": "じゃあ勝負"
                },
                {
                    "id": "scene6-008",
                    "speaker": "mai",
                    "position": "left",
                    "expression": "normal",
                    "direction": "",
                    "text": "いいですよ"
                },
                {
                    "id": "scene6-009",
                    "speaker": "yuzuki",
                    "position": "right",
                    "expression": "smile",
                    "direction": "【結月／少し挑発的】",
                    "text": "私が勝ったら"
                },
                {
                    "id": "scene6-010",
                    "speaker": "mai",
                    "position": "left",
                    "expression": "normal",
                    "direction": "",
                    "text": "？"
                },
                {
                    "id": "scene6-011",
                    "speaker": "yuzuki",
                    "position": "right",
                    "expression": "smile",
                    "direction": "",
                    "text": "拓海くんと二人でクレープ食べに行く"
                },
                {
                    "id": "scene6-012",
                    "speaker": "mai",
                    "position": "left",
                    "expression": "normal",
                    "direction": "【舞依／真顔】",
                    "text": "勝手に行けばいいじゃないですか"
                },
                {
                    "id": "scene6-013",
                    "speaker": "yuzuki",
                    "position": "right",
                    "expression": "smile",
                    "direction": "",
                    "text": "え"
                },
                {
                    "id": "scene6-014",
                    "speaker": "mai",
                    "position": "left",
                    "expression": "normal",
                    "direction": "",
                    "text": "私に許可いらないですよ"
                },
                {
                    "id": "scene6-015",
                    "speaker": "yuzuki",
                    "position": "right",
                    "expression": "troubled",
                    "direction": "【結月／少し困る】",
                    "text": "そこはもうちょっと嫌がってよ"
                },
                {
                    "id": "scene6-016",
                    "speaker": "mai",
                    "position": "left",
                    "expression": "normal",
                    "direction": "",
                    "text": "なんで"
                },
                {
                    "id": "scene6-017",
                    "speaker": "takumi",
                    "position": "left",
                    "expression": "laugh",
                    "direction": "【拓海／少し笑う】",
                    "text": "僕の意思は？"
                },
                {
                    "id": "scene6-018",
                    "speaker": "yuzuki",
                    "position": "right",
                    "expression": "troubled",
                    "direction": "",
                    "text": "行く？"
                },
                {
                    "id": "scene6-019",
                    "speaker": "takumi",
                    "position": "left",
                    "expression": "laugh",
                    "direction": "",
                    "text": "勝ったら考える"
                },
                {
                    "id": "scene6-020",
                    "speaker": "yuzuki",
                    "position": "right",
                    "expression": "smile",
                    "direction": "【結月／嬉しそう】",
                    "text": "ほんと！？"
                },
                {
                    "id": "scene6-021",
                    "speaker": "mai",
                    "position": "left",
                    "expression": "normal",
                    "direction": "【舞依／拓海を見る】",
                    "text": "……"
                },
                {
                    "id": "scene6-022",
                    "speaker": "takumi",
                    "position": "left",
                    "expression": "laugh",
                    "direction": "",
                    "text": "何？"
                },
                {
                    "id": "scene6-023",
                    "speaker": "mai",
                    "position": "left",
                    "expression": "normal",
                    "direction": "",
                    "text": "別に"
                },
                {
                    "id": "scene6-024",
                    "speaker": "mai",
                    "position": "left",
                    "expression": "troubled",
                    "direction": "【舞依／少し呆れ】",
                    "text": "ほんとはっきりしないですね"
                },
                {
                    "id": "scene6-025",
                    "speaker": "takumi",
                    "position": "left",
                    "expression": "troubled",
                    "direction": "【拓海／苦笑】",
                    "text": "ごめん"
                },
                {
                    "id": "scene6-026",
                    "speaker": "mai",
                    "position": "left",
                    "expression": "troubled",
                    "direction": "",
                    "text": "謝るくらいならはっきりしてください"
                },
                {
                    "id": "scene6-027",
                    "speaker": "yuzuki",
                    "position": "right",
                    "expression": "smile",
                    "direction": "【結月／小声】",
                    "text": "そこは私も同意"
                },
                {
                    "id": "scene6-028",
                    "speaker": "takumi",
                    "position": "left",
                    "expression": "troubled",
                    "direction": "",
                    "text": "結月まで？"
                },
                {
                    "id": "battle-start",
                    "speaker": "narration",
                    "text": "",
                    "direction": "BATTLE START",
                    "battle": true,
                    "effect": "battleTease"
                }
            ]
        },
        {
            "id": "win",
            "background": "kyudo-rest-area",
            "lines": [
                {
                    "id": "win-001",
                    "speaker": "yuzuki",
                    "position": "right",
                    "expression": "laugh",
                    "direction": "【右：結月／大喜び】",
                    "text": "勝った！"
                },
                {
                    "id": "win-002",
                    "speaker": "mai",
                    "position": "left",
                    "expression": "troubled",
                    "direction": "【左：舞依／少し悔しそう】",
                    "text": "負けた"
                },
                {
                    "id": "win-003",
                    "speaker": "yuzuki",
                    "position": "right",
                    "expression": "laugh",
                    "direction": "",
                    "text": "弓道では勝てなくてもこっちなら勝てる！"
                },
                {
                    "id": "win-004",
                    "speaker": "mai",
                    "position": "left",
                    "expression": "troubled",
                    "direction": "",
                    "text": "今日初めてやった人に負けた……"
                },
                {
                    "id": "win-005",
                    "speaker": "yuzuki",
                    "position": "right",
                    "expression": "smile",
                    "direction": "【結月／笑顔】",
                    "text": "才能かも"
                },
                {
                    "id": "win-006",
                    "speaker": "mai",
                    "position": "left",
                    "expression": "troubled",
                    "direction": "",
                    "text": "調子に乗ってる"
                },
                {
                    "id": "win-007",
                    "speaker": "yuzuki",
                    "position": "right",
                    "expression": "normal",
                    "direction": "【結月／拓海を見る】",
                    "text": "拓海くん！"
                },
                {
                    "id": "win-008",
                    "speaker": "takumi",
                    "position": "left",
                    "expression": "normal",
                    "direction": "",
                    "text": "はいはい"
                },
                {
                    "id": "win-009",
                    "speaker": "yuzuki",
                    "position": "right",
                    "expression": "normal",
                    "direction": "",
                    "text": "クレープ！"
                },
                {
                    "id": "win-010",
                    "speaker": "takumi",
                    "position": "left",
                    "expression": "smile",
                    "direction": "【拓海／笑顔】",
                    "text": "覚えてるよ"
                },
                {
                    "id": "win-011",
                    "speaker": "yuzuki",
                    "position": "right",
                    "expression": "smile",
                    "direction": "【結月／嬉しそう】",
                    "text": "じゃあ行こう！"
                },
                {
                    "id": "win-012",
                    "speaker": "takumi",
                    "position": "left",
                    "expression": "smile",
                    "direction": "",
                    "text": "今から？"
                },
                {
                    "id": "win-013",
                    "speaker": "yuzuki",
                    "position": "right",
                    "expression": "smile",
                    "direction": "",
                    "text": "今から！"
                },
                {
                    "id": "win-014",
                    "speaker": "narration",
                    "text": "拓海が舞依を見る",
                    "direction": "（拓海が舞依を見る）"
                },
                {
                    "id": "win-015",
                    "speaker": "takumi",
                    "position": "left",
                    "expression": "smile",
                    "direction": "",
                    "text": "舞依も行く？"
                },
                {
                    "id": "win-016",
                    "speaker": "yuzuki",
                    "position": "right",
                    "expression": "surprised",
                    "direction": "【結月／固まる】",
                    "text": "……"
                },
                {
                    "id": "win-017",
                    "speaker": "mai",
                    "position": "left",
                    "expression": "troubled",
                    "direction": "【舞依／呆れる】",
                    "text": "行きません"
                },
                {
                    "id": "win-018",
                    "speaker": "takumi",
                    "position": "left",
                    "expression": "smile",
                    "direction": "",
                    "text": "そっか"
                },
                {
                    "id": "win-019",
                    "speaker": "mai",
                    "position": "left",
                    "expression": "troubled",
                    "direction": "",
                    "text": `${address}と約束したんでしょ`,
                    "addressProvisional": true,
                    "addressOriginal": "結月先輩"
                },
                {
                    "id": "win-020",
                    "speaker": "takumi",
                    "position": "left",
                    "expression": "smile",
                    "direction": "",
                    "text": "うん"
                },
                {
                    "id": "win-021",
                    "speaker": "mai",
                    "position": "left",
                    "expression": "troubled",
                    "direction": "",
                    "text": "なら二人で行けばいいじゃないですか"
                },
                {
                    "id": "win-022",
                    "speaker": "takumi",
                    "position": "left",
                    "expression": "laugh",
                    "direction": "【拓海／柔らかく笑う】",
                    "text": "分かった"
                },
                {
                    "id": "win-023",
                    "speaker": "yuzuki",
                    "position": "right",
                    "expression": "normal",
                    "direction": "【結月／舞依を見る】",
                    "text": "舞依ちゃん"
                },
                {
                    "id": "win-024",
                    "speaker": "mai",
                    "position": "left",
                    "expression": "troubled",
                    "direction": "",
                    "text": "何ですか"
                },
                {
                    "id": "win-025",
                    "speaker": "yuzuki",
                    "position": "right",
                    "expression": "normal",
                    "direction": "",
                    "text": "……ありがと"
                },
                {
                    "id": "win-026",
                    "speaker": "mai",
                    "position": "left",
                    "expression": "troubled",
                    "direction": "",
                    "text": "別に譲ったわけじゃないです"
                },
                {
                    "id": "win-027",
                    "speaker": "yuzuki",
                    "position": "right",
                    "expression": "normal",
                    "direction": "",
                    "text": "それでも"
                },
                {
                    "id": "win-028",
                    "speaker": "mai",
                    "position": "left",
                    "expression": "troubled",
                    "direction": "",
                    "text": "じゃあ今度また勝負しましょう"
                },
                {
                    "id": "win-029",
                    "speaker": "yuzuki",
                    "position": "right",
                    "expression": "surprised",
                    "direction": "【結月／驚く】",
                    "text": "いいの？"
                },
                {
                    "id": "win-030",
                    "speaker": "mai",
                    "position": "left",
                    "expression": "troubled",
                    "direction": "",
                    "text": "次は負けないので"
                },
                {
                    "id": "win-031",
                    "speaker": "yuzuki",
                    "position": "right",
                    "expression": "smile",
                    "direction": "【結月／笑顔】",
                    "text": "望むところ！"
                }
            ],
            "next": "scene7"
        },
        {
            "id": "scene7",
            "background": "school-gate-evening-sakuraba",
            "lines": [
                {
                    "id": "scene7-001",
                    "speaker": "yuzuki",
                    "position": "right",
                    "expression": "normal",
                    "direction": "",
                    "text": "舞依ちゃん！"
                },
                {
                    "id": "scene7-002",
                    "speaker": "mai",
                    "position": "left",
                    "expression": "normal",
                    "direction": "",
                    "text": "？"
                },
                {
                    "id": "scene7-003",
                    "speaker": "yuzuki",
                    "position": "right",
                    "expression": "normal",
                    "direction": "",
                    "text": "今度、本当に遊びに行こうね"
                },
                {
                    "id": "scene7-004",
                    "speaker": "mai",
                    "position": "left",
                    "expression": "normal",
                    "direction": "",
                    "text": "いいですよ"
                },
                {
                    "id": "scene7-005",
                    "speaker": "yuzuki",
                    "position": "right",
                    "expression": "laugh",
                    "direction": "【結月／少し笑う】",
                    "text": "拓海くん抜きで"
                },
                {
                    "id": "scene7-006",
                    "speaker": "mai",
                    "position": "left",
                    "expression": "normal",
                    "direction": "【舞依／即答】",
                    "text": "そのほうがいいです"
                },
                {
                    "id": "scene7-007",
                    "speaker": "takumi",
                    "position": "left",
                    "expression": "normal",
                    "direction": "【拓海／少し離れて】",
                    "text": "聞こえてるよ"
                },
                {
                    "id": "scene7-008",
                    "speaker": "mai",
                    "position": "left",
                    "expression": "normal",
                    "direction": "",
                    "text": "聞かせてます"
                },
                {
                    "id": "scene7-009",
                    "speaker": "yuzuki",
                    "position": "right",
                    "expression": "laugh",
                    "direction": "【結月／笑う】",
                    "text": "舞依ちゃん、結構言うね"
                },
                {
                    "id": "scene7-010",
                    "speaker": "mai",
                    "position": "left",
                    "expression": "normal",
                    "direction": "",
                    "text": "最近ちょっと思うところがあるので"
                },
                {
                    "id": "scene7-011",
                    "speaker": "takumi",
                    "position": "left",
                    "expression": "normal",
                    "direction": "",
                    "text": "僕？"
                },
                {
                    "id": "scene7-012",
                    "speaker": "mai",
                    "position": "left",
                    "expression": "normal",
                    "direction": "",
                    "text": "さあ"
                },
                {
                    "id": "scene7-013",
                    "speaker": "yuzuki",
                    "position": "right",
                    "expression": "normal",
                    "text": "舞依ちゃんは強い",
                    "direction": "",
                    "offscreen": true,
                    "monologue": true
                },
                {
                    "id": "scene7-014",
                    "speaker": "yuzuki",
                    "position": "right",
                    "expression": "normal",
                    "text": "弓道も",
                    "direction": "",
                    "offscreen": true,
                    "monologue": true
                },
                {
                    "id": "scene7-015",
                    "speaker": "yuzuki",
                    "position": "right",
                    "expression": "normal",
                    "text": "Battle à la carteも",
                    "direction": "",
                    "offscreen": true,
                    "monologue": true
                },
                {
                    "id": "scene7-016",
                    "speaker": "yuzuki",
                    "position": "right",
                    "expression": "normal",
                    "text": "それに拓海くんは、いつも舞依ちゃんの近くにいる",
                    "direction": "",
                    "offscreen": true,
                    "monologue": true
                },
                {
                    "id": "scene7-017",
                    "speaker": "narration",
                    "text": "",
                    "direction": "（少し間）",
                    "wait": 800
                },
                {
                    "id": "scene7-018",
                    "speaker": "yuzuki",
                    "position": "right",
                    "expression": "normal",
                    "text": "やっぱりライバルだと思う",
                    "direction": "",
                    "offscreen": true,
                    "monologue": true
                },
                {
                    "id": "scene7-019",
                    "speaker": "yuzuki",
                    "position": "right",
                    "expression": "normal",
                    "text": "でも",
                    "direction": "",
                    "offscreen": true,
                    "monologue": true
                },
                {
                    "id": "scene7-020",
                    "speaker": "yuzuki",
                    "position": "right",
                    "expression": "normal",
                    "text": "嫌いにはなれそうにない",
                    "direction": "",
                    "offscreen": true,
                    "monologue": true
                },
                {
                    "id": "scene7-021",
                    "speaker": "takumi",
                    "position": "left",
                    "expression": "normal",
                    "direction": "",
                    "text": "結月、行こうか"
                },
                {
                    "id": "scene7-022",
                    "speaker": "yuzuki",
                    "position": "right",
                    "expression": "smile",
                    "direction": "【結月／嬉しそう】",
                    "text": "うん！"
                },
                {
                    "id": "scene7-023",
                    "speaker": "mai",
                    "position": "left",
                    "expression": "normal",
                    "direction": "",
                    "text": "クレープ楽しんできてください"
                },
                {
                    "id": "scene7-024",
                    "speaker": "yuzuki",
                    "position": "right",
                    "expression": "smile",
                    "direction": "",
                    "text": "行ってきます！"
                },
                {
                    "id": "scene7-025",
                    "speaker": "takumi",
                    "position": "left",
                    "expression": "normal",
                    "direction": "",
                    "text": "また明日"
                },
                {
                    "id": "scene7-026",
                    "speaker": "mai",
                    "position": "left",
                    "expression": "normal",
                    "direction": "",
                    "text": "はい"
                },
                {
                    "id": "scene7-027",
                    "speaker": "narration",
                    "text": "二人が歩き出す。少しして",
                    "direction": "（二人が歩き出す。少しして）"
                },
                {
                    "id": "scene7-028",
                    "speaker": "yuzuki",
                    "position": "right",
                    "expression": "smile",
                    "direction": "",
                    "text": "拓海くん"
                },
                {
                    "id": "scene7-029",
                    "speaker": "takumi",
                    "position": "left",
                    "expression": "normal",
                    "direction": "",
                    "text": "ん？"
                },
                {
                    "id": "scene7-030",
                    "speaker": "yuzuki",
                    "position": "right",
                    "expression": "smile",
                    "direction": "",
                    "text": "今日のこれ、デートってことでいい？"
                },
                {
                    "id": "scene7-031",
                    "speaker": "takumi",
                    "position": "left",
                    "expression": "laugh",
                    "direction": "【拓海／少し困りつつ笑う】",
                    "text": "どうだろう"
                },
                {
                    "id": "scene7-032",
                    "speaker": "yuzuki",
                    "position": "right",
                    "expression": "smile",
                    "direction": "",
                    "text": "また濁した！"
                },
                {
                    "id": "scene7-033",
                    "speaker": "takumi",
                    "position": "left",
                    "expression": "laugh",
                    "direction": "",
                    "text": "ごめんごめん"
                },
                {
                    "id": "scene7-034",
                    "speaker": "mai",
                    "position": "left",
                    "expression": "normal",
                    "direction": "（遠くから舞依の声）",
                    "text": "やっぱりはっきりしない！",
                    "offscreen": true
                },
                {
                    "id": "scene7-035",
                    "speaker": "takumi",
                    "position": "left",
                    "expression": "surprised",
                    "direction": "【拓海／驚く】",
                    "text": "まだ聞こえてた！？"
                },
                {
                    "id": "scene7-036",
                    "speaker": "yuzuki",
                    "position": "right",
                    "expression": "laugh",
                    "direction": "【結月／大笑い】",
                    "text": "あはは！"
                },
                {
                    "id": "scene7-037",
                    "speaker": "narration",
                    "text": "",
                    "direction": "画面暗転",
                    "hide": "all",
                    "effect": "fadeOut"
                }
            ]
        },
        {
            "id": "lose",
            "background": "kyudo-rest-area",
            "provisional": true,
            "lines": [
                {
                    "id": "lose-001",
                    "speaker": "mai",
                    "position": "left",
                    "expression": "smile",
                    "text": "私の勝ちですね",
                    "direction": "",
                    "authoredBy": "Claude",
                    "provisional": true
                },
                {
                    "id": "lose-002",
                    "speaker": "yuzuki",
                    "position": "right",
                    "expression": "troubled",
                    "text": "今のなし！もう一回！",
                    "direction": "",
                    "authoredBy": "Claude",
                    "provisional": true
                },
                {
                    "id": "lose-003",
                    "speaker": "mai",
                    "position": "left",
                    "expression": "gentle",
                    "text": "初めてにしては、悪くなかったですよ",
                    "direction": "",
                    "authoredBy": "Claude",
                    "provisional": true
                },
                {
                    "id": "lose-004",
                    "speaker": "yuzuki",
                    "position": "right",
                    "expression": "smile",
                    "text": "次は勝つから！",
                    "direction": "",
                    "authoredBy": "Claude",
                    "provisional": true
                }
            ]
        }
    ],
    "battle": {
        "after": "battle-start",
        "background": "kyudo-rest-area",
        "player": "yuzuki",
        "cpu": "mai",
        "playerSkill": "choose",
        "cpuSkill": "random",
        "cpuPersonality": "default"
    },
    "afterBattle": {
        "win": "win",
        "lose": "lose"
    },
    "clear": {
        "title": "恋の的はひとつ？",
        "rewards": {
            "unlockCharacter": "yuzuki",
            "storyCharacter": "yuzuki",
            "costumes": [
                "yuzuki:kyudo",
                "takumi:kyudo",
                "mai:kyudo"
            ],
            "costumeLabel": "結月・拓海・舞依『弓道着』"
        }
    }
});
})();
