# オンライン高速化の実装・測定結果

確認日: 2026-09-15

## 概要

- Supabaseを継続使用。使用リージョンはソウルのままです。Firebaseへの移行、ゲームルール変更、コイン報酬追加はありません。
- 変更前の詳細は `docs/ONLINE_PERFORMANCE_AUDIT.md`。変更対象をローカルZIPへバックアップしてから実装しました。バックアップは公開対象外です。
- 承認を受け、共通Supabaseへ `supabase/battle-broadcast.sql` を適用しました。データ削除、共通コイン・アカウント設定変更はありません。

## 通信構造の変更前後

変更前:

`入力 → 操作RPC保存 → Postgres Changes → REST再取得 → HOST Worker → commit RPC → Postgres Changes → REST再取得 → DOM描画`

変更後:

`入力 → 安全なローカルUI予測 → Private Broadcast → HOST Worker判定 → 宛先別Private Broadcast → 共通ViewModel → DOM描画`

- HOST自身の操作はローカルWorkerへ渡し、相手へ表示用Viewを送信します。
- GUESTの操作はHOSTへ送信します。相手であるHOSTへの反映は片道ですが、GUEST自身の最終判定結果はHOSTからの返送も必要です。
- 確認を開く/閉じる、選択、確定セット等は即時反映します。山札や非公開情報を伴う料理・イベント等の最終結果を勝手に予測しません。
- DBのcheckpoint/action履歴保存は別キューで非同期処理します。UIは保存完了を待ちません。保存中に届いた変更はまとめて次回保存します。
- 保存失敗は同じ保存要求から再送し、成功するまで復帰用情報を保持します。離脱・再戦時には未保存状態を確認します。
- Postgres Changesは部屋参加・終了等のライフサイクルに残しています。通常操作の表示更新にはREST再取得を使用しません。
- SQL未適用の別環境は従来経路へフォールバックし、従来方式である旨を表示します。

## Broadcast・セキュリティ

- `balc:<room>:user:<user>` のPrivate Channelを宛先別に作成します。
- RLSで部屋参加者のみ許可し、GUESTは自分の受信口だけ、HOSTは両者の受信口へアクセスします。部屋外のユーザーは拒否します。
- 操作送信者はChannelのユーザーIDと結び付け、payloadの自己申告IDを信用しません。
- request ID、revision、HOSTキューで重複・古い操作・多重処理を抑止します。
- GUESTへ送るViewには相手の非公開手札・伏せカードの中身を含めません。
- MVPのHOSTは既存ルール計算に必要な全体状態を保持します。改造HOSTへの不正防止、HOSTなしの試合継続は保証しません。本格公開ではルール判定・山札・勝敗検証をサーバー側へ移す必要があります。
- ブラウザへSecret/service_roleを追加していません。認証情報の新規コミットはありません。

## 実接続の遅延測定

実Supabase SDK、同じPCのEdge独立2コンテキスト、HTTP提供したWeb版とスマホ版（390×844）を使用しました。通信のモックではありません。

入力/確認解除を交互に実行し、`performance.timeOrigin + performance.now()` で入力から相手のDOM更新完了まで測定しています。同じPCなので端末間の時計差はありません。別端末での測定には時計差補正が必要です。ブラウザの実際の画面提示・ディスプレイ遅延は含みません。

| 条件 | 回数 | 平均 | 中央値 | 最小 | 最大 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 変更前・公開版 | 8 | 1,010ms | 1,029.5ms | 593ms | 1,440ms |
| 変更後・HOST入力からGUEST DOM | 40 | 93.25ms | 86.35ms | 84.80ms | 143.10ms |
| 変更後・GUEST入力からHOST DOM | 20 | 84.19ms | 84.15ms | 83.00ms | 85.60ms |

60回の加重平均は90.23ms、変更前比約91.1%短縮です。全60回の中央値は未集計です。確認系操作の比較であり、料理等すべての操作がこの値になるという保証ではありません。GUEST自身に返送される最終結果の往復時間も、この片道の比較値とは異なります。

HOST操作40回の地点別測定:

| 区間 | 平均 | 中央値 | 最小 | 最大 |
| --- | ---: | ---: | ---: | ---: |
| 入力 → ローカルUI更新 | 0.638ms | 0.500ms | 0.300ms | 3.100ms |
| ローカル更新 → 送信地点 | 0.003ms | 0ms | 0ms | 0.100ms |
| 送信地点 → HOST受理（HOST自身なので通信なし） | 0.020ms | 0ms | 0ms | 0.200ms |
| HOSTキュー待ち | 0.027ms | 0ms | 0ms | 0.200ms |
| HOST Worker判定 | 1.270ms | 0.600ms | 0.400ms | 8.900ms |
| HOST判定 → 相手受信（送信処理を含む） | 90.915ms | 84.700ms | 83.500ms | 129.900ms |
| 相手受信 → 状態反映 | 0.003ms | 0ms | 0ms | 0.100ms |
| 状態反映 → DOM更新 | 0.372ms | 0.300ms | 0.200ms | 1.000ms |

各区間の集計には計測地点間の細かな処理もあるため、区間平均の合計は全体平均と完全一致しません。通信が主な残余遅延で、DB完了待ちの直列通信は表示経路から除去できました。

`BattleMetrics.records()` / `BattleMetrics.summary()` で最新500操作まで確認できます。ローカルUI測定はDOM更新完了までで、画像デコード完了を含む全フレーム時間ではありません。

## HOST/GUESTのUI

