# 技術構成

最終確認日: 2026-09-15

## 全体構成

このプロジェクトはUnityではなく、ビルド工程を持たない静的Webアプリです。公式ホームページ、PC版、スマホ版が同じリポジトリに共存し、ゲームロジックはグローバル関数と `GameState` を介して連携します。

## Unity / Scene / Prefab / C#

- Unityバージョン: 該当なし
- Scene: なし
- Prefab: なし
- C#スクリプト: なし
- `Assets/`, `Packages/`, `ProjectSettings/` のUnity標準構成: なし
- インストール済みUnity本体や別Unityプロジェクトは、このWebプロジェクトの依存関係ではありません。

## 主要ページ

- `index.html`: 公式ホームページ。`home.css` を使用します。
- `web.html`: PC向けゲーム。ルートのCSS/JSを使用します。
- `mobile/mobile.html`: スマホ向けゲーム。`mobile/*-sp.js` と `mobile/style-sp.css` を使用します。
- `battle-a-la-carte-2/index.html`: 本編とは分離された追加ルール版です。

GitHub Pages上の想定URL:

- `/`: 公式ホームページ
- `/web.html`: PC向けWeb版
- `/mobile/mobile.html`: スマホ版
- `battle-a-la-carte-2/` は現在の公開用Gitチェックアウトに含まれておらず、GitHub Pagesでの公開は未確認です。

## 主要フォルダ

- `assets/images/`: 材料、イベント、キャラクター、背景、カットイン等の画像
- `assets/battle-images/`: 対戦用WebP65枚と容量・サイズのmanifest。原本PNGは変更しません。
- `tools/build-battle-images.cjs`: 開発時だけ使うSharp画像変換スクリプト
- `assets/audio/`: BGMと効果音
- `mobile/`: スマホ固有のHTML/CSS/JS
- `supabase/`: Supabase SQL
- `tests/`: Node標準テストランナーによるテスト
- `battle-a-la-carte-2/`: 本編を参照する別ルール版
- `docs/`: 継続開発用ドキュメント

## 本編モジュール

### ゲームデータと状態

- `cards.js`: 材料、イベント、加工アイテム定義と山札生成
- `state.js`: `GameState`、プレイヤー状態、設定、スキル、ドロー、購入、勝敗判定、初期化
- `rules.js`: 料理レシピ、料理成立/消費、Battle a la carte Mode

### 操作とAI

- `player.js`: 人間側のセット、料理、イベント、スキル、加工、手札整理、ターン終了
- `cpu.js`: CPUのターン進行、カード選択、料理、イベント、スキルの判断

### 表示と起動

- `render.js`: PC向けDOM描画、参照パネル、設定UI、画像事前読込
- `audio.js`: 4種類の通常BGM、状況別BGM、効果音
- `main.js`: 起動、メニュー、対戦セットアップ、UIイベント、オートセーブ、戻る対策、結果処理
- `profile.js`: ローカルプロフィール、戦績、コイン、最近の料理、背景交換
- `story-mode.js`: 3話のチュートリアル、進行、ローカルクリア状態

### スマホ版

- `mobile/cards-sp.js`, `state-sp.js`, `rules-sp.js`, `player-sp.js`, `cpu-sp.js`: 対応する本編共通ロジックの複製
- `mobile/render-sp.js`, `audio-sp.js`, `main-sp.js`: スマホUIに合わせた固有実装
- `mobile/style-sp.css`: スマホ向けフィールドレイアウト

2026-09-14確認時点で、カード・状態・ルール・プレイヤー・CPUのPC/スマホファイルは同一内容です。表示、音声、起動処理は異なります。

## オンライン対戦モジュール

- `supabase-config.js`: 公開可能なSupabase URLとPublishable key。秘密鍵は禁止です。
- `network.js`: 認証、匿名ログイン、部屋作成/参加、Realtime、Presence、再接続、操作送信、HOST同期
- `battle-protocol.js`: 許可操作、状態のHOST/GUEST変換、相手非公開情報のマスク、入力形式検証
- `battle-engine-worker.js`: HOST側で既存ゲームファイルを読み込み、初期状態作成と操作適用を行うWeb Worker
- `battle-chat.js`: 定型チャット表示、送信、5秒クールダウン、再送ID保持
- `online.css`: PC/スマホ共通のオンラインUI
- `battle-view-model.js`: 従来ルールの視点状態を描画用 `me/opponent` に変換。両renderで共通利用
- `battle-metrics.js`: `performance.now()` とtimeOriginで入力・描画等を記録。`BattleMetrics.records()` / `summary()` で取得
- `battle-images.js`: 対戦WebPとギャラリー原本PNGのパス変換

