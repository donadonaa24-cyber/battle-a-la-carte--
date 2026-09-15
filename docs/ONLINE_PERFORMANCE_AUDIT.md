# Supabase通信対戦・画像パフォーマンス調査

調査日: 2026-09-15

## 調査範囲

- GitHub Pages公開版を独立した2ブラウザ領域で実測しました。
- `network.js`, `battle-protocol.js`, `battle-engine-worker.js`, `render.js`, `main.js` とスマホ側対応ファイルを確認しました。
- Supabaseダッシュボードで接続先リージョンを確認しました。
- 対戦用プリロード対象56画像をローカルファイルから計測しました。
- ゲーム、通信、SQL、画像には変更を加えていません。

## 結論

- 約1秒の操作遅延は再現しました。軽量な確認パネル操作8回は平均1,010ms、範囲593〜1,440msでした。
- ゲームルール計算は中央値0.203msで、主因ではありません。
- 主因は、1操作ごとにRPC書込み、Postgres Changes通知、複数REST再取得、HOST確定RPC、再通知、再取得を直列に行う通信経路です。
- 現在の接続先はソウルです。日本から利用可能な近距離リージョンですが、東京よりは不利です。ただしリージョンより先に往復回数を減らす方が効果は大きいと判断します。
- HOST/GUESTは別の描画関数ではありません。GUEST状態を反転して共通 `updateUI()` を使いますが、保存状態とDOMが `player/cpu` 前提のため、CPU表記や変換漏れが不整合の原因になります。
- 初回画像表示の主因は、56枚・141.93MBの巨大PNGを対戦開始前後に全件プリロードすることです。展開後は約336MB相当です。

## Supabaseリージョン

### 現在ゲームが使用するプロジェクト

- プロジェクト: `aniani-common`
- リージョン: AWS `ap-northeast-2`
- 場所: ソウル

### 比較対象

- 別のBattle専用プロジェクトは AWS `ap-northeast-1`（東京）でした。
- 現在の `supabase-config.js` はBattle専用ではなく `aniani-common` を参照しています。

### 判定

- ソウルは日本向けとして致命的に遠いリージョンではありません。
- 日本ユーザー中心なら東京の方が適切です。
- 現在は1操作で複数往復するため、1往復の地域差が積算されます。
- 共通アカウント基盤ごとの移行になるため、調査段階ではリージョン変更を行いません。

## 現在の通信経路

### 使用状況

|方式|用途|対戦操作での使用|
|---|---|---|
|Realtime Presence|相手の接続状態|使用中|
|Realtime Broadcast|なし|未使用|
|Postgres Changes|部屋、表示状態、操作行の変更通知|使用中|
|REST/PostgREST RPC|部屋作成・参加、操作送信、状態確定、退出|使用中|
|REST SELECT|部屋、表示状態、操作、チェックポイントの再取得|使用中|

SQLにも「ゲーム状態はBroadcastしない」と明記されており、Broadcast用RLSはありません。

### 1操作の流れ

1. 操作関数を `network.js` の `dispatch()` が横取りします。
2. 操作を `sessionStorage` に保存し、UIを「操作を確認しています…」でロックします。
3. `balc_submit_action` RPCの完了を待ちます。
4. 操作側で `sync()` を実行し、`battle_rooms` と自分の `battle_views` をREST再取得します。
5. `battle_match_actions` のPostgres ChangesをHOSTが受信します。
6. HOSTも `battle_rooms` と自分の `battle_views` をREST再取得します。
7. HOSTが未処理actionとcheckpointをREST再取得します。
8. HOST Workerが既存ルールへ操作を適用します。
9. HOSTが `balc_commit` RPCの完了を待ちます。
10. commitはcheckpoint、HOST/GUEST view、room、actionを更新します。
11. 複数のPostgres Changes通知を受け、両クライアントがroomと自分のviewを再取得します。
12. `applyView()` が `GameState` を更新し、`updateUI()` でDOM描画します。

`sync()` 中に別通知が来ると `syncAgain` が立ち、同じroom/view再取得ループをもう一度行います。1回のcommitが複数テーブルを更新するため、追加ループが発生しやすい構造です。

## 計測結果

### 公開版の端末間実測

