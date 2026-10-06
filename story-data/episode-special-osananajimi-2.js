// オーナー原文＋承認済み整合編集: docs/story/special-osananajimi-scenario.md（2026-10-06／07）。
// 簡易説明はCodex案、敗北4行はClaude案・オーナーレビュー待ち。
window.BattleStoryData.register({
    "id": "special-osananajimi-2",
    "arc": "special",
    "arcLabel": "幼馴染編 後編",
    "title": "負けられない男",
    "protagonist": "ryuta",
    "unlockRequires": [
        "special-osananajimi-1"
    ],
    "unlockNotice": "幼馴染編 前編クリアで解放",
    "summary": "喧嘩を止めた剛のひと騒動から、龍太と暁のカード勝負へ。",
    "defaultPositions": {
        "chizuru": "left",
        "kanna": "left",
        "mai": "left",
        "takumi": "left",
        "akatsuki": "left",
        "tsuyoshi": "left",
        "ryuta": "right",
        "yuzuki": "left"
    },
    "scenes": [
        {
            "id": "scene1",
            "background": "big-park-evening",
            "lines": [
                {
                    "id": "scene1-001",
                    "speaker": "ryuta",
                    "position": "right",
                    "expression": "normal",
                    "text": "……は？",
                    "direction": "【右：龍太／頬を押さえる】"
                },
                {
                    "id": "scene1-002",
                    "speaker": "akatsuki",
                    "position": "left",
                    "expression": "normal",
                    "text": "は？",
                    "direction": "【左：暁】"
                },
                {
                    "id": "scene1-003",
                    "speaker": "tsuyoshi",
                    "position": "left",
                    "expression": "normal",
                    "text": "……",
                    "direction": ""
                },
                {
                    "id": "scene1-004",
                    "speaker": "akatsuki",
                    "position": "left",
                    "expression": "normal",
                    "text": "お前何してんねん！",
                    "direction": ""
                },
                {
                    "id": "scene1-005",
                    "speaker": "narration",
                    "text": "暁が龍太へ向かおうとする。剛が後ろから暁を抑え込む",
                    "direction": "（暁が龍太へ向かおうとする。剛が後ろから暁を抑え込む）"
                },
                {
                    "id": "scene1-006",
                    "speaker": "akatsuki",
                    "position": "left",
                    "expression": "normal",
                    "text": "離せや！",
                    "direction": ""
                },
                {
                    "id": "scene1-007",
                    "speaker": "tsuyoshi",
                    "position": "left",
                    "expression": "normal",
                    "text": "落ち着け！",
                    "direction": ""
                },
                {
                    "id": "scene1-008",
                    "speaker": "akatsuki",
                    "position": "left",
                    "expression": "normal",
                    "text": "お前が一番意味分からんねん！",
                    "direction": ""
                },
                {
                    "id": "scene1-009",
                    "speaker": "tsuyoshi",
                    "position": "left",
                    "expression": "normal",
                    "text": "今離したら絶対行くやろ！",
                    "direction": ""
                },
                {
                    "id": "scene1-010",
                    "speaker": "akatsuki",
                    "position": "left",
                    "expression": "normal",
                    "text": "行くわ！",
                    "direction": ""
                },
                {
                    "id": "scene1-011",
                    "speaker": "tsuyoshi",
                    "position": "left",
                    "expression": "normal",
                    "text": "せやから離されへんねん！",
                    "direction": ""
                },
                {
                    "id": "scene1-012",
                    "speaker": "narration",
                    "text": "舞依たちが駆け寄ってくる。少し遅れて千鶴と栞那も戻る",
                    "direction": "（舞依たちが駆け寄ってくる。少し遅れて千鶴と栞那も戻る）"
                },
                {
                    "id": "scene1-013",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "normal",
                    "text": "何してるの！？",
                    "direction": ""
                },
                {
                    "id": "scene1-014",
                    "speaker": "kanna",
                    "position": "left",
                    "expression": "normal",
                    "text": "何これ",
                    "direction": ""
                },
                {
                    "id": "scene1-015",
                    "speaker": "mai",
                    "position": "left",
                    "expression": "normal",
                    "text": "何があったんですか？",
                    "direction": ""
                },
                {
                    "id": "scene1-016",
                    "speaker": "tsuyoshi",
                    "position": "left",
                    "expression": "normal",
                    "text": "いや、その……",
                    "direction": ""
                },
                {
                    "id": "scene1-017",
                    "speaker": "tsuyoshi",
                    "position": "left",
                    "expression": "normal",
                    "text": "二人が喧嘩しそうになって",
                    "direction": ""
                },
                {
                    "id": "scene1-018",
                    "speaker": "tsuyoshi",
                    "position": "left",
                    "expression": "normal",
                    "text": "止めなあかんと思って",
                    "direction": ""
                },
                {
                    "id": "scene1-019",
                    "speaker": "tsuyoshi",
                    "position": "left",
                    "expression": "troubled",
                    "text": "ついカッとなって太陽殴ってもうた",
                    "direction": "【剛／申し訳なさそう】"
                },
                {
                    "id": "scene1-020",
                    "speaker": "ryuta",
                    "position": "right",
                    "expression": "normal",
                    "text": "舐めてんの？",
                    "direction": "【龍太／即座に】"
                },
                {
                    "id": "scene1-021",
                    "speaker": "tsuyoshi",
                    "position": "left",
                    "expression": "troubled",
                    "text": "いや、ちゃうねん！",
                    "direction": ""
                },
                {
                    "id": "scene1-022",
                    "speaker": "kanna",
                    "position": "left",
                    "expression": "normal",
                    "text": "あんたアホでしょ",
                    "direction": ""
                },
                {
                    "id": "scene1-023",
                    "speaker": "tsuyoshi",
                    "position": "left",
                    "expression": "troubled",
                    "text": "はい",
                    "direction": ""
                },
                {
                    "id": "scene1-024",
                    "speaker": "kanna",
                    "position": "left",
                    "expression": "normal",
                    "text": "なんで追加で燃やしにいってんの、あの太陽を",
                    "direction": ""
                },
                {
                    "id": "scene1-025",
                    "speaker": "ryuta",
                    "position": "right",
                    "expression": "normal",
                    "text": "栞那まで太陽って言うな",
                    "direction": ""
                },
                {
                    "id": "scene1-026",
                    "speaker": "kanna",
                    "position": "left",
                    "expression": "laugh",
                    "text": "似てるから仕方ないじゃん",
                    "direction": "【栞那／笑う】"
                },
                {
                    "id": "scene1-027",
                    "speaker": "ryuta",
                    "position": "right",
                    "expression": "normal",
                    "text": "千鶴も笑うなよ",
                    "direction": ""
                },
                {
                    "id": "scene1-028",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "troubled",
                    "text": "ごめん",
                    "direction": "【千鶴／笑いをこらえる】"
                },
                {
                    "id": "scene1-029",
                    "speaker": "ryuta",
                    "position": "right",
                    "expression": "normal",
                    "text": "絶対思ってないだろ",
                    "direction": ""
                },
                {
                    "id": "scene1-030",
                    "speaker": "narration",
                    "text": "龍太が周囲を見る。みんな集まっている。少しだけ表情が落ち着く",
                    "direction": "（龍太が周囲を見る。みんな集まっている。少しだけ表情が落ち着く）"
                },
                {
                    "id": "scene1-031",
                    "speaker": "ryuta",
                    "position": "right",
                    "expression": "normal",
                    "text": "……悪かった",
                    "direction": ""
                },
                {
                    "id": "scene1-032",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "troubled",
                    "text": "龍太？",
                    "direction": ""
                },
                {
                    "id": "scene1-033",
                    "speaker": "ryuta",
                    "position": "right",
                    "expression": "normal",
                    "text": "みんな巻き込んだ",
                    "direction": ""
                },
                {
                    "id": "scene1-034",
                    "speaker": "ryuta",
                    "position": "right",
                    "expression": "normal",
                    "text": "それは悪かった",
                    "direction": ""
                },
                {
                    "id": "scene1-035",
                    "speaker": "narration",
                    "text": "暁を見る",
                    "direction": "（暁を見る）"
                },
                {
                    "id": "scene1-036",
                    "speaker": "ryuta",
                    "position": "right",
                    "expression": "normal",
                    "text": "でも",
                    "direction": ""
                },
                {
                    "id": "scene1-037",
                    "speaker": "ryuta",
                    "position": "right",
                    "expression": "normal",
                    "text": "こいつには負けたくねぇ",
                    "direction": ""
                },
                {
                    "id": "scene1-038",
                    "speaker": "akatsuki",
                    "position": "left",
                    "expression": "normal",
                    "text": "こっちの台詞や",
                    "direction": ""
                }
            ],
            "next": "scene2"
        },
        {
            "id": "scene2",
            "background": "big-park-evening",
            "lines": [
                {
                    "id": "scene2-001",
                    "speaker": "ryuta",
                    "position": "right",
                    "expression": "normal",
                    "text": "喧嘩じゃ負けねぇ",
                    "direction": ""
                },
                {
                    "id": "scene2-002",
                    "speaker": "ryuta",
                    "position": "right",
                    "expression": "normal",
                    "text": "でも殴り合いはこの場に合わねぇ",
                    "direction": ""
                },
                {
                    "id": "scene2-003",
                    "speaker": "kanna",
                    "position": "left",
                    "expression": "normal",
                    "text": "やっとまともなこと言った",
                    "direction": ""
                },
                {
                    "id": "scene2-004",
                    "speaker": "ryuta",
                    "position": "right",
                    "expression": "normal",
                    "text": "うるさい",
                    "direction": ""
                },
                {
                    "id": "scene2-005",
                    "speaker": "kanna",
                    "position": "left",
                    "expression": "normal",
                    "text": "はいはい",
                    "direction": ""
                },
                {
                    "id": "scene2-006",
                    "speaker": "ryuta",
                    "position": "right",
                    "expression": "normal",
                    "text": "その返事千鶴みたいだな",
                    "direction": ""
                },
                {
                    "id": "scene2-007",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "normal",
                    "text": "私？",
                    "direction": ""
                },
                {
                    "id": "scene2-008",
                    "speaker": "mai",
                    "position": "left",
                    "expression": "normal",
                    "text": "じゃあBattle à la carteで勝負したらどうですか？",
                    "direction": ""
                },
                {
                    "id": "scene2-009",
                    "speaker": "ryuta",
                    "position": "right",
                    "expression": "normal",
                    "text": "Battle à la carte……",
                    "direction": ""
                },
                {
                    "id": "scene2-010",
                    "speaker": "narration",
                    "text": "少し考える",
                    "direction": "（少し考える）"
                },
                {
                    "id": "scene2-011",
                    "speaker": "ryuta",
                    "position": "right",
                    "expression": "normal",
                    "text": "あー",
                    "direction": ""
                },
                {
                    "id": "scene2-012",
                    "speaker": "ryuta",
                    "position": "right",
                    "expression": "normal",
                    "text": "最近千鶴がハマってるやつか",
                    "direction": "【龍太／千鶴を見る】"
                },
                {
                    "id": "scene2-013",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "normal",
                    "text": "そう、それ",
                    "direction": ""
                },
                {
                    "id": "scene2-014",
                    "speaker": "ryuta",
                    "position": "right",
                    "expression": "normal",
                    "text": "最近よく話してるよな",
                    "direction": ""
                },
                {
                    "id": "scene2-015",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "normal",
                    "text": "楽しいよ",
                    "direction": ""
                },
                {
                    "id": "scene2-016",
                    "speaker": "ryuta",
                    "position": "right",
                    "expression": "normal",
                    "text": "それは聞いてる",
                    "direction": ""
                },
                {
                    "id": "scene2-017",
                    "speaker": "narration",
                    "text": "龍太が暁を見る",
                    "direction": "（龍太が暁を見る）"
                },
                {
                    "id": "scene2-018",
                    "speaker": "ryuta",
                    "position": "right",
                    "expression": "normal",
                    "text": "お前もやってんの？",
                    "direction": ""
                },
                {
                    "id": "scene2-019",
                    "speaker": "akatsuki",
                    "position": "left",
                    "expression": "normal",
                    "text": "やってるで",
                    "direction": ""
                },
                {
                    "id": "scene2-020",
                    "speaker": "ryuta",
                    "position": "right",
                    "expression": "smile",
                    "text": "なんだ",
                    "direction": "【龍太／少し挑発】"
                },
                {
                    "id": "scene2-021",
                    "speaker": "ryuta",
                    "position": "right",
                    "expression": "smile",
                    "text": "お前の得意分野か",
                    "direction": ""
                },
                {
                    "id": "scene2-022",
                    "speaker": "akatsuki",
                    "position": "left",
                    "expression": "normal",
                    "text": "……",
                    "direction": ""
                },
                {
                    "id": "scene2-023",
                    "speaker": "akatsuki",
                    "position": "left",
                    "expression": "normal",
                    "text": "もうええんちゃう？",
                    "direction": ""
                },
                {
                    "id": "scene2-024",
                    "speaker": "ryuta",
                    "position": "right",
                    "expression": "smile",
                    "text": "逃げるならそれでもいいけど",
                    "direction": ""
                },
                {
                    "id": "scene2-025",
                    "speaker": "akatsuki",
                    "position": "left",
                    "expression": "normal",
                    "text": "……",
                    "direction": ""
                },
                {
                    "id": "scene2-026",
                    "speaker": "narration",
                    "text": "暁が千鶴を見る。千鶴もじっと暁を見る",
                    "direction": "（暁が千鶴を見る。千鶴もじっと暁を見る）"
                },
                {
                    "id": "scene2-027",
                    "speaker": "akatsuki",
                    "position": "left",
                    "expression": "normal",
                    "text": "なんやその目",
                    "direction": ""
                },
                {
                    "id": "scene2-028",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "normal",
                    "text": "暁ならやるかなって",
                    "direction": ""
                },
                {
                    "id": "scene2-029",
                    "speaker": "narration",
                    "text": "暁が少し黙る",
                    "direction": "（暁が少し黙る）"
                },
                {
                    "id": "scene2-030",
                    "speaker": "akatsuki",
                    "position": "left",
                    "expression": "normal",
                    "text": "あぁ",
                    "direction": ""
                },
                {
                    "id": "scene2-031",
                    "speaker": "akatsuki",
                    "position": "left",
                    "expression": "normal",
                    "text": "まあ得意分野みたいなもんやな",
                    "direction": ""
                },
                {
                    "id": "scene2-032",
                    "speaker": "akatsuki",
                    "position": "left",
                    "expression": "normal",
                    "text": "喧嘩でも負ける気せぇへんけど",
                    "direction": ""
                },
                {
                    "id": "scene2-033",
                    "speaker": "akatsuki",
                    "position": "left",
                    "expression": "normal",
                    "text": "Battle à la carteでも負ける気せんわ",
                    "direction": ""
                },
                {
                    "id": "scene2-034",
                    "speaker": "ryuta",
                    "position": "right",
                    "expression": "smile",
                    "text": "言ったな",
                    "direction": ""
                }
            ],
            "next": "scene3"
        },
        {
            "id": "scene3",
            "background": "big-park-evening",
            "lines": [
                {
                    "id": "scene3-001",
                    "speaker": "tsuyoshi",
                    "position": "left",
                    "expression": "normal",
                    "text": "せや！",
                    "direction": ""
                },
                {
                    "id": "scene3-002",
                    "speaker": "tsuyoshi",
                    "position": "left",
                    "expression": "normal",
                    "text": "暴力反対！",
                    "direction": "【剛／元気よく】"
                },
                {
                    "id": "scene3-003",
                    "speaker": "narration",
                    "text": "沈黙",
                    "direction": "（沈黙）"
                },
                {
                    "id": "scene3-004",
                    "speaker": "kanna",
                    "position": "left",
                    "expression": "normal",
                    "text": "あんたが言うな",
                    "direction": ""
                },
                {
                    "id": "scene3-005",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "normal",
                    "text": "剛が一番言っちゃダメでしょ",
                    "direction": ""
                },
                {
                    "id": "scene3-006",
                    "speaker": "mai",
                    "position": "left",
                    "expression": "normal",
                    "text": "さっき殴った人ですよね",
                    "direction": ""
                },
                {
                    "id": "scene3-007",
                    "speaker": "takumi",
                    "position": "left",
                    "expression": "normal",
                    "text": "今回は本当に剛が言う立場じゃないかな",
                    "direction": ""
                },
                {
                    "id": "scene3-008",
                    "speaker": "yuzuki",
                    "position": "left",
                    "expression": "normal",
                    "text": "説得力ゼロ",
                    "direction": ""
                },
                {
                    "id": "scene3-009",
                    "speaker": "akatsuki",
                    "position": "left",
                    "expression": "normal",
                    "text": "お前だけは黙っとけ！",
                    "direction": ""
                },
                {
                    "id": "scene3-010",
                    "speaker": "tsuyoshi",
                    "position": "left",
                    "expression": "normal",
                    "text": "全員から来た！",
                    "direction": ""
                },
                {
                    "id": "scene3-011",
                    "speaker": "narration",
                    "text": "龍太が思わず笑う",
                    "direction": "（龍太が思わず笑う）"
                },
                {
                    "id": "scene3-012",
                    "speaker": "ryuta",
                    "position": "right",
                    "expression": "normal",
                    "text": "何なんだよこいつ",
                    "direction": ""
                },
                {
                    "id": "scene3-013",
                    "speaker": "kanna",
                    "position": "left",
                    "expression": "normal",
                    "text": "たぶん本人も分かってない",
                    "direction": ""
                },
                {
                    "id": "scene3-014",
                    "speaker": "tsuyoshi",
                    "position": "left",
                    "expression": "normal",
                    "text": "ひどない！？",
                    "direction": ""
                },
                {
                    "id": "scene3-015",
                    "speaker": "narration",
                    "text": "張り詰めていた空気が少し緩む",
                    "direction": "（張り詰めていた空気が少し緩む）"
                }
            ],
            "next": "scene4"
        },
        {
            "id": "scene4",
            "background": "big-park-bench-evening",
            "lines": [
                {
                    "id": "scene4-001",
                    "speaker": "narration",
                    "text": "舞依がBattle à la carteを準備する",
                    "direction": "（舞依がBattle à la carteを準備する）"
                },
                {
                    "id": "scene4-002",
                    "speaker": "mai",
                    "position": "left",
                    "expression": "normal",
                    "text": "龍太さんはプレイするの初めてですよね？",
                    "direction": ""
                },
                {
                    "id": "scene4-003",
                    "speaker": "ryuta",
                    "position": "right",
                    "expression": "normal",
                    "text": "ああ",
                    "direction": ""
                },
                {
                    "id": "scene4-004",
                    "speaker": "ryuta",
                    "position": "right",
                    "expression": "normal",
                    "text": "千鶴から話は聞いてるけど、やったことはない",
                    "direction": ""
                },
                {
                    "id": "scene4-005",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "normal",
                    "text": "私が教えるよ",
                    "direction": ""
                },
                {
                    "id": "scene4-006",
                    "speaker": "ryuta",
                    "position": "right",
                    "expression": "normal",
                    "text": "頼む",
                    "direction": ""
                },
                {
                    "id": "scene4-007",
                    "speaker": "akatsuki",
                    "position": "left",
                    "expression": "normal",
                    "text": "初めてやから負けましたは無しやで",
                    "direction": ""
                },
                {
                    "id": "scene4-008",
                    "speaker": "ryuta",
                    "position": "right",
                    "expression": "normal",
                    "text": "一回聞けば覚える",
                    "direction": ""
                },
                {
                    "id": "scene4-009",
                    "speaker": "akatsuki",
                    "position": "left",
                    "expression": "normal",
                    "text": "えらい自信やな",
                    "direction": ""
                },
                {
                    "id": "scene4-010",
                    "speaker": "ryuta",
                    "position": "right",
                    "expression": "normal",
                    "text": "勝てば問題ねぇだろ",
                    "direction": ""
                },
                {
                    "id": "scene4-011",
                    "speaker": "narration",
                    "text": "",
                    "direction": "（簡易チュートリアル：千鶴と舞依が基本ルールを説明。スキップ可能）",
                    "explanationChoice": {
                        "read": "rule-explanation",
                        "skip": "scene4-after"
                    }
                }
            ]
        },
        {
            "id": "rule-explanation",
            "background": "big-park-bench-evening",
            "next": "scene4-after",
            "lines": [
                {
                    "id": "rule-explanation-001",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "normal",
                    "text": "手札の材料をセットして、料理に必要な材料をそろえるんだよ",
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
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "normal",
                    "text": "イベントは自分を助けたり、相手の邪魔をしたりできるよ。使うタイミングを考えてね",
                    "authoredBy": "Codex",
                    "provisional": true
                },
                {
                    "id": "rule-explanation-004",
                    "speaker": "mai",
                    "position": "left",
                    "expression": "normal",
                    "text": "ターンの終わりには、残った手札を上限まで減らして調整してください",
                    "authoredBy": "Codex",
                    "provisional": true
                },
                {
                    "id": "rule-explanation-005",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "normal",
                    "text": "先に１０点を取った方が勝ち。じゃあ、やってみよう！",
                    "authoredBy": "Codex",
                    "provisional": true
                }
            ]
        },
        {
            "id": "scene4-after",
            "background": "big-park-bench-evening",
            "lines": [
                {
                    "id": "scene4-after-001",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "normal",
                    "text": "分かった？",
                    "direction": ""
                },
                {
                    "id": "scene4-after-002",
                    "speaker": "ryuta",
                    "position": "right",
                    "expression": "normal",
                    "text": "分かった",
                    "direction": ""
                },
                {
                    "id": "scene4-after-003",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "normal",
                    "text": "ほんとに？",
                    "direction": ""
                },
                {
                    "id": "scene4-after-004",
                    "speaker": "ryuta",
                    "position": "right",
                    "expression": "normal",
                    "text": "千鶴、俺こういうの覚えるの早いの知ってるだろ",
                    "direction": ""
                },
                {
                    "id": "scene4-after-005",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "normal",
                    "text": "そうだけど",
                    "direction": ""
                },
                {
                    "id": "scene4-after-006",
                    "speaker": "ryuta",
                    "position": "right",
                    "expression": "normal",
                    "text": "じゃあ信用しろ",
                    "direction": ""
                },
                {
                    "id": "scene4-after-007",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "laugh",
                    "text": "はいはい",
                    "direction": "【千鶴／笑う】"
                },
                {
                    "id": "scene4-after-008",
                    "speaker": "ryuta",
                    "position": "right",
                    "expression": "normal",
                    "text": "はいは一回",
                    "direction": ""
                },
                {
                    "id": "scene4-after-009",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "surprised",
                    "text": "それ私の",
                    "direction": "【千鶴／少し驚く】"
                },
                {
                    "id": "scene4-after-010",
                    "speaker": "ryuta",
                    "position": "right",
                    "expression": "normal",
                    "text": "昔から聞いてる",
                    "direction": ""
                },
                {
                    "id": "scene4-after-011",
                    "speaker": "narration",
                    "text": "暁がそのやり取りを見る",
                    "direction": "（暁がそのやり取りを見る）"
                },
                {
                    "id": "scene4-after-012",
                    "speaker": "akatsuki",
                    "position": "left",
                    "expression": "normal",
                    "text": "……",
                    "direction": ""
                }
            ],
            "next": "scene5"
        },
        {
            "id": "scene5",
            "background": "big-park-bench-evening",
            "lines": [
                {
                    "id": "scene5-001",
                    "speaker": "narration",
                    "text": "公園のベンチにカードを並べる。龍太と暁が向かい合う",
                    "direction": "（公園のベンチにカードを並べる。龍太と暁が向かい合う）"
                },
                {
                    "id": "scene5-002",
                    "speaker": "ryuta",
                    "position": "right",
                    "expression": "normal",
                    "text": "勝ったほうが強い",
                    "direction": ""
                },
                {
                    "id": "scene5-003",
                    "speaker": "akatsuki",
                    "position": "left",
                    "expression": "normal",
                    "text": "ざっくりしてんな",
                    "direction": ""
                },
                {
                    "id": "scene5-004",
                    "speaker": "ryuta",
                    "position": "right",
                    "expression": "normal",
                    "text": "分かりやすいだろ",
                    "direction": ""
                },
                {
                    "id": "scene5-005",
                    "speaker": "akatsuki",
                    "position": "left",
                    "expression": "normal",
                    "text": "ええで",
                    "direction": ""
                },
                {
                    "id": "scene5-006",
                    "speaker": "ryuta",
                    "position": "right",
                    "expression": "normal",
                    "text": "後悔すんなよ",
                    "direction": ""
                },
                {
                    "id": "scene5-007",
                    "speaker": "akatsuki",
                    "position": "left",
                    "expression": "normal",
                    "text": "そっちこそ",
                    "direction": ""
                },
                {
                    "id": "scene5-008",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "normal",
                    "text": "二人とも",
                    "direction": ""
                },
                {
                    "id": "scene5-009",
                    "speaker": "narration",
                    "text": "二人が千鶴を見る",
                    "direction": "（二人が千鶴を見る）"
                },
                {
                    "id": "scene5-010",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "normal",
                    "text": "今度は普通に勝負してね",
                    "direction": ""
                },
                {
                    "id": "scene5-011",
                    "speaker": "ryuta",
                    "position": "right",
                    "expression": "normal",
                    "text": "分かってる",
                    "direction": ""
                },
                {
                    "id": "scene5-012",
                    "speaker": "akatsuki",
                    "position": "left",
                    "expression": "normal",
                    "text": "カードで殴ったりせぇへんわ",
                    "direction": ""
                },
                {
                    "id": "scene5-013",
                    "speaker": "tsuyoshi",
                    "position": "left",
                    "expression": "normal",
                    "text": "カードも角当たったら痛いで",
                    "direction": ""
                },
                {
                    "id": "scene5-014",
                    "speaker": "kanna",
                    "position": "left",
                    "expression": "normal",
                    "text": "なんで詳しいの",
                    "direction": ""
                },
                {
                    "id": "scene5-015",
                    "speaker": "tsuyoshi",
                    "position": "left",
                    "expression": "normal",
                    "text": "知らんけど！",
                    "direction": ""
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
            "background": "big-park-bench-evening",
            "lines": [
                {
                    "id": "win-001",
                    "speaker": "narration",
                    "text": "BATTLE CLEAR",
                    "card": true,
                    "caption": "WINNER 龍太",
                    "hide": "all"
                },
                {
                    "id": "win-002",
                    "speaker": "ryuta",
                    "position": "right",
                    "expression": "smile",
                    "text": "勝った",
                    "direction": "【龍太／少し得意げ】"
                },
                {
                    "id": "win-003",
                    "speaker": "akatsuki",
                    "position": "left",
                    "expression": "normal",
                    "text": "……",
                    "direction": ""
                },
                {
                    "id": "win-004",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "smile",
                    "text": "龍太すごい！",
                    "direction": "【千鶴／嬉しそう】"
                },
                {
                    "id": "win-005",
                    "speaker": "ryuta",
                    "position": "right",
                    "expression": "smile",
                    "text": "まあな",
                    "direction": ""
                },
                {
                    "id": "win-006",
                    "speaker": "mai",
                    "position": "left",
                    "expression": "normal",
                    "text": "初めてなのに普通に強いですね",
                    "direction": ""
                },
                {
                    "id": "win-007",
                    "speaker": "takumi",
                    "position": "left",
                    "expression": "normal",
                    "text": "覚えるの早かったね",
                    "direction": ""
                },
                {
                    "id": "win-008",
                    "speaker": "yuzuki",
                    "position": "left",
                    "expression": "normal",
                    "text": "ちょっと悔しいくらい強い",
                    "direction": ""
                },
                {
                    "id": "win-009",
                    "speaker": "tsuyoshi",
                    "position": "left",
                    "expression": "normal",
                    "text": "まあでも暁は四天王の中でも最弱やからな！",
                    "direction": "【剛／龍太を見る】"
                },
                {
                    "id": "win-010",
                    "speaker": "akatsuki",
                    "position": "left",
                    "expression": "normal",
                    "text": "誰が四天王やねん！",
                    "direction": "【暁／即座に】"
                },
                {
                    "id": "win-011",
                    "speaker": "tsuyoshi",
                    "position": "left",
                    "expression": "normal",
                    "text": "次俺とやろうや！",
                    "direction": ""
                },
                {
                    "id": "win-012",
                    "speaker": "ryuta",
                    "position": "right",
                    "expression": "surprised",
                    "text": "お前もやるの？",
                    "direction": "【龍太／少し意外そう】"
                },
                {
                    "id": "win-013",
                    "speaker": "tsuyoshi",
                    "position": "left",
                    "expression": "normal",
                    "text": "やるで！",
                    "direction": ""
                },
                {
                    "id": "win-014",
                    "speaker": "tsuyoshi",
                    "position": "left",
                    "expression": "normal",
                    "text": "夏に暁倒したことあるからな！",
                    "direction": ""
                },
                {
                    "id": "win-015",
                    "speaker": "akatsuki",
                    "position": "left",
                    "expression": "normal",
                    "text": "一回だけやろ！",
                    "direction": ""
                },
                {
                    "id": "win-016",
                    "speaker": "tsuyoshi",
                    "position": "left",
                    "expression": "normal",
                    "text": "一回は一回や！",
                    "direction": ""
                },
                {
                    "id": "win-017",
                    "speaker": "ryuta",
                    "position": "right",
                    "expression": "laugh",
                    "text": "じゃあ今度な",
                    "direction": "【龍太／少し笑う】"
                },
                {
                    "id": "win-018",
                    "speaker": "tsuyoshi",
                    "position": "left",
                    "expression": "normal",
                    "text": "決まりや！",
                    "direction": ""
                },
                {
                    "id": "win-019",
                    "speaker": "narration",
                    "text": "ここで龍太と剛の空気が少し和らぐ",
                    "direction": "（ここで龍太と剛の空気が少し和らぐ）"
                }
            ],
            "next": "scene6"
        },
        {
            "id": "scene6",
            "background": "big-park-evening",
            "lines": [
                {
                    "id": "scene6-001",
                    "speaker": "akatsuki",
                    "position": "left",
                    "expression": "normal",
                    "text": "……",
                    "direction": ""
                },
                {
                    "id": "scene6-002",
                    "speaker": "narration",
                    "text": "暁が千鶴を見る。千鶴は龍太と楽しそうに話している",
                    "direction": "（暁が千鶴を見る。千鶴は龍太と楽しそうに話している）"
                },
                {
                    "id": "scene6-003",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "normal",
                    "text": "ほんとに初めてだったの？",
                    "direction": ""
                },
                {
                    "id": "scene6-004",
                    "speaker": "ryuta",
                    "position": "right",
                    "expression": "normal",
                    "text": "初めてだって",
                    "direction": ""
                },
                {
                    "id": "scene6-005",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "normal",
                    "text": "強かった",
                    "direction": ""
                },
                {
                    "id": "scene6-006",
                    "speaker": "ryuta",
                    "position": "right",
                    "expression": "normal",
                    "text": "だろ",
                    "direction": ""
                },
                {
                    "id": "scene6-007",
                    "speaker": "akatsuki",
                    "position": "left",
                    "expression": "troubled",
                    "text": "……帰ろかな",
                    "direction": "【暁／少し気まずそう】"
                },
                {
                    "id": "scene6-008",
                    "speaker": "tsuyoshi",
                    "position": "left",
                    "expression": "normal",
                    "text": "なんで？",
                    "direction": ""
                },
                {
                    "id": "scene6-009",
                    "speaker": "akatsuki",
                    "position": "left",
                    "expression": "troubled",
                    "text": "だるい",
                    "direction": ""
                },
                {
                    "id": "scene6-010",
                    "speaker": "tsuyoshi",
                    "position": "left",
                    "expression": "normal",
                    "text": "負けたから？",
                    "direction": ""
                },
                {
                    "id": "scene6-011",
                    "speaker": "akatsuki",
                    "position": "left",
                    "expression": "troubled",
                    "text": "ちゃうわ",
                    "direction": ""
                },
                {
                    "id": "scene6-012",
                    "speaker": "tsuyoshi",
                    "position": "left",
                    "expression": "normal",
                    "text": "千鶴の前で負けたから？",
                    "direction": ""
                },
                {
                    "id": "scene6-013",
                    "speaker": "akatsuki",
                    "position": "left",
                    "expression": "troubled",
                    "text": "黙れ",
                    "direction": ""
                },
                {
                    "id": "scene6-014",
                    "speaker": "tsuyoshi",
                    "position": "left",
                    "expression": "laugh",
                    "text": "図星やん",
                    "direction": "【剛／ニヤニヤ】"
                },
                {
                    "id": "scene6-015",
                    "speaker": "akatsuki",
                    "position": "left",
                    "expression": "troubled",
                    "text": "帰る",
                    "direction": ""
                },
                {
                    "id": "scene6-016",
                    "speaker": "narration",
                    "text": "暁が本当に歩き出そうとする",
                    "direction": "（暁が本当に歩き出そうとする）"
                }
            ],
            "next": "scene7"
        },
        {
            "id": "scene7",
            "background": "big-park-evening",
            "lines": [
                {
                    "id": "scene7-001",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "normal",
                    "text": "暁！",
                    "direction": ""
                },
                {
                    "id": "scene7-002",
                    "speaker": "narration",
                    "text": "暁が止まる",
                    "direction": "（暁が止まる）"
                },
                {
                    "id": "scene7-003",
                    "speaker": "akatsuki",
                    "position": "left",
                    "expression": "normal",
                    "text": "ん？",
                    "direction": ""
                },
                {
                    "id": "scene7-004",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "normal",
                    "text": "今度みんなで集まる時も絶対来てね",
                    "direction": ""
                },
                {
                    "id": "scene7-005",
                    "speaker": "akatsuki",
                    "position": "left",
                    "expression": "normal",
                    "text": "……",
                    "direction": ""
                },
                {
                    "id": "scene7-006",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "normal",
                    "text": "また対戦したいし",
                    "direction": ""
                },
                {
                    "id": "scene7-007",
                    "speaker": "akatsuki",
                    "position": "left",
                    "expression": "gentle",
                    "text": "なんや、そんなこと",
                    "direction": "【暁／少し表情が緩む】"
                },
                {
                    "id": "scene7-008",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "normal",
                    "text": "そんなことじゃないよ",
                    "direction": ""
                },
                {
                    "id": "scene7-009",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "normal",
                    "text": "絶対だからね",
                    "direction": ""
                },
                {
                    "id": "scene7-010",
                    "speaker": "akatsuki",
                    "position": "left",
                    "expression": "gentle",
                    "text": "予定合えばな",
                    "direction": ""
                },
                {
                    "id": "scene7-011",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "normal",
                    "text": "絶対",
                    "direction": ""
                },
                {
                    "id": "scene7-012",
                    "speaker": "akatsuki",
                    "position": "left",
                    "expression": "gentle",
                    "text": "はいはい",
                    "direction": ""
                },
                {
                    "id": "scene7-013",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "normal",
                    "text": "はいは一回",
                    "direction": ""
                },
                {
                    "id": "scene7-014",
                    "speaker": "akatsuki",
                    "position": "left",
                    "expression": "laugh",
                    "text": "はい",
                    "direction": "【暁／笑う】"
                },
                {
                    "id": "scene7-015",
                    "speaker": "narration",
                    "text": "龍太がそのやり取りを見る",
                    "direction": "（龍太がそのやり取りを見る）"
                },
                {
                    "id": "scene7-016",
                    "speaker": "ryuta",
                    "position": "right",
                    "expression": "normal",
                    "text": "……",
                    "direction": ""
                }
            ],
            "next": "scene8"
        },
        {
            "id": "scene8",
            "background": "big-park-evening",
            "lines": [
                {
                    "id": "scene8-001",
                    "speaker": "narration",
                    "text": "帰る時間",
                    "direction": "（帰る時間）"
                },
                {
                    "id": "scene8-002",
                    "speaker": "kanna",
                    "position": "left",
                    "expression": "normal",
                    "text": "じゃあ今度こそ解散しよ",
                    "direction": ""
                },
                {
                    "id": "scene8-003",
                    "speaker": "tsuyoshi",
                    "position": "left",
                    "expression": "normal",
                    "text": "龍太！",
                    "direction": ""
                },
                {
                    "id": "scene8-004",
                    "speaker": "ryuta",
                    "position": "right",
                    "expression": "normal",
                    "text": "何",
                    "direction": ""
                },
                {
                    "id": "scene8-005",
                    "speaker": "tsuyoshi",
                    "position": "left",
                    "expression": "normal",
                    "text": "次は俺やからな！",
                    "direction": ""
                },
                {
                    "id": "scene8-006",
                    "speaker": "ryuta",
                    "position": "right",
                    "expression": "normal",
                    "text": "分かったって",
                    "direction": ""
                },
                {
                    "id": "scene8-007",
                    "speaker": "tsuyoshi",
                    "position": "left",
                    "expression": "normal",
                    "text": "忘れんなよ！",
                    "direction": ""
                },
                {
                    "id": "scene8-008",
                    "speaker": "ryuta",
                    "position": "right",
                    "expression": "normal",
                    "text": "お前のほうが忘れそうだけどな",
                    "direction": ""
                },
                {
                    "id": "scene8-009",
                    "speaker": "tsuyoshi",
                    "position": "left",
                    "expression": "normal",
                    "text": "失礼な！",
                    "direction": ""
                },
                {
                    "id": "scene8-010",
                    "speaker": "akatsuki",
                    "position": "left",
                    "expression": "normal",
                    "text": "それは合ってる",
                    "direction": ""
                },
                {
                    "id": "scene8-011",
                    "speaker": "tsuyoshi",
                    "position": "left",
                    "expression": "normal",
                    "text": "幼馴染まで敵！",
                    "direction": ""
                },
                {
                    "id": "scene8-012",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "normal",
                    "text": "龍太、帰ろ",
                    "direction": ""
                },
                {
                    "id": "scene8-013",
                    "speaker": "ryuta",
                    "position": "right",
                    "expression": "normal",
                    "text": "おう",
                    "direction": ""
                },
                {
                    "id": "scene8-014",
                    "speaker": "narration",
                    "text": "龍太と千鶴が歩き出す",
                    "direction": "（龍太と千鶴が歩き出す）"
                },
                {
                    "id": "scene8-015",
                    "speaker": "ryuta",
                    "position": "right",
                    "expression": "normal",
                    "text": "暁",
                    "offscreen": true,
                    "monologue": true
                },
                {
                    "id": "scene8-016",
                    "speaker": "ryuta",
                    "position": "right",
                    "expression": "normal",
                    "text": "やっぱ気に食わねぇ",
                    "offscreen": true,
                    "monologue": true
                },
                {
                    "id": "scene8-017",
                    "speaker": "ryuta",
                    "position": "right",
                    "expression": "normal",
                    "text": "千鶴のこと知ったように話して",
                    "offscreen": true,
                    "monologue": true
                },
                {
                    "id": "scene8-018",
                    "speaker": "ryuta",
                    "position": "right",
                    "expression": "normal",
                    "text": "千鶴も普通に楽しそうにしてる",
                    "offscreen": true,
                    "monologue": true
                },
                {
                    "id": "scene8-019",
                    "speaker": "narration",
                    "text": "",
                    "direction": "（少し間）",
                    "wait": 800
                },
                {
                    "id": "scene8-020",
                    "speaker": "ryuta",
                    "position": "right",
                    "expression": "normal",
                    "text": "別に",
                    "offscreen": true,
                    "monologue": true
                },
                {
                    "id": "scene8-021",
                    "speaker": "ryuta",
                    "position": "right",
                    "expression": "normal",
                    "text": "千鶴が誰と仲良くしようが勝手だ",
                    "offscreen": true,
                    "monologue": true
                },
                {
                    "id": "scene8-022",
                    "speaker": "ryuta",
                    "position": "right",
                    "expression": "normal",
                    "text": "……分かってる",
                    "offscreen": true,
                    "monologue": true
                },
                {
                    "id": "scene8-023",
                    "speaker": "narration",
                    "text": "",
                    "direction": "（少し間）",
                    "wait": 800
                },
                {
                    "id": "scene8-024",
                    "speaker": "ryuta",
                    "position": "right",
                    "expression": "normal",
                    "text": "でも",
                    "offscreen": true,
                    "monologue": true
                },
                {
                    "id": "scene8-025",
                    "speaker": "ryuta",
                    "position": "right",
                    "expression": "normal",
                    "text": "あいつには負けたくねぇ",
                    "offscreen": true,
                    "monologue": true
                },
                {
                    "id": "scene8-026",
                    "speaker": "ryuta",
                    "position": "right",
                    "expression": "normal",
                    "text": "勝負でも",
                    "offscreen": true,
                    "monologue": true
                },
                {
                    "id": "scene8-027",
                    "speaker": "ryuta",
                    "position": "right",
                    "expression": "normal",
                    "text": "それ以外でも",
                    "offscreen": true,
                    "monologue": true
                },
                {
                    "id": "scene8-028",
                    "speaker": "ryuta",
                    "position": "right",
                    "expression": "normal",
                    "text": "次も俺が勝つ",
                    "offscreen": true,
                    "monologue": true
                },
                {
                    "id": "scene8-029",
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
            "background": "big-park-bench-evening",
            "provisional": true,
            "lines": [
                {
                    "id": "lose-001",
                    "speaker": "akatsuki",
                    "position": "left",
                    "expression": "smile",
                    "text": "得意分野や言うたやろ",
                    "authoredBy": "Claude",
                    "provisional": true
                },
                {
                    "id": "lose-002",
                    "speaker": "ryuta",
                    "position": "right",
                    "expression": "troubled",
                    "text": "……もう一回だ",
                    "authoredBy": "Claude",
                    "provisional": true
                },
                {
                    "id": "lose-003",
                    "speaker": "akatsuki",
                    "position": "left",
                    "expression": "smile",
                    "text": "何回でもええで",
                    "authoredBy": "Claude",
                    "provisional": true
                },
                {
                    "id": "lose-004",
                    "speaker": "tsuyoshi",
                    "position": "left",
                    "expression": "surprised",
                    "text": "龍太、熱くなってるやん！",
                    "authoredBy": "Claude",
                    "provisional": true
                }
            ]
        }
    ],
    "clear": {
        "title": "負けられない男",
        "rewards": {
            "unlockCharacter": "ryuta"
        },
        "storyClear": "STORY CLEAR 幼馴染編『気に食わねぇ奴』『負けられない男』"
    },
    "battle": {
        "after": "battle-start",
        "background": "big-park-bench-evening",
        "player": "ryuta",
        "cpu": "akatsuki",
        "playerSkill": "choose",
        "cpuSkill": "random",
        "cpuPersonality": "default"
    },
    "afterBattle": {
        "win": "win",
        "lose": "lose"
    }
});