- `battle-view-model.js` が保存・ルール用状態を `me/opponent` へ変換します。
- HOST/GUESTとも同じWebレンダラー、または同じスマホレンダラーを使用します。PCとスマホのレイアウト自体は統一していません。
- 得点、手札、セット、料理、キャラ、ターン、勝者は同じViewModel経由です。
- オンライン時のCPU手札/CPUセット/CPU料理等の見出しを相手表記へ変更し、CPU性格・速度・リセット項目を非表示にしました。オンラインログのCPU表記も相手へ置換します。
- 既存ルールの `player/cpu` と互換DOM IDは残しています。ルールを全面書き換えず、描画境界でのみ変換する設計です。CPU対戦ではCPU表記・設定を維持します。

## 画像

| 対象 | 原本PNG | 対戦用WebP |
| --- | ---: | ---: |
| 作成した65画像 | 163.11MiB | 3.57MiB |
| 旧プリロード56枚と同じ集合 | 141.93MiB | 2.98MiB |
| 同56枚のRGBA展開相当 | 335.99MiB | 39.34MiB |

- カード49枚は256×384、1枚25.6〜44.6KiB。合計約1.56MiBです。
- キャラクター表情シートは最大768×512、カットインは最大1024×683。透明部分を維持しています。
- 原本PNGは削除・加工せず、ギャラリーは原本パスへ戻して高画質表示します。
- 対戦画面とカットインはWebPを使用し、全56枚の開始時プリロードを廃止しました。手札・公開セット・カード裏等を優先し、キャラは選択されたものを読み込みます。
- Imageキャッシュはデコードを待って保持します。解像度縮小でデコード負担も下げていますが、全画像のGPUアップロードや実機スマホのフレーム時間は未計測です。
- 全65枚のPixelサイズ・容量・原本パスは `assets/battle-images/manifest.json` を参照してください。

実測の起動〜対戦開始までの画像取得量（メニュー・待機画面を含む）:

| 環境 | 画像取得数 | 画像レスポンス容量 | 原本PNG取得 |
| --- | ---: | ---: | ---: |
| Web版・PC幅 | 13 | 635,814 bytes（約621KiB） | 0 |
| スマホ版・スマホ幅 | 4 | 194,614 bytes（約190KiB） | 0 |

これは今回の選択キャラ・ランダム手札・待機時間の観測値で、固定上限ではありません。音声・SDK・HTML等は含みません。画像数はresource取得件数であり、ゲーム内の全画像数とは異なります。

## テスト

- `node --test tests/online.test.cjs tests/sql.test.cjs tests/browser.test.cjs tests/images.test.cjs`: 16件成功、0件失敗。
- `BALC_LIVE=1` を指定した `tests/live-online.test.cjs`: 実Supabaseで1件成功、0件失敗。通常のローカルテストでは外部サービスを書き換えないようスキップします。
- 実接続: 部屋作成/参加、キャラ/スキル選択、カードセット、料理、加工、スキル、ターン終了、勝敗、双方承認の再戦、タブを閉じたWebSocket切断、新タブで同じ部屋へ再開を確認しました。
- 回帰: 非公開情報、ターン制限、CPUルール/CPU進行、イベント、特殊勝利、SQL/RLS、checkpoint失敗後の再送、共通ViewModel、CPU設定の表示切替、ギャラリー原本、画像容量を確認しました。
- オンライン試験の一時部屋は終了処理しました。匿名ユーザーの削除やアカウント設定変更はしていません。
- Android/iPhone実機、Safari、長時間休止、物理断線、全イベントの実接続完走、ストーリー全話の手動完走、CPUセーブ/再開の全操作回帰は未確認です。

## 変更ファイル

- 通信: `network.js`, `battle-engine-worker.js`, `supabase/battle-broadcast.sql`
- 共通境界/計測/画像: `battle-view-model.js`, `battle-metrics.js`, `battle-images.js`
- 描画/起動: `render.js`, `main.js`, `mobile/render-sp.js`, `mobile/main-sp.js`
- HTML/CSS: `web.html`, `mobile/mobile.html`, `style.css`, `mobile/style-sp.css`, `online.css`
- 生成物/ツール: `assets/battle-images/`, `tools/build-battle-images.cjs`
- テスト: `tests/online.test.cjs`, `tests/sql.test.cjs`, `tests/browser.test.cjs`, `tests/images.test.cjs`, `tests/live-online.test.cjs`
- ドキュメント: `AGENTS.md`, 標準4文書, 本結果文書, `SUPABASE_ONLINE_SETUP.md`

`cards.js`, `state.js`, `rules.js`, `player.js`, `cpu.js` と原本PNGは変更していません。

## 公開・残る確認

- 静的ファイルと新しいWebPをGitHubの `main` へ反映します。通常公開のビルドは不要です。
- 既存公開設定のPages URLからWeb版/スマホ版を開き直してください。今回の変更ファイルはキャッシュ識別子を更新しました。
- 別PC/実機スマホで一方が部屋を作り、もう一方が合言葉で参加し、勝敗・再戦・切断復帰を確認してください。
- 保存は非同期なので障害時には未保存差分が生じ得ます。HOSTの復帰情報とDB checkpointへ依存し、HOST端末の喪失に対する移譲は未実装です。
- 物理断線・画面休止の相手検出にはPresence心拍待ちが残ります。ブラウザのオフライン模擬だけでは既存WebSocketが閉じない場合があります。
- 対戦履歴は既存action履歴として残します。再戦単位の独立した結果アーカイブやランキングは未実装です。
- 既知のMode BGM配置不一致は今回の通信/画像変更とは別件として残しています。