|計測対象|回数|結果|
|---|---:|---:|
|軽量操作から自分UI反映|8|平均1,010ms、中央値1,030ms、593〜1,440ms|
|材料カード選択から操作パネル表示|1|1,161ms|
|セット確定から相手の伏せセット表示|1|1,378ms|
|セット確定から操作側のセット表示|1|1,935ms|
|GUEST参加からHOST対戦表示|1|10,837ms|
|GUEST参加からGUEST対戦表示|1|11,197ms|

対戦開始値には匿名認証、初期状態生成、初回DB確定、Realtime参加、画像プリロードが含まれます。純粋な通信遅延ではありません。

### Supabase REST実測

Node.jsの `performance.now()` で同じ接続先を計測しました。

|処理|回数|平均|範囲|
|---|---:|---:|---:|
|room SELECT|8|56.9ms|45.8〜65.7ms|
|view SELECT|8|64.3ms|46.4〜93.9ms|
|匿名認証（初回）|1|962.1ms|初回値|
|匿名認証（直後の2回目）|1|65.0ms|ウォーム値|
|部屋作成RPC|1|289.1ms|初回値|
|部屋参加RPC|1|89.9ms|単発値|
|退出RPC|1|66.3ms|単発値|

1回の通常 `sync()` はroomとviewを直列取得するため、実測平均だけで約121msです。HOSTの操作処理ではaction、checkpoint、commit、commit後のroom/viewも追加されます。

### ローカル処理実測

|処理|結果|
|---|---:|
|Worker相当のゲーム初期化|0.569ms|
|操作適用、snapshot複製、2視点生成の中央値|0.203ms|
|同95%値|0.394ms|
|同最大値（1,000回）|0.879ms|
|正規snapshot|約5.8KB|
|HOST view|約3.6KB|
|GUEST view|約3.5KB|

### 地点別評価

|地点|計測/評価|
|---|---|
|入力|壁時計計測の開始点。クリック自体の時間は分離していません。|
|ローカル処理|Worker処理は1ms未満。主因ではありません。|
|Supabase送信|ウォーム時の1 REST/RPCは概ね46〜94ms。|
|相手受信|Postgres Changes単独の到達時間は、現行コードに計測点がなく分離未計測です。|
|状態更新|複数の直列SELECTとcommit待ちが主因です。通常syncだけで平均約121msです。|
|DOM描画|14ms以内の連続描画は次フレームへ送ります。純粋な描画時間は現行コードに開始/終了計測がなく分離未計測です。|
|画像デコード|`decode()` を待っておらず分離未計測。展開量からスマホで無視できない負荷と判断します。|
|入力から相手DOM|セット操作の実測は1,378msでした。|

Postgres Changes受信、各REST、Worker、commit、`applyView` 前後に恒久計測点を追加すれば完全分解できます。今回は「現在の実装を変更しない」条件を優先し、未計測値を推測で埋めていません。

## DB完了待ちの確認

- 操作側は `await rpc('balc_submit_action', ...)` の完了を待ちます。
- その後さらに `await sync()` を待ちます。
- HOSTは `await rpc('balc_commit', ...)` の完了を待ちます。
- UIへ新状態を適用するのは、revisionが増えた `battle_views` を再取得した後です。
- 楽観的なローカルUI更新はありません。確認パネルの開閉もDB往復対象です。

したがって、DB書込み完了と再取得を待ってからUI更新する箇所があります。ゲーム結果に影響しないローカル確認画面まで通信対象なのが、体感遅延を強めています。

## Broadcast利用の検討

Broadcastで高速化できる余地は大きいです。ただし、DB永続化と非公開情報保護は残す必要があります。

推奨する段階的構成:

1. HOST/GUESTのPrivate Channelは維持します。
2. 操作通知をBroadcastでHOSTへ即時送信します。
3. HOSTはメモリ上の最新checkpointへWorker操作を適用します。
4. HOSTはDBへcommitし、成功後に「新revision確定」をBroadcastします。
5. 各クライアントは必要な自分用viewだけ取得するか、ユーザー別Private Channelで自分用viewを受け取ります。
6. 再接続時だけDB checkpoint/viewを再取得します。

この方式なら、毎操作のaction INSERT、action SELECT、checkpoint SELECT、重複room/view SELECTを削減できます。Broadcastだけを正規状態にすると取りこぼし・再接続・改造HOST問題が悪化するため、DB確定は残すのが安全です。

