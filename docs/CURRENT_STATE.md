# 現在の開発状態

更新日: 2026-09-14

## バージョン

- 正式なセマンティックバージョン: 未定義
- GitHub公開用ブランチ: `main`
- 確認した最新公開コミット: `ef9bc44` (`Refresh Realtime auth before joining private rooms`)
- HTMLのキャッシュ識別子はファイルごとに異なり、製品バージョンではありません。

## 技術状態

- Unityバージョン: 該当なし。このフォルダはUnityプロジェクトではありません。
- 実装: HTML/CSS/Vanilla JavaScriptの静的サイト
- 外部SDK: Supabase JavaScript SDK 2.57.4（ESM CDN読込）
- 公開: GitHub Pages
- Git管理: GitHubリポジトリの `main`。標準5文書もソースと一緒に管理
- 一時作業調整: `docs/ACTIVE_TASKS.md` は `.gitignore` 対象

## 実装済み

- 公式ホームページからPC版とスマホ版へ個別に移動
- PC向けWeb UIとスマホ向け専用UI
- CPU対戦、10点勝利、2種の特殊勝利
- 材料、イベント、料理、加工アイテム、6スキル
- 4キャラクター、表情、スキル/Modeカットイン
- Battle a la carte Mode
- 全3話のストーリーチュートリアル
- ローカルプロフィール、戦績、ローカルコイン、背景交換
- CPU戦の途中オートセーブと再開
- 対戦中のブラウザ戻る操作に対する放棄確認
- Supabase合言葉オンライン対戦
- 登録不要の匿名ゲスト対戦と任意の共通アカウントログイン
- ランダム先攻、相手非公開情報のマスク、ターン操作制限
- 定型チャット、5秒クールダウン、切断表示、再接続

## 作業途中・未実装

- 共通「あにあにコイン」への移行とクラウド財布連携
- 通信対戦のコイン/カード/ランキング報酬
- ガチャ、ナンバー付きコレクション、ゲーム解放、デイリー要素
- HOSTに依存しないサーバー権威型対戦
- HOST離脱時の別端末へのHOST移譲
- Unity版、Android/iOSネイティブ版

## 既知の不具合・制約

- 公開用Gitでは `battle-mode.mp3` がルートにあり、コードは `assets/audio/battle-mode.mp3` を参照します。GitHub Pages上でMode BGMが404になる配置不一致が残っています。
- オンライン対戦の正規状態計算はHOSTブラウザに依存します。MVPの非公開表示は実装済みですが、改造HOSTへの完全な不正防止ではありません。
- オンライン中のローカルオートセーブは無効です。再開はSupabase上の有効な部屋とHOST接続に依存します。
- Web版とスマホ版には重複コードがあり、片側だけ変更すると差分が生じる可能性があります。
- `firebase-*`, `friend-battle-firebase.js`, `firestore.rules` は旧方式の残存ファイルで、現在のHTMLからは読み込まれていません。
- 設定全体の永続化は未確認です。
- Chrome、Safari、Firefox、実機スマホ全組み合わせの最新回帰結果は未確認です。

## 外部サービス

- Supabase: `aniani-common` 接続情報を `supabase-config.js` に設定済み。
- Supabase SQL: 初期対戦SQLと匿名/チャット追加SQLは適用済みとして動作確認済み。
- Anonymous Sign-Ins: 有効化済みとして匿名2クライアント試験に成功。
- CAPTCHA/ボット対策: 未確認。
- Firebase: 現在未使用。設定手順と旧コードのみ残存。
- Unity MCP: このプロジェクトでは未設定・未使用。
- 認証情報: 新規文書には値を記載していません。既存のブラウザ用Supabase Publishable keyは公開クライアント設定としてコードに存在しますが、Secretではありません。

## 通過しているテスト

最終確認日: 2026-09-14

- `node --test tests/online.test.cjs tests/sql.test.cjs`: 12件成功
- `node --test tests/browser.test.cjs`: 1件成功
- 公開URLで匿名ゲスト2クライアントが同じ部屋へ参加し、ランダム先攻で対戦開始: 成功
- 同じ部屋で定型チャット「こんにちは！」のRealtime受信: 成功
- Realtime Private Channel参加前の認証更新: 成功

## 次に行うべき作業

1. `battle-mode.mp3` を公開用の `assets/audio/` へ合わせ、Mode BGMの404を修正する。
2. PC実機とスマホ実機で、1試合を勝敗まで通すオンライン回帰試験を行う。
3. Web対スマホ、スマホ対スマホでイベント、加工、スキル、特殊勝利、切断復帰を確認する。
4. 共通コイン連携を始める前に、サーバー側の勝敗検証と重複報酬防止方式を決める。
5. 使用していないFirebaseファイルの削除可否を、履歴・移行用途を確認して決める。

## 最後に正常動作を確認した状態

- GitHub Pages公開版でPCブラウザ2コンテキストを使用。
- 両者ともメール登録なしの匿名ユーザー。
- HOSTが部屋を作成し、GUESTが6桁コードで参加。
- HOST/GUEST表示、先攻/後攻、ターン表示、Realtime接続、定型チャットを確認。
- 1試合を全ルールで最後まで完走する実機テストは未確認です。