### 通信フロー

1. 共通アカウントのセッションがあれば利用し、なければ部屋操作時に匿名ログインします。
2. HOSTがRPCで部屋を作り、GUESTが6桁コードで参加します。
3. DBがランダムに `first_user` を決定します。
4. 両者は部屋専用Private Channelへ参加し、Presenceで接続状態を共有します。
5. 参加者別Private Channel `balc:<room>:user:<user>` を追加します。本人とHOSTだけがアクセス可能です。HOSTは操作要求の送信者をチャンネルの宛先IDから決め、payloadのuser値を信用しません。
6. 安全に予測可能なUIは即時表示。GUESTの操作要求は自分のチャンネルからBroadcastでHOSTへ送り、HOST自身の操作はローカルの同じ処理キューへ渡します。
7. HOSTがメモリ内snapshotをWorkerへ渡し、リビジョンを進めて自分のDOMへ即時適用。GUESTにはマスク済みGUEST ViewだけをBroadcastします。Broadcast ACK待ちは次操作をブロックしません。
8. `balc_save_checkpoint` はその後非同期でcheckpoint、2 View、room、処理済みaction履歴を保存します。保存中の新状態は最新へ集約し、失敗した保存は同じ内容で再送します。初回保存を飛ばしません。
9. HOSTは保存待ちのsnapshotとaction履歴をsessionStorageに保持し、再読込時はDBリビジョンと比較します。GUESTは自分のDB ViewとHOSTへのrequest-stateで復帰します。部屋専用PresenceとPostgres Changesは接続・ライフサイクルに利用します。
10. `balc_broadcast_capabilities` が利用できない旧DBでは従来通信へフォールバックします。

描画DOMの `player-*` / `cpu-*` IDは既存CSS・操作互換のため維持しています。状態参照は両renderとも `getBattleViewModel().me/opponent` です。既存ルール/Worker内部のplayer/cpuは変更していません。

### 非公開情報

- 山札は枚数だけの裏カードへ変換します。
- 相手の材料手札とイベントは、合計枚数分の裏カードへ変換します。
- 相手の通常セットは裏カードへ変換します。
- 食材トラップ等、ルール上公開されるセットだけは内容を維持します。
- この方式は一般クライアントからの覗き見を抑えますが、正規状態を持つ改造HOSTへの完全な対策ではありません。

## Supabase

### 使用中のテーブル

- `battle_rooms`: 部屋、参加者、状態、先攻、リビジョン、有効期限
- `battle_checkpoints`: HOSTが保持する正規スナップショット
- `battle_views`: 参加者別にマスク済みの表示状態
- `battle_match_actions`: 参加者からの操作要求
- `battle_chat_messages`: 定型チャット履歴
- private schema内の試行回数/チャットクールダウン管理テーブル

### セキュリティ

- RLSを有効化し、部屋参加者だけに必要なSELECTを許可します。
- 書込みは権限を絞ったRPC関数を経由します。
- RPCは `auth.uid()`、部屋参加、期限、ターン、リビジョン、リクエストID等を確認します。
- Realtimeは部屋IDを含むPrivate ChannelとRLSを使用します。
- ブラウザにはPublishable keyだけを置きます。

### SQL

- `supabase/battle-online.sql`: 初回導入用。既存オブジェクトがある環境での再実行は前提ではありません。
- `supabase/battle-guest-chat.sql`: 匿名ゲスト、ランダム先攻、定型チャットを追加する更新SQL。
- `supabase/battle-broadcast.sql`: 参加者別Broadcast RLS、非同期保存、同じ部屋での再戦。既存SQLの後に実行。再実行可能です。

## 旧Firebase構成

- `firebase-config.js`, `firebase-config.sample.js`, `friend-battle-firebase.js`, `firestore.rules`, `FIREBASE_SETUP.md` が残っています。
- 現在の `web.html` と `mobile/mobile.html` はこれらを読み込まず、Supabase方式を使用します。
- 移行資料として残っている可能性はありますが、今後必要かは未確認です。