## HOST/GUEST UI不整合と描画構造

### 現在の構造

- DB上の役割は `host_id`, `guest_id` です。
- 正規snapshotではHOSTを `players.player`、GUESTを `players.cpu` として保存します。
- GUEST用view作成時に `players`, `characterIds`, `currentTurn`, `winner` 等を `swap()` します。
- その結果、両端末とも自分を `player`、相手を `cpu` として同じ `updateUI()` で描画します。

つまり、目的とする「同じUIコード」は部分的に実現済みですが、表示モデル名が `me/opponent` ではなくCPU戦由来の `player/cpu` です。

### 不整合の原因

- `web.html` と `mobile/mobile.html` に「CPU」「CPU手札」「CPUセット」「CPUの料理」が固定文字列で残っています。
- `render.js` と `mobile/render-sp.js` に `renderCpuMixedHand`, `renderCpuSet`, `cpu-*` DOM IDが残っています。
- オンライン中も設定画面にCPU性格・CPU速度が表示されます。
- `player.js` にCPU固定のログ文言が残っています。
- `BattleProtocol.swap()` は列挙されたフィールドだけを交換します。将来フィールドを追加して交換対象へ加え忘れると、GUESTだけ表示が崩れます。
- 操作した本人には詳細ログ、相手には「相手が操作しました。」だけを返すため、ログ表示は意図的に非対称です。
- `effects` の視点変換はスキルカットインとModeカットインだけを個別補正しています。

### 推奨構造

- 既存ルール内部の `player/cpu` は急に書き換えず、Worker境界に限定します。
- 永続役割は `host/guest` のままにします。
- 描画直前に明示的な `{ me, opponent, turn: 'me' | 'opponent' }` ViewModelへ変換します。
- HTML表示文言とDOM参照を `me/opponent` に寄せ、CPU戦ではCPUアダプターから同じViewModelを作ります。
- まず固定表示と設定非表示だけを直し、その後に内部DOM IDを段階的に整理するのが安全です。

## 通信対戦に残るCPU由来の要素

|分類|現在の残存要素|オンライン時の状態|
|---|---|---|
|状態|`GameState.players.cpu`, `currentTurn='cpu'`|相手を表すため使用中|
|HTML|CPU、CPU手札、CPUセット、CPUの料理|そのまま表示される|
|描画|`renderCpuMixedHand`, `renderCpuSet`, `cpu-*` ID|相手表示として使用中|
|設定|CPU性格、CPU速度|オンラインでも表示される|
|ログ|CPU固定文言|一部オンラインにも出る可能性あり|
|AI|`cpu.js`|HTMLには読込むが、オンライン中の `cpuTurn()` は停止|
|Worker|CPU AI|`cpu.js` を読み込まないため実行されない|
|ルール|CPU用自動選択|Mode捨て札回収だけ人間用処理へ差し替え済み|

CPU AIがオンライン相手を自動操作しているわけではありません。問題は主に命名、固定文言、部分的な視点変換です。

## 画像調査

### 全体

- `assets/images/` 全体: 73枚、すべてPNG、合計約179.21MiB（187,912,719 bytes）
- 対戦プリロード対象: 56枚、すべてPNG、合計141.93MiB
- 対戦プリロード画像のRGBA展開相当: 約335.99MiB
- 公開版の対戦中ページで実際に観測: 58画像
- 58画像の内訳: プリロード56枚とキャラクターアイコン2枚
- プリロードは2枚ずつ `requestIdleCallback`、非対応時はタイマーで進めます。
- 画像の `decoding='async'` は指定しますが、`img.decode()` 完了は待ちません。
- 3.40MiBのカード裏1枚の取得例: 初回864.1ms、直後93.1ms。公開側Cache-Controlは `max-age=600` でした。

### グループ別

|用途|枚数|主なPixelサイズ|合計|最大1枚|
|---|---:|---:|---:|---:|
|カード裏|1|1024×1536|3.40MiB|3,481.8KB|
|材料カード|15|1024×1536前後|37.74MiB|3,314.2KB|
|イベント|9|1024×1536|24.57MiB|3,971.3KB|
|料理|20|1024×1536|47.30MiB|3,116.9KB|
|加工|3|1024×1536|7.54MiB|2,864.6KB|
|スキルカットイン|4|1536×1024|11.68MiB|3,672.5KB|
|Modeカットイン|4|1536×1024|9.69MiB|2,518.4KB|

