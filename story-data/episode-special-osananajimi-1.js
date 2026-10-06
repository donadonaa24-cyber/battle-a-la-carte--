// オーナー原文＋承認済み整合編集: docs/story/special-osananajimi-scenario.md（2026-10-06／07）。
// 簡易説明はCodex案、敗北4行はClaude案・オーナーレビュー待ち。
window.BattleStoryData.register({
    "id": "special-osananajimi-1",
    "arc": "special",
    "arcLabel": "幼馴染編 前編",
    "title": "気に食わねぇ奴",
    "protagonist": "ryuta",
    "conversationOnly": true,
    "unlockRequires": [
        "episode1",
        "episode2",
        "episode3",
        "episode4",
        "episode5",
        "episode6",
        "episode7",
        "episode8",
        "episode9",
        "episode10",
        "special-summer",
        "special-halloween",
        "special-kyudo"
    ],
    "unlockNotice": "文化祭編・再会編・夏休み編・ハロウィン編・弓道編クリアで解放",
    "summary": "再会編第3話の夕方。公園で千鶴の幼馴染・龍太と暁が出会う。",
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
                    "speaker": "narration",
                    "text": "文化祭で出会った六人が、約束どおり休日に集まった日（再会編 第3話と同じ日）。昼の千鶴と暁の再戦のあと、拓海と舞依に誘われた結月も合流し、七人で近くのファミレスで夕食を食べた",
                    "direction": "Claude によるつじつま合わせ 1"
                },
                {
                    "id": "scene1-002",
                    "speaker": "narration",
                    "text": "食事を終えた一行は、帰る前に近くの大きな公園を歩いている。"
                },
                {
                    "id": "scene1-003",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "smile",
                    "text": "今日楽しかったね",
                    "direction": "【左：千鶴／楽しそう】"
                },
                {
                    "id": "scene1-004",
                    "speaker": "akatsuki",
                    "position": "left",
                    "expression": "normal",
                    "text": "まあまあやな",
                    "direction": "【右：暁】"
                },
                {
                    "id": "scene1-005",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "smile",
                    "text": "またそれ",
                    "direction": ""
                },
                {
                    "id": "scene1-006",
                    "speaker": "akatsuki",
                    "position": "left",
                    "expression": "normal",
                    "text": "何が？",
                    "direction": ""
                },
                {
                    "id": "scene1-007",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "smile",
                    "text": "楽しかったくせに",
                    "direction": ""
                },
                {
                    "id": "scene1-008",
                    "speaker": "akatsuki",
                    "position": "left",
                    "expression": "normal",
                    "text": "なんで分かんねん",
                    "direction": ""
                },
                {
                    "id": "scene1-009",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "smile",
                    "text": "顔に出てる",
                    "direction": ""
                },
                {
                    "id": "scene1-010",
                    "speaker": "akatsuki",
                    "position": "left",
                    "expression": "laugh",
                    "text": "千鶴にだけは言われたないわ",
                    "direction": "【暁／少し笑う】"
                },
                {
                    "id": "scene1-011",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "smile",
                    "text": "失礼",
                    "direction": ""
                },
                {
                    "id": "scene1-012",
                    "speaker": "narration",
                    "text": "千鶴が手に持っていた紙袋を持ち直す",
                    "direction": "（千鶴が手に持っていた紙袋を持ち直す）"
                },
                {
                    "id": "scene1-013",
                    "speaker": "akatsuki",
                    "position": "left",
                    "expression": "laugh",
                    "text": "ていうかそれ何？",
                    "direction": ""
                },
                {
                    "id": "scene1-014",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "smile",
                    "text": "みんなの荷物",
                    "direction": ""
                },
                {
                    "id": "scene1-015",
                    "speaker": "akatsuki",
                    "position": "left",
                    "expression": "laugh",
                    "text": "なんで千鶴が全部持ってんの",
                    "direction": ""
                },
                {
                    "id": "scene1-016",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "smile",
                    "text": "持ってって言われたから",
                    "direction": ""
                },
                {
                    "id": "scene1-017",
                    "speaker": "akatsuki",
                    "position": "left",
                    "expression": "laugh",
                    "text": "また断られへんかったん？",
                    "direction": ""
                },
                {
                    "id": "scene1-018",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "smile",
                    "text": "別に嫌じゃないし",
                    "direction": ""
                },
                {
                    "id": "scene1-019",
                    "speaker": "akatsuki",
                    "position": "left",
                    "expression": "laugh",
                    "text": "はいはい、そう言うと思った",
                    "direction": ""
                },
                {
                    "id": "scene1-020",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "smile",
                    "text": "はいは一回",
                    "direction": ""
                },
                {
                    "id": "scene1-021",
                    "speaker": "akatsuki",
                    "position": "left",
                    "expression": "laugh",
                    "text": "またそれ言うてる",
                    "direction": ""
                },
                {
                    "id": "scene1-022",
                    "speaker": "narration",
                    "text": "その時、前方から一人の男子生徒が歩いてくる。派手な髪型、鋭めの目つき、ヤンキー風の見た目。しかし手には英語の参考書が入ったトートバッグ",
                    "direction": "（その時、前方から一人の男子生徒が歩いてくる。派手な髪型、鋭めの目つき、ヤンキー風の見た目。しかし手には英語の参考書が入ったトートバッグ）"
                },
                {
                    "id": "scene1-023",
                    "speaker": "ryuta",
                    "position": "right",
                    "expression": "normal",
                    "text": "千鶴",
                    "direction": "【右：龍太】"
                },
                {
                    "id": "scene1-024",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "surprised",
                    "text": "龍太？",
                    "direction": "【左：千鶴／驚く】"
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
                    "speaker": "narration",
                    "text": "龍太が千鶴のところまで歩いてくる",
                    "direction": "（龍太が千鶴のところまで歩いてくる）"
                },
                {
                    "id": "scene2-002",
                    "speaker": "ryuta",
                    "position": "right",
                    "expression": "normal",
                    "text": "遅くなるって言ってたから迎えに来た",
                    "direction": ""
                },
                {
                    "id": "scene2-003",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "normal",
                    "text": "一人で帰れるよ",
                    "direction": ""
                },
                {
                    "id": "scene2-004",
                    "speaker": "ryuta",
                    "position": "right",
                    "expression": "normal",
                    "text": "知ってる",
                    "direction": ""
                },
                {
                    "id": "scene2-005",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "normal",
                    "text": "じゃあなんで来たの？",
                    "direction": ""
                },
                {
                    "id": "scene2-006",
                    "speaker": "ryuta",
                    "position": "right",
                    "expression": "normal",
                    "text": "暇だったから",
                    "direction": ""
                },
                {
                    "id": "scene2-007",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "laugh",
                    "text": "絶対嘘",
                    "direction": "【千鶴／笑う】"
                },
                {
                    "id": "scene2-008",
                    "speaker": "ryuta",
                    "position": "right",
                    "expression": "normal",
                    "text": "うるせぇ",
                    "direction": ""
                },
                {
                    "id": "scene2-009",
                    "speaker": "narration",
                    "text": "龍太が千鶴の隣を見る。そこには暁",
                    "direction": "（龍太が千鶴の隣を見る。そこには暁）"
                },
                {
                    "id": "scene2-010",
                    "speaker": "ryuta",
                    "position": "right",
                    "expression": "normal",
                    "text": "……",
                    "direction": "【龍太／暁を見る】"
                },
                {
                    "id": "scene2-011",
                    "speaker": "akatsuki",
                    "position": "left",
                    "expression": "normal",
                    "text": "……",
                    "direction": "【暁／龍太を見る】"
                },
                {
                    "id": "scene2-012",
                    "speaker": "narration",
                    "text": "龍太が自然に千鶴と暁の間へ入る。暁は一歩だけ身を引く",
                    "direction": "（龍太が自然に千鶴と暁の間へ入る。暁は一歩だけ身を引く）"
                },
                {
                    "id": "scene2-013",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "laugh",
                    "text": "あ、暁",
                    "direction": ""
                },
                {
                    "id": "scene2-014",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "laugh",
                    "text": "紹介するね、幼馴染の龍太",
                    "direction": ""
                },
                {
                    "id": "scene2-015",
                    "speaker": "ryuta",
                    "position": "right",
                    "expression": "normal",
                    "text": "龍太",
                    "direction": ""
                },
                {
                    "id": "scene2-016",
                    "speaker": "ryuta",
                    "position": "right",
                    "expression": "normal",
                    "text": "千鶴の彼氏です",
                    "direction": "【龍太／平然と】"
                },
                {
                    "id": "scene2-017",
                    "speaker": "narration",
                    "text": "一瞬の沈黙",
                    "direction": "（一瞬の沈黙）"
                },
                {
                    "id": "scene2-018",
                    "speaker": "akatsuki",
                    "position": "left",
                    "expression": "normal",
                    "text": "……",
                    "direction": ""
                },
                {
                    "id": "scene2-019",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "laugh",
                    "text": "違う違う",
                    "direction": "【千鶴／笑う】"
                },
                {
                    "id": "scene2-020",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "laugh",
                    "text": "幼馴染だよ",
                    "direction": ""
                },
                {
                    "id": "scene2-021",
                    "speaker": "ryuta",
                    "position": "right",
                    "expression": "normal",
                    "text": "今はな",
                    "direction": ""
                },
                {
                    "id": "scene2-022",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "laugh",
                    "text": "昔からずっと幼馴染でしょ",
                    "direction": ""
                },
                {
                    "id": "scene2-023",
                    "speaker": "akatsuki",
                    "position": "left",
                    "expression": "normal",
                    "text": "へえ",
                    "direction": ""
                },
                {
                    "id": "scene2-024",
                    "speaker": "akatsuki",
                    "position": "left",
                    "expression": "laugh",
                    "text": "彼氏さん素敵やな",
                    "direction": "【暁／軽く笑う】"
                },
                {
                    "id": "scene2-025",
                    "speaker": "ryuta",
                    "position": "right",
                    "expression": "normal",
                    "text": "……は？",
                    "direction": ""
                },
                {
                    "id": "scene2-026",
                    "speaker": "akatsuki",
                    "position": "left",
                    "expression": "laugh",
                    "text": "太陽みたいな髪型しとんな",
                    "direction": ""
                },
                {
                    "id": "scene2-027",
                    "speaker": "ryuta",
                    "position": "right",
                    "expression": "troubled",
                    "text": "お前喧嘩売ってんの？",
                    "direction": "【龍太／眉をひそめる】"
                },
                {
                    "id": "scene2-028",
                    "speaker": "akatsuki",
                    "position": "left",
                    "expression": "laugh",
                    "text": "褒めてんねん",
                    "direction": ""
                },
                {
                    "id": "scene2-029",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "normal",
                    "text": "確かに太陽っぽい",
                    "direction": "【千鶴／龍太の髪を見る】"
                },
                {
                    "id": "scene2-030",
                    "speaker": "ryuta",
                    "position": "right",
                    "expression": "troubled",
                    "text": "千鶴は笑うな",
                    "direction": ""
                },
                {
                    "id": "scene2-031",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "laugh",
                    "text": "だって似てる",
                    "direction": "【千鶴／笑う】"
                },
                {
                    "id": "scene2-032",
                    "speaker": "narration",
                    "text": "龍太が暁を見る",
                    "direction": "（龍太が暁を見る）"
                },
                {
                    "id": "scene2-033",
                    "speaker": "ryuta",
                    "position": "right",
                    "expression": "troubled",
                    "text": "……",
                    "direction": ""
                },
                {
                    "id": "scene2-034",
                    "speaker": "narration",
                    "text": "それ以上は何も言わない",
                    "direction": "（それ以上は何も言わない）"
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
                    "speaker": "narration",
                    "text": "栞那たちも追いついてくる",
                    "direction": "（栞那たちも追いついてくる）"
                },
                {
                    "id": "scene3-002",
                    "speaker": "kanna",
                    "position": "left",
                    "expression": "normal",
                    "text": "龍太じゃん",
                    "direction": "【左：栞那】"
                },
                {
                    "id": "scene3-003",
                    "speaker": "kanna",
                    "position": "left",
                    "expression": "laugh",
                    "text": "こんなとこで何してんの？",
                    "direction": "【栞那／少し笑う】"
                },
                {
                    "id": "scene3-004",
                    "speaker": "kanna",
                    "position": "left",
                    "expression": "laugh",
                    "text": "待ち伏せ？",
                    "direction": ""
                },
                {
                    "id": "scene3-005",
                    "speaker": "ryuta",
                    "position": "right",
                    "expression": "normal",
                    "text": "違う",
                    "direction": ""
                },
                {
                    "id": "scene3-006",
                    "speaker": "kanna",
                    "position": "left",
                    "expression": "laugh",
                    "text": "千鶴迎えに来たんでしょ",
                    "direction": ""
                },
                {
                    "id": "scene3-007",
                    "speaker": "ryuta",
                    "position": "right",
                    "expression": "normal",
                    "text": "暇だっただけ",
                    "direction": ""
                },
                {
                    "id": "scene3-008",
                    "speaker": "kanna",
                    "position": "left",
                    "expression": "laugh",
                    "text": "へえー",
                    "direction": ""
                },
                {
                    "id": "scene3-009",
                    "speaker": "ryuta",
                    "position": "right",
                    "expression": "normal",
                    "text": "何だよ",
                    "direction": ""
                },
                {
                    "id": "scene3-010",
                    "speaker": "kanna",
                    "position": "left",
                    "expression": "smile",
                    "text": "別に？",
                    "direction": "【栞那／笑顔】"
                },
                {
                    "id": "scene3-011",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "normal",
                    "text": "私も絶対迎えに来たと思う",
                    "direction": ""
                },
                {
                    "id": "scene3-012",
                    "speaker": "ryuta",
                    "position": "right",
                    "expression": "normal",
                    "text": "千鶴まで乗るなよ",
                    "direction": ""
                },
                {
                    "id": "scene3-013",
                    "speaker": "narration",
                    "text": "千鶴が紙袋を持ち直す",
                    "direction": "（千鶴が紙袋を持ち直す）"
                },
                {
                    "id": "scene3-014",
                    "speaker": "ryuta",
                    "position": "right",
                    "expression": "normal",
                    "text": "それ貸せ",
                    "direction": ""
                },
                {
                    "id": "scene3-015",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "normal",
                    "text": "大丈夫、自分で持てるよ",
                    "direction": ""
                },
                {
                    "id": "scene3-016",
                    "speaker": "ryuta",
                    "position": "right",
                    "expression": "normal",
                    "text": "そう言って何でも持つだろ、千鶴",
                    "direction": ""
                },
                {
                    "id": "scene3-017",
                    "speaker": "akatsuki",
                    "position": "left",
                    "expression": "normal",
                    "text": "やっぱ昔からなんや",
                    "direction": ""
                },
                {
                    "id": "scene3-018",
                    "speaker": "ryuta",
                    "position": "right",
                    "expression": "normal",
                    "text": "……何が？",
                    "direction": ""
                },
                {
                    "id": "scene3-019",
                    "speaker": "akatsuki",
                    "position": "left",
                    "expression": "normal",
                    "text": "頼まれたら断られへんやつ",
                    "direction": ""
                },
                {
                    "id": "scene3-020",
                    "speaker": "ryuta",
                    "position": "right",
                    "expression": "normal",
                    "text": "……",
                    "direction": ""
                },
                {
                    "id": "scene3-021",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "normal",
                    "text": "そんなことないよ",
                    "direction": ""
                },
                {
                    "id": "scene3-022",
                    "speaker": "ryuta",
                    "position": "right",
                    "expression": "normal",
                    "text": "ある",
                    "direction": ""
                },
                {
                    "id": "scene3-023",
                    "speaker": "akatsuki",
                    "position": "left",
                    "expression": "normal",
                    "text": "あるな",
                    "direction": ""
                },
                {
                    "id": "scene3-024",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "normal",
                    "text": "なんで二人とも同じこと言うの",
                    "direction": ""
                },
                {
                    "id": "scene3-025",
                    "speaker": "akatsuki",
                    "position": "left",
                    "expression": "normal",
                    "text": "見てたら分かる",
                    "direction": ""
                },
                {
                    "id": "scene3-026",
                    "speaker": "narration",
                    "text": "龍太が暁を見る",
                    "direction": "（龍太が暁を見る）"
                },
                {
                    "id": "scene3-027",
                    "speaker": "ryuta",
                    "position": "right",
                    "expression": "normal",
                    "text": "……見てたらね",
                    "direction": ""
                },
                {
                    "id": "scene3-028",
                    "speaker": "akatsuki",
                    "position": "left",
                    "expression": "normal",
                    "text": "なんや？",
                    "direction": ""
                },
                {
                    "id": "scene3-029",
                    "speaker": "ryuta",
                    "position": "right",
                    "expression": "normal",
                    "text": "別に",
                    "direction": ""
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
                    "text": "一行は公園内のベンチ付近へ移動する",
                    "direction": "（一行は公園内のベンチ付近へ移動する）"
                },
                {
                    "id": "scene4-002",
                    "speaker": "ryuta",
                    "position": "right",
                    "expression": "normal",
                    "text": "文化祭どうだった？",
                    "direction": ""
                },
                {
                    "id": "scene4-003",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "normal",
                    "text": "楽しかったよ",
                    "direction": ""
                },
                {
                    "id": "scene4-004",
                    "speaker": "kanna",
                    "position": "left",
                    "expression": "normal",
                    "text": "千鶴が食べすぎなければもっと平和だったかな",
                    "direction": ""
                },
                {
                    "id": "scene4-005",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "normal",
                    "text": "そんな食べてない",
                    "direction": ""
                },
                {
                    "id": "scene4-006",
                    "speaker": "akatsuki",
                    "position": "left",
                    "expression": "normal",
                    "text": "嘘つけ",
                    "direction": ""
                },
                {
                    "id": "scene4-007",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "normal",
                    "text": "なんで暁が言うの",
                    "direction": ""
                },
                {
                    "id": "scene4-008",
                    "speaker": "akatsuki",
                    "position": "left",
                    "expression": "normal",
                    "text": "俺おったやん",
                    "direction": ""
                },
                {
                    "id": "scene4-009",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "normal",
                    "text": "味見しただけ",
                    "direction": ""
                },
                {
                    "id": "scene4-010",
                    "speaker": "akatsuki",
                    "position": "left",
                    "expression": "normal",
                    "text": "食いもんの話になったら全部味見で済ますよな",
                    "direction": ""
                },
                {
                    "id": "scene4-011",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "normal",
                    "text": "必要な味見",
                    "direction": ""
                },
                {
                    "id": "scene4-012",
                    "speaker": "kanna",
                    "position": "left",
                    "expression": "normal",
                    "text": "三回目くらいから必要じゃなかったけどね",
                    "direction": ""
                },
                {
                    "id": "scene4-013",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "normal",
                    "text": "栞那まで！",
                    "direction": ""
                },
                {
                    "id": "scene4-014",
                    "speaker": "ryuta",
                    "position": "right",
                    "expression": "normal",
                    "text": "お前、結構千鶴いじるんだな",
                    "direction": "【龍太／暁を見る】"
                },
                {
                    "id": "scene4-015",
                    "speaker": "akatsuki",
                    "position": "left",
                    "expression": "normal",
                    "text": "反応分かりやすいからな",
                    "direction": ""
                },
                {
                    "id": "scene4-016",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "normal",
                    "text": "分かりやすくない",
                    "direction": ""
                },
                {
                    "id": "scene4-017",
                    "speaker": "akatsuki",
                    "position": "left",
                    "expression": "normal",
                    "text": "今も分かりやすいで",
                    "direction": ""
                },
                {
                    "id": "scene4-018",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "normal",
                    "text": "どこが",
                    "direction": ""
                },
                {
                    "id": "scene4-019",
                    "speaker": "akatsuki",
                    "position": "left",
                    "expression": "normal",
                    "text": "そこ",
                    "direction": ""
                },
                {
                    "id": "scene4-020",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "normal",
                    "text": "もういい",
                    "direction": ""
                },
                {
                    "id": "scene4-021",
                    "speaker": "akatsuki",
                    "position": "left",
                    "expression": "normal",
                    "text": "拗ねんなって",
                    "direction": ""
                },
                {
                    "id": "scene4-022",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "normal",
                    "text": "拗ねてない",
                    "direction": ""
                },
                {
                    "id": "scene4-023",
                    "speaker": "akatsuki",
                    "position": "left",
                    "expression": "normal",
                    "text": "はいはい",
                    "direction": ""
                },
                {
                    "id": "scene4-024",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "normal",
                    "text": "はいは一回",
                    "direction": ""
                },
                {
                    "id": "scene4-025",
                    "speaker": "akatsuki",
                    "position": "left",
                    "expression": "normal",
                    "text": "はい",
                    "direction": ""
                },
                {
                    "id": "scene4-026",
                    "speaker": "narration",
                    "text": "龍太が暁を見る。さっきより少し険しい",
                    "direction": "（龍太が暁を見る。さっきより少し険しい）"
                },
                {
                    "id": "scene4-027",
                    "speaker": "ryuta",
                    "position": "right",
                    "expression": "normal",
                    "text": "……",
                    "direction": ""
                },
                {
                    "id": "scene4-028",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "normal",
                    "text": "龍太だって昔よく私のお菓子食べてたよね",
                    "direction": ""
                },
                {
                    "id": "scene4-029",
                    "speaker": "ryuta",
                    "position": "right",
                    "expression": "normal",
                    "text": "千鶴が毎回持ってきてたからな",
                    "direction": ""
                },
                {
                    "id": "scene4-030",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "normal",
                    "text": "ちゃんと食べてたでしょ",
                    "direction": ""
                },
                {
                    "id": "scene4-031",
                    "speaker": "ryuta",
                    "position": "right",
                    "expression": "normal",
                    "text": "食べなかったら千鶴拗ねるだろ",
                    "direction": ""
                },
                {
                    "id": "scene4-032",
                    "speaker": "akatsuki",
                    "position": "left",
                    "expression": "normal",
                    "text": "あー、それ分かるわ",
                    "direction": ""
                },
                {
                    "id": "scene4-033",
                    "speaker": "narration",
                    "text": "龍太がすぐ暁を見る",
                    "direction": "（龍太がすぐ暁を見る）"
                },
                {
                    "id": "scene4-034",
                    "speaker": "ryuta",
                    "position": "right",
                    "expression": "normal",
                    "text": "……何が分かるんだよ",
                    "direction": ""
                },
                {
                    "id": "scene4-035",
                    "speaker": "akatsuki",
                    "position": "left",
                    "expression": "normal",
                    "text": "千鶴そういうとこあるやろ",
                    "direction": ""
                },
                {
                    "id": "scene4-036",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "normal",
                    "text": "ないよ",
                    "direction": ""
                },
                {
                    "id": "scene4-037",
                    "speaker": "ryuta",
                    "position": "right",
                    "expression": "normal",
                    "text": "ある",
                    "direction": ""
                },
                {
                    "id": "scene4-038",
                    "speaker": "akatsuki",
                    "position": "left",
                    "expression": "normal",
                    "text": "あるな",
                    "direction": ""
                },
                {
                    "id": "scene4-039",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "normal",
                    "text": "また二人とも！",
                    "direction": ""
                },
                {
                    "id": "scene4-040",
                    "speaker": "narration",
                    "text": "龍太が暁をじっと見る",
                    "direction": "（龍太が暁をじっと見る）"
                },
                {
                    "id": "scene4-041",
                    "speaker": "akatsuki",
                    "position": "left",
                    "expression": "normal",
                    "text": "……なんや？",
                    "direction": ""
                },
                {
                    "id": "scene4-042",
                    "speaker": "ryuta",
                    "position": "right",
                    "expression": "normal",
                    "text": "別に",
                    "direction": ""
                },
                {
                    "id": "scene4-043",
                    "speaker": "akatsuki",
                    "position": "left",
                    "expression": "normal",
                    "text": "ならええけど",
                    "direction": ""
                },
                {
                    "id": "scene4-044",
                    "speaker": "narration",
                    "text": "暁はそれ以上踏み込まない",
                    "direction": "（暁はそれ以上踏み込まない）"
                }
            ],
            "next": "scene5"
        },
        {
            "id": "scene5",
            "background": "big-park-evening",
            "lines": [
                {
                    "id": "scene5-001",
                    "speaker": "narration",
                    "text": "少し時間が経つ。千鶴・栞那・龍太",
                    "direction": "（少し時間が経つ。千鶴・栞那・龍太）"
                },
                {
                    "id": "scene5-002",
                    "speaker": "kanna",
                    "position": "left",
                    "expression": "normal",
                    "text": "龍太、英語の勉強まだ続けてるの？",
                    "direction": ""
                },
                {
                    "id": "scene5-003",
                    "speaker": "ryuta",
                    "position": "right",
                    "expression": "normal",
                    "text": "続けてる",
                    "direction": ""
                },
                {
                    "id": "scene5-004",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "normal",
                    "text": "最近ずっと英語の本持ってるよね",
                    "direction": ""
                },
                {
                    "id": "scene5-005",
                    "speaker": "ryuta",
                    "position": "right",
                    "expression": "normal",
                    "text": "将来使うからな",
                    "direction": ""
                },
                {
                    "id": "scene5-006",
                    "speaker": "kanna",
                    "position": "left",
                    "expression": "normal",
                    "text": "本当に海外行くつもりなんだ",
                    "direction": ""
                },
                {
                    "id": "scene5-007",
                    "speaker": "ryuta",
                    "position": "right",
                    "expression": "normal",
                    "text": "留学も考えてる",
                    "direction": ""
                },
                {
                    "id": "scene5-008",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "normal",
                    "text": "龍太なら普通に行きそう",
                    "direction": ""
                },
                {
                    "id": "scene5-009",
                    "speaker": "ryuta",
                    "position": "right",
                    "expression": "normal",
                    "text": "千鶴は驚かなさすぎ",
                    "direction": ""
                },
                {
                    "id": "scene5-010",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "normal",
                    "text": "昔から言ってたし",
                    "direction": ""
                },
                {
                    "id": "scene5-011",
                    "speaker": "ryuta",
                    "position": "right",
                    "expression": "laugh",
                    "text": "まあな",
                    "direction": "【龍太／少し笑う】"
                },
                {
                    "id": "scene5-012",
                    "speaker": "narration",
                    "text": "拓海・結月",
                    "direction": "（拓海・結月）"
                },
                {
                    "id": "scene5-013",
                    "speaker": "yuzuki",
                    "position": "left",
                    "expression": "normal",
                    "text": "拓海くん、駅まで一緒に帰ろ",
                    "direction": ""
                },
                {
                    "id": "scene5-014",
                    "speaker": "takumi",
                    "position": "left",
                    "expression": "normal",
                    "text": "いいよ",
                    "direction": ""
                },
                {
                    "id": "scene5-015",
                    "speaker": "narration",
                    "text": "拓海が舞依を見る",
                    "direction": "（拓海が舞依を見る）"
                },
                {
                    "id": "scene5-016",
                    "speaker": "yuzuki",
                    "position": "left",
                    "expression": "normal",
                    "text": "今、舞依ちゃん見た",
                    "direction": ""
                },
                {
                    "id": "scene5-017",
                    "speaker": "takumi",
                    "position": "left",
                    "expression": "troubled",
                    "text": "ちょっとだけ",
                    "direction": "【拓海／苦笑】"
                },
                {
                    "id": "scene5-018",
                    "speaker": "yuzuki",
                    "position": "left",
                    "expression": "normal",
                    "text": "私と話してる時くらい私見てよ",
                    "direction": ""
                },
                {
                    "id": "scene5-019",
                    "speaker": "takumi",
                    "position": "left",
                    "expression": "troubled",
                    "text": "ごめんごめん",
                    "direction": ""
                },
                {
                    "id": "scene5-020",
                    "speaker": "narration",
                    "text": "舞依・剛",
                    "direction": "（舞依・剛）"
                },
                {
                    "id": "scene5-021",
                    "speaker": "mai",
                    "position": "left",
                    "expression": "normal",
                    "text": "剛さん",
                    "direction": ""
                },
                {
                    "id": "scene5-022",
                    "speaker": "tsuyoshi",
                    "position": "left",
                    "expression": "normal",
                    "text": "ん？",
                    "direction": ""
                },
                {
                    "id": "scene5-023",
                    "speaker": "mai",
                    "position": "left",
                    "expression": "normal",
                    "text": "なんか雰囲気やばくないですか？",
                    "direction": ""
                },
                {
                    "id": "scene5-024",
                    "speaker": "tsuyoshi",
                    "position": "left",
                    "expression": "normal",
                    "text": "……ほんまやな",
                    "direction": "【剛／暁と龍太を見る】"
                },
                {
                    "id": "scene5-025",
                    "speaker": "mai",
                    "position": "left",
                    "expression": "normal",
                    "text": "暁さんのあんな感じ初めて見ました",
                    "direction": ""
                },
                {
                    "id": "scene5-026",
                    "speaker": "tsuyoshi",
                    "position": "left",
                    "expression": "normal",
                    "text": "俺もや",
                    "direction": ""
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
                    "speaker": "narration",
                    "text": "暁が千鶴へ声をかける",
                    "direction": "（暁が千鶴へ声をかける）"
                },
                {
                    "id": "scene6-002",
                    "speaker": "akatsuki",
                    "position": "left",
                    "expression": "normal",
                    "text": "千鶴",
                    "direction": ""
                },
                {
                    "id": "scene6-003",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "normal",
                    "text": "ん？",
                    "direction": ""
                },
                {
                    "id": "scene6-004",
                    "speaker": "akatsuki",
                    "position": "left",
                    "expression": "normal",
                    "text": "俺そろそろ帰るわ",
                    "direction": ""
                },
                {
                    "id": "scene6-005",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "normal",
                    "text": "もう帰るの？",
                    "direction": ""
                },
                {
                    "id": "scene6-006",
                    "speaker": "akatsuki",
                    "position": "left",
                    "expression": "normal",
                    "text": "まあな",
                    "direction": ""
                },
                {
                    "id": "scene6-007",
                    "speaker": "akatsuki",
                    "position": "left",
                    "expression": "normal",
                    "text": "今日はありがとな",
                    "direction": ""
                },
                {
                    "id": "scene6-008",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "smile",
                    "text": "こっちこそ",
                    "direction": "【千鶴／笑顔】"
                },
                {
                    "id": "scene6-009",
                    "speaker": "akatsuki",
                    "position": "left",
                    "expression": "normal",
                    "text": "俺にも仲ええ幼馴染の剛が待ってるしな",
                    "direction": ""
                },
                {
                    "id": "scene6-010",
                    "speaker": "tsuyoshi",
                    "position": "left",
                    "expression": "normal",
                    "text": "呼んだか？",
                    "direction": "【剛／突然横から】"
                },
                {
                    "id": "scene6-011",
                    "speaker": "akatsuki",
                    "position": "left",
                    "expression": "normal",
                    "text": "……",
                    "direction": ""
                },
                {
                    "id": "scene6-012",
                    "speaker": "tsuyoshi",
                    "position": "left",
                    "expression": "normal",
                    "text": "なんや？",
                    "direction": ""
                },
                {
                    "id": "scene6-013",
                    "speaker": "akatsuki",
                    "position": "left",
                    "expression": "normal",
                    "text": "呼んでへん",
                    "direction": ""
                },
                {
                    "id": "scene6-014",
                    "speaker": "tsuyoshi",
                    "position": "left",
                    "expression": "normal",
                    "text": "今名前言うたやん",
                    "direction": ""
                },
                {
                    "id": "scene6-015",
                    "speaker": "akatsuki",
                    "position": "left",
                    "expression": "normal",
                    "text": "例として出しただけや！",
                    "direction": ""
                },
                {
                    "id": "scene6-016",
                    "speaker": "narration",
                    "text": "暁が小さくため息をつく",
                    "direction": "（暁が小さくため息をつく）"
                },
                {
                    "id": "scene6-017",
                    "speaker": "akatsuki",
                    "position": "left",
                    "expression": "normal",
                    "text": "……はぁ",
                    "direction": ""
                },
                {
                    "id": "scene6-018",
                    "speaker": "narration",
                    "text": "剛だけが気付く",
                    "direction": "（剛だけが気付く）"
                },
                {
                    "id": "scene6-019",
                    "speaker": "tsuyoshi",
                    "position": "left",
                    "expression": "normal",
                    "text": "……",
                    "direction": ""
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
                    "speaker": "kanna",
                    "position": "left",
                    "expression": "normal",
                    "text": "千鶴、ちょっと来て",
                    "direction": ""
                },
                {
                    "id": "scene7-002",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "normal",
                    "text": "今？",
                    "direction": ""
                },
                {
                    "id": "scene7-003",
                    "speaker": "kanna",
                    "position": "left",
                    "expression": "normal",
                    "text": "今",
                    "direction": ""
                },
                {
                    "id": "scene7-004",
                    "speaker": "chizuru",
                    "position": "left",
                    "expression": "normal",
                    "text": "分かった",
                    "direction": ""
                },
                {
                    "id": "scene7-005",
                    "speaker": "narration",
                    "text": "千鶴と栞那が離れる",
                    "direction": "（千鶴と栞那が離れる）"
                },
                {
                    "id": "scene7-006",
                    "speaker": "mai",
                    "position": "left",
                    "expression": "normal",
                    "text": "剛さん",
                    "direction": "【舞依／小声】"
                },
                {
                    "id": "scene7-007",
                    "speaker": "tsuyoshi",
                    "position": "left",
                    "expression": "normal",
                    "text": "なんや",
                    "direction": ""
                },
                {
                    "id": "scene7-008",
                    "speaker": "mai",
                    "position": "left",
                    "expression": "normal",
                    "text": "ここ、ちょっと怖いです",
                    "direction": ""
                },
                {
                    "id": "scene7-009",
                    "speaker": "tsuyoshi",
                    "position": "left",
                    "expression": "normal",
                    "text": "……せやな",
                    "direction": ""
                },
                {
                    "id": "scene7-010",
                    "speaker": "mai",
                    "position": "left",
                    "expression": "normal",
                    "text": "離れません？",
                    "direction": ""
                },
                {
                    "id": "scene7-011",
                    "speaker": "narration",
                    "text": "剛が暁を見る。一瞬だけ迷う",
                    "direction": "（剛が暁を見る。一瞬だけ迷う）"
                },
                {
                    "id": "scene7-012",
                    "speaker": "tsuyoshi",
                    "position": "left",
                    "expression": "normal",
                    "text": "舞依、拓海んとこ行こ",
                    "direction": ""
                },
                {
                    "id": "scene7-013",
                    "speaker": "mai",
                    "position": "left",
                    "expression": "normal",
                    "text": "はい",
                    "direction": ""
                },
                {
                    "id": "scene7-014",
                    "speaker": "narration",
                    "text": "剛は舞依と一緒に拓海と結月のところへ向かう",
                    "direction": "（剛は舞依と一緒に拓海と結月のところへ向かう）"
                },
                {
                    "id": "scene7-015",
                    "speaker": "takumi",
                    "position": "left",
                    "expression": "normal",
                    "text": "舞依？",
                    "direction": ""
                },
                {
                    "id": "scene7-016",
                    "speaker": "mai",
                    "position": "left",
                    "expression": "normal",
                    "text": "ちょっとここにいさせてください",
                    "direction": ""
                },
                {
                    "id": "scene7-017",
                    "speaker": "takumi",
                    "position": "left",
                    "expression": "normal",
                    "text": "いいけど、どうしたの？",
                    "direction": ""
                },
                {
                    "id": "scene7-018",
                    "speaker": "tsuyoshi",
                    "position": "left",
                    "expression": "normal",
                    "text": "あっちはちょっと空気悪いねん",
                    "direction": ""
                },
                {
                    "id": "scene7-019",
                    "speaker": "narration",
                    "text": "拓海が遠くの二人を見る",
                    "direction": "（拓海が遠くの二人を見る）"
                },
                {
                    "id": "scene7-020",
                    "speaker": "takumi",
                    "position": "left",
                    "expression": "normal",
                    "text": "……なるほど",
                    "direction": ""
                },
                {
                    "id": "scene7-021",
                    "speaker": "narration",
                    "text": "剛ももう一度だけ暁を見る",
                    "direction": "（剛ももう一度だけ暁を見る）"
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
                    "text": "残ったのは龍太と暁",
                    "direction": "（残ったのは龍太と暁）"
                },
                {
                    "id": "scene8-002",
                    "speaker": "ryuta",
                    "position": "right",
                    "expression": "normal",
                    "text": "邪魔者消えたな",
                    "direction": ""
                },
                {
                    "id": "scene8-003",
                    "speaker": "akatsuki",
                    "position": "left",
                    "expression": "normal",
                    "text": "は？",
                    "direction": ""
                },
                {
                    "id": "scene8-004",
                    "speaker": "ryuta",
                    "position": "right",
                    "expression": "normal",
                    "text": "帰るんじゃなかったのか？",
                    "direction": ""
                },
                {
                    "id": "scene8-005",
                    "speaker": "akatsuki",
                    "position": "left",
                    "expression": "normal",
                    "text": "帰ろうとしたら剛が来たんやろ",
                    "direction": ""
                },
                {
                    "id": "scene8-006",
                    "speaker": "ryuta",
                    "position": "right",
                    "expression": "normal",
                    "text": "なら今帰れば？",
                    "direction": ""
                },
                {
                    "id": "scene8-007",
                    "speaker": "akatsuki",
                    "position": "left",
                    "expression": "normal",
                    "text": "……なんなんお前",
                    "direction": ""
                },
                {
                    "id": "scene8-008",
                    "speaker": "ryuta",
                    "position": "right",
                    "expression": "normal",
                    "text": "こっちの台詞だ",
                    "direction": ""
                },
                {
                    "id": "scene8-009",
                    "speaker": "ryuta",
                    "position": "right",
                    "expression": "normal",
                    "text": "千鶴のこと知ったような顔してんの、なんかムカつくわ",
                    "direction": ""
                },
                {
                    "id": "scene8-010",
                    "speaker": "akatsuki",
                    "position": "left",
                    "expression": "normal",
                    "text": "……は？",
                    "direction": ""
                },
                {
                    "id": "scene8-011",
                    "speaker": "ryuta",
                    "position": "right",
                    "expression": "normal",
                    "text": "会ってそんな経ってねぇんだろ？",
                    "direction": ""
                },
                {
                    "id": "scene8-012",
                    "speaker": "ryuta",
                    "position": "right",
                    "expression": "normal",
                    "text": "なのに何でも分かってますみたいな態度して",
                    "direction": ""
                },
                {
                    "id": "scene8-013",
                    "speaker": "akatsuki",
                    "position": "left",
                    "expression": "normal",
                    "text": "別にそんなつもりないけど",
                    "direction": ""
                },
                {
                    "id": "scene8-014",
                    "speaker": "ryuta",
                    "position": "right",
                    "expression": "normal",
                    "text": "じゃあ何だよ",
                    "direction": ""
                },
                {
                    "id": "scene8-015",
                    "speaker": "akatsuki",
                    "position": "left",
                    "expression": "normal",
                    "text": "普通に話してるだけや",
                    "direction": ""
                },
                {
                    "id": "scene8-016",
                    "speaker": "ryuta",
                    "position": "right",
                    "expression": "normal",
                    "text": "それが気に食わねぇんだよ",
                    "direction": ""
                },
                {
                    "id": "scene8-017",
                    "speaker": "akatsuki",
                    "position": "left",
                    "expression": "normal",
                    "text": "知らんがな",
                    "direction": ""
                },
                {
                    "id": "scene8-018",
                    "speaker": "narration",
                    "text": "少し沈黙",
                    "direction": "（少し沈黙）"
                },
                {
                    "id": "scene8-019",
                    "speaker": "akatsuki",
                    "position": "left",
                    "expression": "normal",
                    "text": "……もうええわ",
                    "direction": ""
                },
                {
                    "id": "scene8-020",
                    "speaker": "akatsuki",
                    "position": "left",
                    "expression": "normal",
                    "text": "千鶴の幼馴染と喧嘩したいわけちゃうし",
                    "direction": ""
                },
                {
                    "id": "scene8-021",
                    "speaker": "akatsuki",
                    "position": "left",
                    "expression": "normal",
                    "text": "帰る",
                    "direction": ""
                },
                {
                    "id": "scene8-022",
                    "speaker": "narration",
                    "text": "暁が背を向ける",
                    "direction": "（暁が背を向ける）"
                },
                {
                    "id": "scene8-023",
                    "speaker": "ryuta",
                    "position": "right",
                    "expression": "normal",
                    "text": "逃げんの？",
                    "direction": ""
                },
                {
                    "id": "scene8-024",
                    "speaker": "narration",
                    "text": "暁が止まる",
                    "direction": "（暁が止まる）"
                },
                {
                    "id": "scene8-025",
                    "speaker": "ryuta",
                    "position": "right",
                    "expression": "normal",
                    "text": "さっきから俺のこと気に食わねぇって顔してたくせに",
                    "direction": ""
                },
                {
                    "id": "scene8-026",
                    "speaker": "akatsuki",
                    "position": "left",
                    "expression": "normal",
                    "text": "お前もやろ",
                    "direction": ""
                },
                {
                    "id": "scene8-027",
                    "speaker": "ryuta",
                    "position": "right",
                    "expression": "normal",
                    "text": "ああ",
                    "direction": ""
                },
                {
                    "id": "scene8-028",
                    "speaker": "ryuta",
                    "position": "right",
                    "expression": "normal",
                    "text": "気に食わねぇよ",
                    "direction": ""
                },
                {
                    "id": "scene8-029",
                    "speaker": "ryuta",
                    "position": "right",
                    "expression": "normal",
                    "text": "気の短い男は千鶴に似合わねぇな",
                    "direction": ""
                },
                {
                    "id": "scene8-030",
                    "speaker": "akatsuki",
                    "position": "left",
                    "expression": "normal",
                    "text": "お前に言われたくないんやが？",
                    "direction": "【暁／表情が変わる】"
                },
                {
                    "id": "scene8-031",
                    "speaker": "ryuta",
                    "position": "right",
                    "expression": "normal",
                    "text": "なんだよ",
                    "direction": ""
                },
                {
                    "id": "scene8-032",
                    "speaker": "ryuta",
                    "position": "right",
                    "expression": "normal",
                    "text": "やんの？",
                    "direction": ""
                },
                {
                    "id": "scene8-033",
                    "speaker": "akatsuki",
                    "position": "left",
                    "expression": "normal",
                    "text": "やってやろうやないか",
                    "direction": ""
                },
                {
                    "id": "scene8-034",
                    "speaker": "ryuta",
                    "position": "right",
                    "expression": "normal",
                    "text": "上等だ",
                    "direction": ""
                },
                {
                    "id": "scene8-035",
                    "speaker": "narration",
                    "text": "龍太が暁の胸ぐらを掴む",
                    "direction": "（龍太が暁の胸ぐらを掴む）"
                },
                {
                    "id": "scene8-036",
                    "speaker": "akatsuki",
                    "position": "left",
                    "expression": "normal",
                    "text": "離せや",
                    "direction": ""
                },
                {
                    "id": "scene8-037",
                    "speaker": "narration",
                    "text": "その瞬間、遠くから剛が走ってくる",
                    "direction": "（その瞬間、遠くから剛が走ってくる）"
                },
                {
                    "id": "scene8-038",
                    "speaker": "tsuyoshi",
                    "position": "left",
                    "expression": "normal",
                    "text": "……あかん！",
                    "direction": ""
                },
                {
                    "id": "scene8-039",
                    "speaker": "narration",
                    "text": "ドンッ！！",
                    "direction": "SE：ドンッ！！",
                    "se": "impact",
                    "screen": "screenShake"
                },
                {
                    "id": "scene8-040",
                    "speaker": "narration",
                    "text": "龍太がよろける",
                    "direction": "（龍太がよろける）"
                },
                {
                    "id": "scene8-041",
                    "speaker": "ryuta",
                    "position": "right",
                    "expression": "normal",
                    "text": "……は？",
                    "direction": ""
                },
                {
                    "id": "scene8-042",
                    "speaker": "narration",
                    "text": "目の前には剛",
                    "direction": "（目の前には剛）"
                },
                {
                    "id": "scene8-043",
                    "speaker": "akatsuki",
                    "position": "left",
                    "expression": "normal",
                    "text": "は？",
                    "direction": ""
                },
                {
                    "id": "scene8-044",
                    "speaker": "narration",
                    "text": "",
                    "direction": "暗転",
                    "hide": "all",
                    "effect": "fadeOut"
                },
                {
                    "id": "scene8-045",
                    "speaker": "narration",
                    "text": "TO BE CONTINUED",
                    "card": true,
                    "hide": "all"
                }
            ]
        }
    ],
    "clear": {
        "heading": "前編 CLEAR『気に食わねぇ奴』",
        "title": ""
    }
});
