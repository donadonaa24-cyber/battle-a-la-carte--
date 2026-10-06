// オーナー原文: docs/story/special-halloween-scenario.md（2026-10-06、台詞は原文保持）
// 敗北会話のみClaude案・オーナーレビュー待ち。
window.BattleStoryData.register({
    "id": "special-halloween",
    "arcLabel": "ハロウィン編",
    "arc": "special",
    "title": "Trick or Treat？",
    "protagonist": "kanna",
    "bgm": "seasonal-halloween",
    "unlockRequires": [
        "episode4",
        "episode5",
        "episode6",
        "episode7",
        "episode8",
        "episode9",
        "episode10"
    ],
    "summary": "魔女姿の栞那と黒猫姿の千鶴。ハロウィンのお菓子と一枚の写真をめぐる、放課後の勝負。",
    "costumes": {
        "kanna": "halloween",
        "chizuru": "halloween"
    },
    "defaultPositions": {
        "kanna": "right",
        "chizuru": "left"
    },
    "scenes": [
        {
            "id": "scene1",
            "background": "halloween-cooking-room",
            "bgm": "seasonal-halloween",
            "lines": [
                {
                    "id": "scene1-001",
                    "speaker": "kanna",
                    "position": "right",
                    "expression": "normal",
                    "direction": "【右：栞那／魔女衣装】",
                    "text": "千鶴、来てる？"
                },
                {
                    "id": "scene1-002",
                    "speaker": "narration",
                    "text": "返事がない",
                    "direction": "（返事がない）"
                },
                {
                    "id": "scene1-003",
                    "speaker": "kanna",
                    "position": "right",
                    "expression": "normal",
                    "direction": "【栞那】",
                    "text": "……？"
                },
                {
                    "id": "scene1-004",
                    "speaker": "narration",
                    "text": "調理台の奥から小さな物音",
                    "direction": "（調理台の奥から小さな物音）"
                },
                {
                    "id": "scene1-005",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "troubled",
                    "direction": "【左：千鶴／黒猫衣装・少し恥ずかしそう】",
                    "text": "……いる"
                },
                {
                    "id": "scene1-006",
                    "speaker": "kanna",
                    "position": "right",
                    "expression": "surprised",
                    "direction": "【右：栞那／一瞬止まる】",
                    "text": "……"
                },
                {
                    "id": "scene1-007",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "troubled",
                    "direction": "",
                    "text": "なに"
                },
                {
                    "id": "scene1-008",
                    "speaker": "kanna",
                    "position": "right",
                    "expression": "smile",
                    "direction": "【栞那／笑いをこらえる】",
                    "text": "いや"
                },
                {
                    "id": "scene1-009",
                    "speaker": "kanna",
                    "position": "right",
                    "expression": "smile",
                    "direction": "",
                    "text": "似合ってるなと思って"
                },
                {
                    "id": "scene1-010",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "troubled",
                    "direction": "【千鶴／疑う】",
                    "text": "絶対笑ってる"
                },
                {
                    "id": "scene1-011",
                    "speaker": "kanna",
                    "position": "right",
                    "expression": "smile",
                    "direction": "",
                    "text": "笑ってないよ"
                },
                {
                    "id": "scene1-012",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "troubled",
                    "direction": "",
                    "text": "口元笑ってる"
                },
                {
                    "id": "scene1-013",
                    "speaker": "kanna",
                    "position": "right",
                    "expression": "smile",
                    "direction": "【栞那／笑顔】",
                    "text": "かわいいよ、猫ちゃん"
                },
                {
                    "id": "scene1-014",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "troubled",
                    "direction": "【千鶴／不満】",
                    "text": "猫ちゃんって呼ばないで"
                },
                {
                    "id": "scene1-015",
                    "speaker": "kanna",
                    "position": "right",
                    "expression": "smile",
                    "direction": "",
                    "text": "じゃあ千鶴猫"
                },
                {
                    "id": "scene1-016",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "troubled",
                    "direction": "",
                    "text": "もっと嫌"
                },
                {
                    "id": "scene1-017",
                    "speaker": "kanna",
                    "position": "right",
                    "expression": "smile",
                    "direction": "",
                    "text": "でも自分で選んだんでしょ？"
                },
                {
                    "id": "scene1-018",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "troubled",
                    "direction": "",
                    "text": "違う"
                },
                {
                    "id": "scene1-019",
                    "speaker": "kanna",
                    "position": "right",
                    "expression": "smile",
                    "direction": "",
                    "text": "違うの？"
                },
                {
                    "id": "scene1-020",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "troubled",
                    "direction": "",
                    "text": "くじ引き"
                },
                {
                    "id": "scene1-021",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "troubled",
                    "direction": "【千鶴／少し不満】",
                    "text": "クラスで余ったの渡された"
                },
                {
                    "id": "scene1-022",
                    "speaker": "kanna",
                    "position": "right",
                    "expression": "smile",
                    "direction": "",
                    "text": "それで素直に着てきたんだ"
                },
                {
                    "id": "scene1-023",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "troubled",
                    "direction": "",
                    "text": "今日ハロウィンだし"
                },
                {
                    "id": "scene1-024",
                    "speaker": "kanna",
                    "position": "right",
                    "expression": "smile",
                    "direction": "【栞那／薄い笑顔】",
                    "text": "そういうところだよね"
                },
                {
                    "id": "scene1-025",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "troubled",
                    "direction": "",
                    "text": "なにが？"
                },
                {
                    "id": "scene1-026",
                    "speaker": "kanna",
                    "position": "right",
                    "expression": "smile",
                    "direction": "",
                    "text": "なんでもない"
                }
            ]
        },
        {
            "id": "scene2",
            "background": "halloween-cooking-room",
            "bgm": "seasonal-halloween",
            "lines": [
                {
                    "id": "scene2-001",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "smile",
                    "direction": "【左：千鶴／目を輝かせる】",
                    "text": "できた"
                },
                {
                    "id": "scene2-002",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "smile",
                    "direction": "",
                    "text": "食べていい？"
                },
                {
                    "id": "scene2-003",
                    "speaker": "kanna",
                    "position": "right",
                    "expression": "normal",
                    "direction": "【右：栞那】",
                    "text": "まだダメ"
                },
                {
                    "id": "scene2-004",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "smile",
                    "direction": "",
                    "text": "なんで"
                },
                {
                    "id": "scene2-005",
                    "speaker": "kanna",
                    "position": "right",
                    "expression": "normal",
                    "direction": "",
                    "text": "まだ写真撮ってないから"
                },
                {
                    "id": "scene2-006",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "smile",
                    "direction": "",
                    "text": "一個くらい減っても分からないよ"
                },
                {
                    "id": "scene2-007",
                    "speaker": "kanna",
                    "position": "right",
                    "expression": "normal",
                    "direction": "",
                    "text": "分かるよ"
                },
                {
                    "id": "scene2-008",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "smile",
                    "direction": "",
                    "text": "分からないって"
                },
                {
                    "id": "scene2-009",
                    "speaker": "narration",
                    "text": "千鶴がクッキーへ手を伸ばす",
                    "direction": "（千鶴がクッキーへ手を伸ばす）"
                },
                {
                    "id": "scene2-010",
                    "speaker": "kanna",
                    "position": "right",
                    "expression": "normal",
                    "direction": "",
                    "text": "千鶴"
                },
                {
                    "id": "scene2-011",
                    "speaker": "narration",
                    "text": "千鶴の手が止まる",
                    "direction": "（千鶴の手が止まる）"
                },
                {
                    "id": "scene2-012",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "smile",
                    "direction": "",
                    "text": "……"
                },
                {
                    "id": "scene2-013",
                    "speaker": "kanna",
                    "position": "right",
                    "expression": "smile",
                    "direction": "【栞那／笑顔】",
                    "text": "手"
                },
                {
                    "id": "scene2-014",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "smile",
                    "direction": "",
                    "text": "まだ取ってない"
                },
                {
                    "id": "scene2-015",
                    "speaker": "kanna",
                    "position": "right",
                    "expression": "smile",
                    "direction": "",
                    "text": "取ろうとしてた"
                },
                {
                    "id": "scene2-016",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "smile",
                    "direction": "",
                    "text": "味見"
                },
                {
                    "id": "scene2-017",
                    "speaker": "kanna",
                    "position": "right",
                    "expression": "smile",
                    "direction": "",
                    "text": "さっき生地も味見してたよね"
                },
                {
                    "id": "scene2-018",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "smile",
                    "direction": "",
                    "text": "あれは生地"
                },
                {
                    "id": "scene2-019",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "smile",
                    "direction": "",
                    "text": "これは完成品"
                },
                {
                    "id": "scene2-020",
                    "speaker": "kanna",
                    "position": "right",
                    "expression": "smile",
                    "direction": "【栞那／少し意地悪】",
                    "text": "また始まった"
                },
                {
                    "id": "scene2-021",
                    "speaker": "narration",
                    "text": "栞那がクッキーを一枚取る",
                    "direction": "（栞那がクッキーを一枚取る）"
                },
                {
                    "id": "scene2-022",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "smile",
                    "direction": "【千鶴／期待】",
                    "text": "くれる？"
                },
                {
                    "id": "scene2-023",
                    "speaker": "kanna",
                    "position": "right",
                    "expression": "smile",
                    "direction": "",
                    "text": "どうしようかな"
                },
                {
                    "id": "scene2-024",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "smile",
                    "direction": "",
                    "text": "ちょうだい"
                },
                {
                    "id": "scene2-025",
                    "speaker": "kanna",
                    "position": "right",
                    "expression": "smile",
                    "direction": "",
                    "text": "Trick or Treatは？"
                },
                {
                    "id": "scene2-026",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "smile",
                    "direction": "",
                    "text": "……"
                },
                {
                    "id": "scene2-027",
                    "speaker": "kanna",
                    "position": "right",
                    "expression": "smile",
                    "direction": "",
                    "text": "今日はハロウィンでしょ？"
                },
                {
                    "id": "scene2-028",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "troubled",
                    "direction": "【千鶴／少し恥ずかしそう】",
                    "text": "……トリック・オア・トリート"
                },
                {
                    "id": "scene2-029",
                    "speaker": "kanna",
                    "position": "right",
                    "expression": "smile",
                    "direction": "【栞那／満足そう】",
                    "text": "はい"
                },
                {
                    "id": "scene2-030",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "smile",
                    "direction": "【千鶴／嬉しそう】",
                    "text": "ありがとう"
                },
                {
                    "id": "scene2-031",
                    "speaker": "narration",
                    "text": "千鶴が食べる",
                    "direction": "（千鶴が食べる）"
                },
                {
                    "id": "scene2-032",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "smile",
                    "direction": "【千鶴／笑顔】",
                    "text": "おいしい"
                },
                {
                    "id": "scene2-033",
                    "speaker": "kanna",
                    "position": "right",
                    "expression": "smile",
                    "direction": "",
                    "text": "知ってる"
                },
                {
                    "id": "scene2-034",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "smile",
                    "direction": "",
                    "text": "もう一個"
                },
                {
                    "id": "scene2-035",
                    "speaker": "kanna",
                    "position": "right",
                    "expression": "smile",
                    "direction": "",
                    "text": "ダメ"
                },
                {
                    "id": "scene2-036",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "smile",
                    "direction": "",
                    "text": "早い"
                }
            ]
        },
        {
            "id": "scene3",
            "background": "halloween-cooking-room",
            "bgm": "seasonal-halloween",
            "lines": [
                {
                    "id": "scene3-001",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "normal",
                    "direction": "",
                    "text": "かぼちゃプリンも食べたい"
                },
                {
                    "id": "scene3-002",
                    "speaker": "kanna",
                    "position": "right",
                    "expression": "normal",
                    "direction": "",
                    "text": "それは明日"
                },
                {
                    "id": "scene3-003",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "normal",
                    "direction": "",
                    "text": "今日食べたい"
                },
                {
                    "id": "scene3-004",
                    "speaker": "kanna",
                    "position": "right",
                    "expression": "normal",
                    "direction": "",
                    "text": "じゃあ……"
                },
                {
                    "id": "scene3-005",
                    "speaker": "narration",
                    "text": "栞那がBattle à la carteのカードを取り出す",
                    "direction": "（栞那がBattle à la carteのカードを取り出す）"
                },
                {
                    "id": "scene3-006",
                    "speaker": "kanna",
                    "position": "right",
                    "expression": "smile",
                    "direction": "【栞那／少し意地悪そう】",
                    "text": "勝ったら一個あげる"
                },
                {
                    "id": "scene3-007",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "normal",
                    "direction": "【千鶴／即答】",
                    "text": "やる"
                },
                {
                    "id": "scene3-008",
                    "speaker": "kanna",
                    "position": "right",
                    "expression": "smile",
                    "direction": "",
                    "text": "ほんと食べ物絡むと早いね"
                },
                {
                    "id": "scene3-009",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "normal",
                    "direction": "",
                    "text": "栞那が言ったんでしょ"
                },
                {
                    "id": "scene3-010",
                    "speaker": "kanna",
                    "position": "right",
                    "expression": "smile",
                    "direction": "",
                    "text": "そうだけど"
                },
                {
                    "id": "scene3-011",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "smile",
                    "direction": "【千鶴／少し得意げ】",
                    "text": "勝ったらプリン二個ね"
                },
                {
                    "id": "scene3-012",
                    "speaker": "kanna",
                    "position": "right",
                    "expression": "smile",
                    "direction": "",
                    "text": "増やさない"
                },
                {
                    "id": "scene3-013",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "smile",
                    "direction": "",
                    "text": "じゃあ大きいの"
                },
                {
                    "id": "scene3-014",
                    "speaker": "kanna",
                    "position": "right",
                    "expression": "smile",
                    "direction": "",
                    "text": "全部同じ大きさ"
                },
                {
                    "id": "scene3-015",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "smile",
                    "direction": "",
                    "text": "……"
                },
                {
                    "id": "scene3-016",
                    "speaker": "kanna",
                    "position": "right",
                    "expression": "smile",
                    "direction": "【栞那／笑顔】",
                    "text": "残念でした"
                },
                {
                    "id": "scene3-017",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "smile",
                    "direction": "",
                    "text": "じゃあ栞那が勝ったら？"
                },
                {
                    "id": "scene3-018",
                    "speaker": "kanna",
                    "position": "right",
                    "expression": "smile",
                    "direction": "",
                    "text": "そうだなあ"
                },
                {
                    "id": "scene3-019",
                    "speaker": "narration",
                    "text": "栞那が千鶴の猫耳を見る",
                    "direction": "（栞那が千鶴の猫耳を見る）"
                },
                {
                    "id": "scene3-020",
                    "speaker": "kanna",
                    "position": "right",
                    "expression": "smile",
                    "direction": "【栞那／意地悪そうな笑顔】",
                    "text": "写真撮らせて"
                },
                {
                    "id": "scene3-021",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "troubled",
                    "direction": "【千鶴／警戒】",
                    "text": "嫌"
                },
                {
                    "id": "scene3-022",
                    "speaker": "kanna",
                    "position": "right",
                    "expression": "smile",
                    "direction": "",
                    "text": "勝ったらね"
                },
                {
                    "id": "scene3-023",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "troubled",
                    "direction": "",
                    "text": "絶対勝つ"
                },
                {
                    "id": "scene3-024",
                    "speaker": "kanna",
                    "position": "right",
                    "expression": "smile",
                    "direction": "",
                    "text": "プリンよりそっちのほうが効いた？"
                },
                {
                    "id": "scene3-025",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "troubled",
                    "direction": "",
                    "text": "両方"
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
            "background": "halloween-cooking-room",
            "bgm": "seasonal-halloween",
            "lines": [
                {
                    "id": "win-001",
                    "speaker": "kanna",
                    "position": "right",
                    "expression": "smile",
                    "direction": "【右：栞那／満足そう】",
                    "text": "勝ち"
                },
                {
                    "id": "win-002",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "surprised",
                    "direction": "【左：千鶴／固まる】",
                    "text": "……"
                },
                {
                    "id": "win-003",
                    "speaker": "kanna",
                    "position": "right",
                    "expression": "smile",
                    "direction": "",
                    "text": "千鶴？"
                },
                {
                    "id": "win-004",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "surprised",
                    "direction": "",
                    "text": "プリン……"
                },
                {
                    "id": "win-005",
                    "speaker": "kanna",
                    "position": "right",
                    "expression": "smile",
                    "direction": "",
                    "text": "そっち？"
                },
                {
                    "id": "win-006",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "surprised",
                    "direction": "",
                    "text": "食べたかった"
                },
                {
                    "id": "win-007",
                    "speaker": "kanna",
                    "position": "right",
                    "expression": "laugh",
                    "direction": "【栞那／笑う】",
                    "text": "写真のほうは？"
                },
                {
                    "id": "win-008",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "surprised",
                    "direction": "",
                    "text": "それも嫌"
                },
                {
                    "id": "win-009",
                    "speaker": "kanna",
                    "position": "right",
                    "expression": "laugh",
                    "direction": "",
                    "text": "ちゃんと覚えてるんだ"
                }
            ],
            "next": "scene4"
        },
        {
            "id": "scene4",
            "background": "halloween-cooking-room",
            "bgm": "seasonal-halloween",
            "lines": [
                {
                    "id": "scene4-001",
                    "speaker": "narration",
                    "text": "栞那がスマホを取り出す",
                    "direction": "（栞那がスマホを取り出す）"
                },
                {
                    "id": "scene4-002",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "troubled",
                    "direction": "【左：千鶴／嫌そう】",
                    "text": "ほんとに撮るの？"
                },
                {
                    "id": "scene4-003",
                    "speaker": "kanna",
                    "position": "right",
                    "expression": "normal",
                    "direction": "【右：栞那】",
                    "text": "約束でしょ"
                },
                {
                    "id": "scene4-004",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "troubled",
                    "direction": "",
                    "text": "一枚だけ？"
                },
                {
                    "id": "scene4-005",
                    "speaker": "kanna",
                    "position": "right",
                    "expression": "normal",
                    "direction": "",
                    "text": "一枚だけ"
                },
                {
                    "id": "scene4-006",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "troubled",
                    "direction": "",
                    "text": "絶対？"
                },
                {
                    "id": "scene4-007",
                    "speaker": "kanna",
                    "position": "right",
                    "expression": "normal",
                    "direction": "",
                    "text": "多分"
                },
                {
                    "id": "scene4-008",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "troubled",
                    "direction": "【千鶴／不満】",
                    "text": "多分ってなに"
                },
                {
                    "id": "scene4-009",
                    "speaker": "kanna",
                    "position": "right",
                    "expression": "smile",
                    "direction": "【栞那／笑顔】",
                    "text": "ほら、こっち向いて"
                },
                {
                    "id": "scene4-010",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "troubled",
                    "direction": "【千鶴／渋々】",
                    "text": "……"
                },
                {
                    "id": "scene4-011",
                    "speaker": "kanna",
                    "position": "right",
                    "expression": "smile",
                    "direction": "",
                    "text": "そんな顔しないで"
                },
                {
                    "id": "scene4-012",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "troubled",
                    "direction": "",
                    "text": "普通の顔"
                },
                {
                    "id": "scene4-013",
                    "speaker": "kanna",
                    "position": "right",
                    "expression": "smile",
                    "direction": "",
                    "text": "全然普通じゃない"
                },
                {
                    "id": "scene4-014",
                    "speaker": "narration",
                    "text": "栞那が少し考える",
                    "direction": "（栞那が少し考える）"
                },
                {
                    "id": "scene4-015",
                    "speaker": "kanna",
                    "position": "right",
                    "expression": "smile",
                    "direction": "【栞那／意地悪そう】",
                    "text": "千鶴"
                },
                {
                    "id": "scene4-016",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "troubled",
                    "direction": "",
                    "text": "なに"
                },
                {
                    "id": "scene4-017",
                    "speaker": "kanna",
                    "position": "right",
                    "expression": "smile",
                    "direction": "",
                    "text": "撮ったらプリン半分あげる"
                },
                {
                    "id": "scene4-018",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "smile",
                    "direction": "【千鶴／表情が変わる】",
                    "text": "ほんと？"
                },
                {
                    "id": "scene4-019",
                    "speaker": "narration",
                    "text": "",
                    "direction": "SE：カシャ",
                    "se": "pop"
                },
                {
                    "id": "scene4-020",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "surprised",
                    "direction": "【千鶴／驚く】",
                    "text": "今撮った！？"
                },
                {
                    "id": "scene4-021",
                    "speaker": "kanna",
                    "position": "right",
                    "expression": "laugh",
                    "direction": "【栞那／笑う】",
                    "text": "いい顔撮れた"
                },
                {
                    "id": "scene4-022",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "surprised",
                    "direction": "",
                    "text": "ずるい！"
                },
                {
                    "id": "scene4-023",
                    "speaker": "kanna",
                    "position": "right",
                    "expression": "laugh",
                    "direction": "",
                    "text": "プリン半分あげるって言ったでしょ"
                },
                {
                    "id": "scene4-024",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "surprised",
                    "direction": "",
                    "text": "一個"
                },
                {
                    "id": "scene4-025",
                    "speaker": "kanna",
                    "position": "right",
                    "expression": "laugh",
                    "direction": "",
                    "text": "負けたのに？"
                },
                {
                    "id": "scene4-026",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "surprised",
                    "direction": "",
                    "text": "写真撮らせた"
                },
                {
                    "id": "scene4-027",
                    "speaker": "kanna",
                    "position": "right",
                    "expression": "laugh",
                    "direction": "",
                    "text": "撮らせたっていうか、撮った"
                },
                {
                    "id": "scene4-028",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "surprised",
                    "direction": "",
                    "text": "一個"
                },
                {
                    "id": "scene4-029",
                    "speaker": "kanna",
                    "position": "right",
                    "expression": "normal",
                    "direction": "【栞那／少し考える】",
                    "text": "……"
                },
                {
                    "id": "scene4-030",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "normal",
                    "direction": "【千鶴／じっと見る】",
                    "text": "……"
                },
                {
                    "id": "scene4-031",
                    "speaker": "kanna",
                    "position": "right",
                    "expression": "normal",
                    "direction": "",
                    "text": "その顔やめて"
                },
                {
                    "id": "scene4-032",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "normal",
                    "direction": "",
                    "text": "一個"
                },
                {
                    "id": "scene4-033",
                    "speaker": "kanna",
                    "position": "right",
                    "expression": "troubled",
                    "direction": "【栞那／折れる】",
                    "text": "分かったよ"
                },
                {
                    "id": "scene4-034",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "smile",
                    "direction": "【千鶴／笑顔】",
                    "text": "やった"
                },
                {
                    "id": "scene4-035",
                    "speaker": "kanna",
                    "position": "right",
                    "expression": "troubled",
                    "direction": "",
                    "text": "結局食べるんだ"
                }
            ],
            "next": "scene5"
        },
        {
            "id": "scene5",
            "background": "halloween-hallway-evening",
            "bgm": "seasonal-halloween",
            "lines": [
                {
                    "id": "scene5-001",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "smile",
                    "direction": "【左：千鶴／嬉しそう】",
                    "text": "帰ったら食べよ"
                },
                {
                    "id": "scene5-002",
                    "speaker": "kanna",
                    "position": "right",
                    "expression": "normal",
                    "direction": "【右：栞那】",
                    "text": "今食べないの？"
                },
                {
                    "id": "scene5-003",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "smile",
                    "direction": "",
                    "text": "家でゆっくり食べる"
                },
                {
                    "id": "scene5-004",
                    "speaker": "kanna",
                    "position": "right",
                    "expression": "normal",
                    "direction": "",
                    "text": "珍しい"
                },
                {
                    "id": "scene5-005",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "smile",
                    "direction": "",
                    "text": "失礼"
                },
                {
                    "id": "scene5-006",
                    "speaker": "narration",
                    "text": "少し歩く",
                    "direction": "（少し歩く）"
                },
                {
                    "id": "scene5-007",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "smile",
                    "direction": "",
                    "text": "栞那"
                },
                {
                    "id": "scene5-008",
                    "speaker": "kanna",
                    "position": "right",
                    "expression": "normal",
                    "direction": "",
                    "text": "ん？"
                },
                {
                    "id": "scene5-009",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "smile",
                    "direction": "",
                    "text": "来年も作ろうね"
                },
                {
                    "id": "scene5-010",
                    "speaker": "kanna",
                    "position": "right",
                    "expression": "surprised",
                    "direction": "【栞那／少し意外そう】",
                    "text": "ハロウィンのお菓子？"
                },
                {
                    "id": "scene5-011",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "smile",
                    "direction": "",
                    "text": "うん"
                },
                {
                    "id": "scene5-012",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "smile",
                    "direction": "",
                    "text": "もっといっぱい"
                },
                {
                    "id": "scene5-013",
                    "speaker": "kanna",
                    "position": "right",
                    "expression": "surprised",
                    "direction": "",
                    "text": "食べたいだけでしょ"
                },
                {
                    "id": "scene5-014",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "smile",
                    "direction": "",
                    "text": "作りたいのもある"
                },
                {
                    "id": "scene5-015",
                    "speaker": "kanna",
                    "position": "right",
                    "expression": "surprised",
                    "direction": "",
                    "text": "“も”なんだ"
                },
                {
                    "id": "scene5-016",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "smile",
                    "direction": "【千鶴／笑顔】",
                    "text": "栞那と作るの楽しいし"
                },
                {
                    "id": "scene5-017",
                    "speaker": "narration",
                    "text": "栞那が少し黙る",
                    "direction": "（栞那が少し黙る）"
                },
                {
                    "id": "scene5-018",
                    "speaker": "kanna",
                    "position": "right",
                    "expression": "surprised",
                    "direction": "",
                    "text": "……そっか"
                },
                {
                    "id": "scene5-019",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "smile",
                    "direction": "",
                    "text": "うん"
                },
                {
                    "id": "scene5-020",
                    "speaker": "kanna",
                    "position": "right",
                    "expression": "normal",
                    "text": "千鶴はいつも分かりやすい",
                    "direction": "",
                    "offscreen": true,
                    "monologue": true
                },
                {
                    "id": "scene5-021",
                    "speaker": "kanna",
                    "position": "right",
                    "expression": "normal",
                    "text": "おいしい時は笑って",
                    "direction": "",
                    "offscreen": true,
                    "monologue": true
                },
                {
                    "id": "scene5-022",
                    "speaker": "kanna",
                    "position": "right",
                    "expression": "normal",
                    "text": "嫌な時はすぐ顔に出て",
                    "direction": "",
                    "offscreen": true,
                    "monologue": true
                },
                {
                    "id": "scene5-023",
                    "speaker": "kanna",
                    "position": "right",
                    "expression": "normal",
                    "text": "いじったら、ちゃんと反応してくれる",
                    "direction": "",
                    "offscreen": true,
                    "monologue": true
                },
                {
                    "id": "scene5-024",
                    "speaker": "narration",
                    "text": "",
                    "direction": "（少し間）",
                    "wait": 800
                },
                {
                    "id": "scene5-025",
                    "speaker": "kanna",
                    "position": "right",
                    "expression": "normal",
                    "text": "だからつい、もう一回って思っちゃうんだよね",
                    "direction": "",
                    "offscreen": true,
                    "monologue": true
                },
                {
                    "id": "scene5-026",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "smile",
                    "direction": "【左：千鶴】",
                    "text": "栞那、早く帰ろ"
                },
                {
                    "id": "scene5-027",
                    "speaker": "kanna",
                    "position": "right",
                    "expression": "smile",
                    "direction": "【右：栞那／笑顔】",
                    "text": "はいはい"
                },
                {
                    "id": "scene5-028",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "smile",
                    "direction": "",
                    "text": "はいは一回"
                },
                {
                    "id": "scene5-029",
                    "speaker": "kanna",
                    "position": "right",
                    "expression": "laugh",
                    "direction": "【栞那／笑う】",
                    "text": "はい"
                },
                {
                    "id": "scene5-030",
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
            "background": "halloween-cooking-room",
            "bgm": "seasonal-halloween",
            "provisional": true,
            "lines": [
                {
                    "id": "lose-001",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "smile",
                    "text": "勝った",
                    "direction": "",
                    "authoredBy": "Claude",
                    "provisional": true
                },
                {
                    "id": "lose-002",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "smile",
                    "text": "プリン、もらうね",
                    "direction": "",
                    "authoredBy": "Claude",
                    "provisional": true
                },
                {
                    "id": "lose-003",
                    "speaker": "kanna",
                    "position": "right",
                    "expression": "troubled",
                    "text": "……もう一回",
                    "direction": "",
                    "authoredBy": "Claude",
                    "provisional": true
                },
                {
                    "id": "lose-004",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "smile",
                    "text": "栞那、負けず嫌い",
                    "direction": "",
                    "authoredBy": "Claude",
                    "provisional": true
                }
            ]
        }
    ],
    "battle": {
        "after": "battle-start",
        "background": "halloween-cooking-room",
        "player": "kanna",
        "cpu": "chizuru",
        "playerSkill": "choose",
        "cpuSkill": "random",
        "cpuPersonality": "default"
    },
    "afterBattle": {
        "win": "win",
        "lose": "lose"
    },
    "clear": {
        "title": "Trick or Treat？",
        "rewards": {
            "unlockCharacter": "kanna",
            "costumes": [
                "kanna:halloween",
                "chizuru:halloween"
            ]
        }
    }
});