### 対戦プリロード対象の全ファイル

すべてPNGです。

|相対パス|Pixel|容量KB|
|---|---:|---:|
|`assets/images/card-back.png`|1024×1536|3481.8|
|`assets/images/cards/banana.png`|1059×1484|2309.3|
|`assets/images/cards/beef.png`|1024×1536|2722.2|
|`assets/images/cards/cabbage.png`|1024×1536|2491.5|
|`assets/images/cards/carrot.png`|1024×1536|2472.4|
|`assets/images/cards/chicken.png`|1024×1536|3314.2|
|`assets/images/cards/curry.png`|1024×1536|2718.1|
|`assets/images/cards/daikon.png`|1024×1536|2607.6|
|`assets/images/cards/egg.png`|1024×1536|2515.8|
|`assets/images/cards/fish.png`|1024×1536|2467.8|
|`assets/images/cards/milk.png`|1024×1536|2333.9|
|`assets/images/cards/nori.png`|1024×1536|2569.4|
|`assets/images/cards/onion.png`|1024×1536|2647.4|
|`assets/images/cards/pork.png`|1024×1536|2475.5|
|`assets/images/cards/potato.png`|1024×1536|2477.8|
|`assets/images/cards/rice.png`|1062×1481|2526.7|
|`assets/images/events/bakugai.png`|1024×1536|2448.3|
|`assets/images/events/gomi-shushu-sha.png`|1024×1536|3971.3|
|`assets/images/events/kinkyu-chori.png`|1024×1536|2449.3|
|`assets/images/events/monomono-kokan.png`|1024×1536|3025.8|
|`assets/images/events/osouji.png`|1024×1536|2990.4|
|`assets/images/events/shokuzai-tansaku.png`|1024×1536|2524.5|
|`assets/images/events/sousaku-ryouri.png`|1024×1536|2402.7|
|`assets/images/events/yappa-yameta.png`|1024×1536|2752.1|
|`assets/images/events/yarinaoshi.png`|1024×1536|2598.0|
|`assets/images/packs/board-girl.png`|1024×1536|2518.2|
|`assets/images/packs/eco-bag-boy.png`|1024×1536|2864.6|
|`assets/images/packs/fridge-girl.png`|1024×1536|2339.9|
|`assets/images/recipes/bakudan-onigiri.png`|1024×1536|3116.9|
|`assets/images/recipes/banana-juice.png`|1024×1536|2454.7|
|`assets/images/recipes/buri-daikon.png`|1024×1536|2549.1|
|`assets/images/recipes/butabara-daikon.png`|1024×1536|2545.9|
|`assets/images/recipes/chahan.png`|1024×1536|2508.4|
|`assets/images/recipes/cream-stew.png`|1024×1536|2741.0|
|`assets/images/recipes/curry-rice.png`|1024×1536|2654.2|
|`assets/images/recipes/gorgeous-chahan.png`|1024×1536|2496.7|
|`assets/images/recipes/hamburg-steak.png`|1024×1536|2404.1|
|`assets/images/recipes/keema-curry.png`|1024×1536|2561.7|
|`assets/images/recipes/kinkyu-ryouri-special.png`|1024×1536|2074.6|
|`assets/images/recipes/manpuku-curry.png`|1024×1536|2873.7|
|`assets/images/recipes/nikujaga.png`|1024×1536|2399.8|
|`assets/images/recipes/omurice.png`|1024×1536|2416.8|
|`assets/images/recipes/onigiri.png`|1024×1536|392.5|
|`assets/images/recipes/roll-cabbage.png`|1024×1536|2546.2|
|`assets/images/recipes/sake-onigiri.png`|1024×1536|2508.0|
|`assets/images/recipes/sousaku-ryouri-special.png`|1024×1536|2129.4|
|`assets/images/recipes/tamago-kake-gohan.png`|1024×1536|2503.6|
|`assets/images/recipes/yasai-itame.png`|1024×1536|2562.4|
|`assets/images/skill-cutins/akatsuki-skill-cutin.png`|1536×1024|2784.9|
|`assets/images/skill-cutins/chizuru-skill-cutin.png`|1536×1024|2711.9|
|`assets/images/skill-cutins/mai-skill-cutin.png`|1536×1024|3672.5|
|`assets/images/skill-cutins/takumi-skill-cutin.png`|1536×1024|2788.2|
|`assets/images/battle-mode-cutins/akatsuki-battle-mode-cutin.png`|1536×1024|2403.4|
|`assets/images/battle-mode-cutins/chizuru-battle-mode-cutin.png`|1536×1024|2518.4|
|`assets/images/battle-mode-cutins/mai-battle-mode-cutin.png`|1536×1024|2487.1|
|`assets/images/battle-mode-cutins/takumi-battle-mode-cutin.png`|1536×1024|2508.7|