## データ保存

### localStorage

- `battle-a-la-carte:user-profile:v1`: ユーザー情報、ローカルコイン、戦績、背景等
- `battle-a-la-carte:match-autosave:v1`: CPU戦の途中状態
- `battleAlaCarteStoryProgressV1`: ストーリークリア状態

### sessionStorage

- オンライン部屋ID、保留中の操作、保留中のチャットを保持します。
- タブ/セッション単位の再送・再接続補助であり、永続クラウドセーブではありません。

### Supabase

- オンライン部屋、対戦チェックポイント、参加者別表示、操作、チャットを保存します。
- 現在のローカルプロフィールやコインは同期しません。

## 主要依存関係

- Supabase JavaScript SDK 2.57.4: `https://esm.sh/@supabase/supabase-js@2.57.4`
- Web Worker: ブラウザ標準API
- Web Audio/HTMLAudio: ブラウザ標準API
- localStorage/sessionStorage: ブラウザ標準API
- Node.js: テスト実行/画像再生成時のみ使用
- Sharp: 軽量画像を再生成するときだけ必要。`BALC_SHARP_PATH` でパッケージ位置を指定できます。
- npm package / bundler / framework: なし

## ビルドと公開

- トランスパイル、バンドル、生成工程はありません。
- 通常の公開にビルドは不要です。画像原本を変更した場合だけ `node tools/build-battle-images.cjs` でWebPを再生成します。
- 静的ファイルをそのままGitHub Pagesへ公開します。
- 主ブランチは `main` です。
- `AGENTS.md` と `docs/PROJECT_SPEC.md`, `CURRENT_STATE.md`, `CHANGELOG.md`, `ARCHITECTURE.md` はGit管理対象です。
- `docs/ACTIVE_TASKS.md` は並行作業の一時ファイルで、原則としてGit管理対象外です。
- `.github/workflows` のPagesワークフローは確認できません。Pagesの公開元設定の詳細はGitHub側で未確認です。
- ローカル確認ではHTTPサーバーが必要です。Web Workerと通信機能は `file://` 直開きを前提にしません。

## 対応状況

- Windows: Webブラウザで動作。Edge系の公開版通信試験を実施済み。
- Android: スマホ向けWeb UIあり。最新の実機回帰は未確認。
- iOS: スマホ向けWeb UIあり。Safari実機回帰は未確認。
- macOS/Linux: Webブラウザで動く設計ですが、実機確認は未確認。
- Unity/Windowsネイティブ/Androidアプリ/iOSアプリ: 未対応。

## MCP利用状況

- ゲーム実行時にMCPは使用しません。
- このプロジェクト内にMCPパッケージ、MCP設定ファイル、Unity MCP連携はありません。
- 2026-09-14確認時点で、Codexから利用できるUnity専用MCPサーバーも設定されていません。

## テスト構成

- `tests/online.test.cjs`: プロトコル、状態マスク、Worker/ネットワーク関連の単体確認
- `tests/sql.test.cjs`: SQLのRLS、権限、RPC、Realtime構成の静的確認
- `tests/browser.test.cjs`: Web/スマホHTMLの読込とブラウザ統合確認
- `tests/images.test.cjs`: 原本維持、WebP容量・Pixel、描画モデル使用とgalleryパスを確認
- `tests/live-online.test.cjs`: `BALC_LIVE=1` の時だけ実Supabaseで匿名部屋、両方向60操作計測、勝敗・再戦・切断復帰を検証。認証情報は既存クライアント設定を実行時に利用し、結果へ出力しません。
- UIの視覚崩れ、音声、実ネットワーク、実機タッチ操作は自動テストだけでは保証しません。

## 変更時の注意点

- `state.js`, `rules.js`, `player.js`, `cpu.js`, `cards.js` はゲームルールの中心です。
- 共通ルール変更時は対応するスマホ版ファイルも同時に確認します。
- `battle-protocol.js` の許可操作を増やす場合、Worker内の関数公開とネットワーク検証も合わせて変更します。
- DB列/RPC/ポリシー変更はSQL、`network.js`、テスト、設定手順書を同時に更新します。
- 画像・音声パスはPC版、スマホ版、公開用チェックアウトで一致させます。
- 文書とコミットには認証情報やPC固有の絶対パスを含めず、プロジェクト相対パスを使います。
