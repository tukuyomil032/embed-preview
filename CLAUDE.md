# embed-preview

DiscordメッセージURLを貼ると、対象メッセージのプレビュー埋め込みをリプライするBotのDiscord.js (TypeScript/Bun) 実装。

## コントリビュート規約

このプロジェクトへの変更（PR作成含む）を行う際は、[CONTRIBUTING.md](./CONTRIBUTING.md) を必ず読み、そこに書かれているブランチ命名・コミット規約・コーディング規約・PR説明フォーマット（Problem/Solution/Scope/Validation）に従うこと。

## 技術スタック

- Runtime: Bun / TypeScript strict
- Discord.js v14
- 画像合成: sharp（2x2グリッド）
- テスト: Vitest (`tests/`)
- Lint: oxlint / Fmt: oxfmt

## 動作仕様

1. ボットへのメンションが行頭にある + Discord URLが含まれる → プレビュー返信
2. `/preview <url>` スラッシュコマンドでもメンション不要で利用可能
3. 画像1枚: embedのimage、2〜4枚: sharpで2x2グリッド合成、動画: リンクフィールド

## NGコード例

```ts
// NG: ボット自身のメッセージに応答（無限ループ）
if (message.author.bot) {
  /* 必ず return すること */
}

// NG: メンションチェックなしにURLだけで反応
// messageCreateでは行頭メンションを必ず確認すること

// NG: try/catchでエラーを握りつぶす
// catch (err) { } // ← ダメ。必ず console.warn/error でログを残す

// NG: スレッドフォールバックなしのメッセージフェッチ
// channel.messages.fetch失敗時はactiveThreadsも検索すること
```

## コマンド（justfile）

```bash
just dev       # 開発起動（watch）
just start     # 本番起動
just test      # テスト実行
just lint      # Lint チェック
just fmt       # フォーマットチェック
just check     # fmt + lint + test 全チェック
just typecheck # TypeScript 型チェック
```