## キャッシュ後のボトルネック

- HTTPキャッシュが効けば転送量は減ります。
- PNGは表示前にRGBAへ展開されます。56枚で約336MiB相当のため、スマホではデコード済み画像がメモリから追い出される可能性があります。
- カード表示はPCで68×92px、スマホで56×78pxですが、元画像は約1024×1536pxです。
- キャラクターHUDはPCで96×96px、スマホで64×64pxですが、元画像は1536×1024pxです。
- `createImageCard()` はDOMを再作成してCSS `background-image` を設定します。セクション署名で不要な再生成を抑えていますが、内容変更時はカードDOMを作り直します。
- `decoding='async'` はヒントであり、デコード完了保証ではありません。現在は `decode()` 完了後に表示する制御がありません。
- したがって、キャッシュ済みでもデコード、GPU転送、縮小描画が一時的な負荷になる可能性があります。

## 推奨画像サイズ・容量

|用途|推奨Pixel|推奨形式|目標容量/枚|
|---|---:|---|---:|
|対戦カード|256×384|WebP|30〜100KB|
|カード裏|256×384|WebP|30〜80KB|
|HUDキャラスプライト|最大768×512|透過WebP、必要なら最適化PNG|100〜300KB|
|料理・イベント拡大演出|512×768|WebP|80〜200KB|
|スキル/Modeカットイン|最大1280×720または1024×683|WebP|150〜400KB|
|ギャラリー高画質|1024×1536まで|高品質WebP|200〜600KB|

推奨運用:

- `assets/images/battle/` に軽量版、`assets/images/gallery/` に高画質版を分離します。
- 初期プリロードはカード裏、選択キャラ、初期手札で必要な画像だけにします。
- 料理、イベント、加工、カットインは使用直前またはアイドル時に段階読込します。
- ギャラリー画像はギャラリーを開くまで読み込みません。
- デコードが必要な演出は `Image.decode()` 完了後に表示します。
- ファイル名へ内容ハッシュを付け、長期キャッシュ可能な運用を検討します。

## 改善優先順位

1. 毎操作のREST再取得回数を減らし、Broadcastを通知経路として追加する。
2. ゲーム結果に影響しない確認パネルをローカルUIにし、確定操作だけ送信する。
3. 対戦画像を軽量WebPへ分離し、全56枚プリロードを廃止する。
4. 描画ViewModelを `me/opponent` に統一し、CPU固定文言とCPU設定をオンライン時に隠す。
5. 上記後も遅延が問題なら、共通Supabaseを東京へ移す影響と手順を別途検討する。

## 修正対象候補

- `network.js`: Broadcast、sync回数、計測点、楽観UI/確定UIの分離
- `battle-protocol.js`: `host/guest` から `me/opponent` への明示的ViewModel
- `battle-engine-worker.js`: HOSTメモリcheckpointと確定結果通知
- `supabase/battle-online.sql`: Broadcast RLS、必要なら統合RPC
- `web.html`: CPU固定見出し
- `mobile/mobile.html`: CPU固定見出し
- `render.js`: opponent表記、CPU設定の表示制御、画像読込・デコード
- `mobile/render-sp.js`: スマホ側の同等修正
- `player.js`: CPU固定ログ文言
- `main.js`, `mobile/main-sp.js`: モード別ラベルと演出視点
- `assets/images/`: 対戦用軽量画像とギャラリー用画像の分離

## 計測上の制約・未確認事項

- 実機スマホでの純粋なDOM描画時間と画像デコード時間
- Postgres Changes単独のWebSocket到達時間
- 東京リージョンへ同じ構成を置いた場合の比較値
- Web対スマホ、スマホ対スマホでの同条件反復測定
- 長時間対戦後のメモリ使用量とデコード済み画像の破棄頻度
