# ストーリー背景

2026-10-03制作。青葉台高校、11月の文化祭期を想定した人物のいない背景です。

| キー | 場面 |
| --- | --- |
| festival-classroom | 第4話のカレー・おにぎり喫茶。紙飾り、花、調理用の大鍋とおにぎり |
| classroom | 飾りのない通常の高校教室、昼間 |
| festival-hallway | 文化祭の紙飾り・ポスター・案内板がある廊下 |
| school-gate | 文化祭の入口アーチと紅葉のある校門 |
| festival-courtyard | 食べ物の屋台・提灯・グリルがある中庭、午前 |
| gym-stage | 舞台幕・照明・折りたたみ椅子のある体育館 |
| cooking-room | ステンレス天板、コンロ、流し、調理器具のある調理室 |
| rooftop | フェンスと秋空が見える校舎の屋上 |
| shopping-street | 小さな日本の商店街、午後 |
| small-restaurant | カウンターと数卓、厨房の受け渡し口がある洋食屋 |
| festival-kitchen | 第6話SCENE 6・第7話SCENE 1。文化祭喫茶教室の奥をカーテンで仕切った簡易調理・仕込みスペース |

組み込み画像生成ツールで各場面を個別に生成し、既存の料理カード・キャラ画に合う暖色のアニメ画調を指定しました。読める文字・人物・ロゴ・署名・透かしは入れていません。看板類は抽象的な線や料理の絵です。

原本は各キーのPNG（1920×1080、RGB）。ゲーム用は `assets/battle-images/story/backgrounds/` の同名WebP（1920×1080、品質80、effort 6）です。Sharpで寸法と色形式を統一しています。中央608pxのスマホ切り抜きは確認用シートの水色の破線で示しています。

生成プロンプト・検証結果・一覧画像は `docs/story/art-review/` を参照してください。

## 2026-10-03 第5〜7話用の追加

`festival-kitchen.png` と `assets/battle-images/story/backgrounds/festival-kitchen.webp` を追加。既存の `festival-classroom` を画調・内装の参照にし、昼間の暖色、紙飾り、カーテンの仕切り、カセットコンロ、大きいカレー鍋、炊飯器、おにぎりのトレー、まな板、フックのエプロンを配置しました。人物・読める文字・ロゴ・署名・透かしはありません。中央608pxにも鍋・コンロ・炊飯器・おにぎり・まな板・祭りの飾りが入ります。PNGは1920×1080 RGB、WebPは同寸法・品質80・effort 6、173,920 bytes。確認画像は `docs/story/art-review/contact-sheet-festival-kitchen.png`、生成指示は `docs/story/art-review/generation-prompts-ep5-7.md`、検証は `docs/story/art-review/verification-ep5-7.json` を参照してください。


## 2026-10-03 第10話の夕方・文化祭後の追加

| キー | 場面 | WebP bytes |
| --- | --- | --- |
| `festival-classroom-evening` | 既存の文化祭カレー喫茶教室。夕日、片付け用の箱、重ねた椅子。飾りと鍋は残る。 | 183,530 |
| `classroom-after-festival` | 同じ教室の片付け後。机は列へ戻り、少量の輪飾りと夕方の光が残る。 | 150,394 |
| `school-gate-evening` | 既存の校門と文化祭アーチ。灯りを点け、空が青と橙へ移る夕暮れ。 | 322,946 |

既存 `festival-classroom.webp` と `school-gate.webp` を参照し、同じ建物・配置・画調を保持。全3点は人物なし、読める文字・ロゴ・署名・透かしなし。原本は同名1920×1080 RGB PNG、ゲーム用は `assets/battle-images/story/backgrounds/` の同名・同寸法WebP（品質80、effort 6）。中央608pxの9:16切り抜きで教室の通路・黒板、校門アーチ・校舎が読めることを確認しました。確認は `docs/story/art-review/contact-sheet-evening.png`、指示は `generation-prompts-expressions.md`、記録は `verification-expressions.json`（いずれも同art-reviewフォルダー）。既存11背景は変更していません。
