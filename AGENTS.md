# Battle a la carte - Codex 作業ガイド

## このプロジェクト

- 料理の材料カードを集め、料理を作って得点を競うブラウザ向け対戦カードゲームです。
- 公式ホームページ、PC向けWeb版、スマホ版、CPU対戦、ストーリーチュートリアル、Supabase通信対戦を含みます。
- Unityプロジェクトではありません。HTML/CSS/JavaScriptで構成された静的サイトです。
- `battle-a-la-carte-2/` は追加ルールを試作した別バージョンです。依頼がない限り本編へ混ぜません。

## 作業開始時に読むもの

1. `AGENTS.md`（このファイル）
2. `docs/CURRENT_STATE.md`（現在の実装・問題・次の作業）
3. 今回の依頼に必要な場合だけ `docs/PROJECT_SPEC.md`（正式仕様）
4. 構成や依存関係を変更する場合だけ `docs/ARCHITECTURE.md`
5. 過去の変更理由が必要な場合だけ `docs/CHANGELOG.md` と `UPDATE_LOG.txt`

依頼と無関係なファイルやプロジェクト全体を、毎回再解析しないでください。

## 主要ドキュメント

- 正式仕様: `docs/PROJECT_SPEC.md`
- 現在状態: `docs/CURRENT_STATE.md`
- 変更履歴: `docs/CHANGELOG.md`
- 技術構成: `docs/ARCHITECTURE.md`
- Supabase導入手順: `SUPABASE_ONLINE_SETUP.md`
- 共通基盤との統合方針: `ANIANI_INTEGRATION.md`
- 通信性能の変更前調査: `docs/ONLINE_PERFORMANCE_AUDIT.md`
- 高速化後の結果: `docs/ONLINE_PERFORMANCE_RESULTS.md`

次の5文書はソースコードと一緒にGit管理し、GitHubへ保存します。

- `AGENTS.md`
- `docs/PROJECT_SPEC.md`
- `docs/CURRENT_STATE.md`
- `docs/CHANGELOG.md`
- `docs/ARCHITECTURE.md`

`docs/ACTIVE_TASKS.md` は複数Codex作業の一時調整用です。原則ローカル専用とし、Gitへ追加しません。

## 重要な入口

- 公式ホームページ: `index.html`
- PC向けゲーム: `web.html`
- スマホ向けゲーム: `mobile/mobile.html`
- 共通ゲームデータ: `cards.js`, `state.js`, `rules.js`
- プレイヤー/CPU処理: `player.js`, `cpu.js`
- PC向け表示/起動: `render.js`, `audio.js`, `main.js`
- スマホ向け表示/起動: `mobile/*-sp.js`
- オンライン通信: `network.js`, `battle-protocol.js`, `battle-engine-worker.js`, `battle-chat.js`
- 描画モデル/性能計測: `battle-view-model.js`, `battle-metrics.js`
- 軽量対戦画像: `assets/battle-images/`, `battle-images.js`（原本は `assets/images/`）
- 公開用DB SQL: `supabase/`
- 自動テスト: `tests/`

## 禁止事項

- 既存のCPU対戦、ルール、料理、イベント、加工アイテム、演出、画像パスを依頼なしに変更・削除しないこと。
- 対戦画面のPC版とスマホ版のUIを、明示的な依頼なしに統一しないこと。
- 推測で仕様を追加・変更しないこと。不明点はコード・資料・履歴で確認し、判断不能なら「未確認」とすること。
- `service_role`、secret key、DBパスワードをブラウザ用ファイルへ置かないこと。
- 相手の手札、イベント、伏せカードの内容をオンライン表示用データへ含めないこと。
- ローカルコインを共通「あにあにコイン」として扱わないこと。現時点では別物です。
- Firebaseの旧実装を、現在使用中のSupabase実装と混同しないこと。
- `battle-a-la-carte-2/` の仕様を本編へ無断で移植しないこと。
- ユーザーの既存変更や画像を、依頼なく戻したり削除したりしないこと。
- APIキー、アクセストークン、パスワード、秘密鍵、Secret、その他の認証情報を文書やGitへ追加しないこと。
- PC固有のユーザー名、個人情報、ローカル環境の絶対パスを文書へ追加しないこと。
- ファイル参照は原則としてプロジェクトルートからの相対パスを使うこと。

## 実装ルール

- 必要以上の全面書き換えを避け、既存機能を壊さない小さな変更を優先します。
- Web版とスマホ版には重複ファイルがあります。共通ロジックを変更したら対応する `*-sp.js` との差分を確認します。
- 通信処理はゲームルールから分離し、既存ルールを `battle-engine-worker.js` から再利用します。
- オンライン戦では、自分のターンだけ操作できる制約と更新リビジョンを維持します。
- HTMLはファイル直開きではなくHTTPサーバー経由で確認します。WorkerやSupabase通信は `file://` で正しく動きません。
- 公開対象は静的ファイルです。実行時のビルド工程やnpm依存はありません。画像を再生成する開発作業だけSharpを使います。

## テスト方針

- 小規模修正では、変更箇所に関連するテストだけを実行します。
- 通信ロジック変更: `node --test tests/online.test.cjs tests/sql.test.cjs`
- HTML読込やブラウザ統合変更: `node --test tests/browser.test.cjs`
- 画像変更: `node --test tests/images.test.cjs`
- 実通信テスト: `tests/live-online.test.cjs`。`BALC_LIVE=1` の明示指定時だけ匿名の実部屋を作ります。
- UI変更は対象のPC版またはスマホ版をブラウザで目視確認します。
- 大規模更新、共通ルール変更、公開前だけフル回帰テストを行います。
- フル回帰ではCPU戦、Web対Web、Web対スマホ、スマホ対スマホ、切断・再接続を確認します。
- テストできなかった項目を成功扱いにせず、`docs/CURRENT_STATE.md` に未確認として残します。

## 作業完了時

1. 実装とドキュメントに矛盾がないか確認します。
2. `docs/CURRENT_STATE.md` を現在の状態へ更新します。
3. `docs/CHANGELOG.md` に実際の変更と日付を追記します。
4. 仕様を変更した場合だけ `docs/PROJECT_SPEC.md` を更新します。
5. 技術構成を変更した場合だけ `docs/ARCHITECTURE.md` を更新します。
6. 作業ルールや参照先を変更した場合だけ `AGENTS.md` を更新します。
7. 不要な大規模解析やフルテストを、文書更新だけのために繰り返しません。
8. 変更した文書だけを更新し、無関係な章を書き直しません。

## Gitと公開

- 公開リポジトリは `donadonaa24-cyber/battle-a-la-carte--`、主ブランチは `main` です。
- 上記5文書はソース変更のコミットに含め、GitHub上でも参照できる状態を保ちます。
- `docs/ACTIVE_TASKS.md` は `.gitignore` の対象です。
- 履歴改変や強制更新はしません。pushは依頼または合意済みの公開作業として行います。
- ローカルのチェックアウト場所は環境ごとに異なるため、文書へPC固有の絶対パスを書きません。
