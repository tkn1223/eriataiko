<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# えりあ太鼓 大会アプリ — 開発ルール

バドミントン大会の当日に 100 人程度が同時に使う Web アプリ。趣味で作り、仲間内で使う。
**エンジニア未経験の人も開発に参加する。**

機能をひとつ作るときは `/feature <やりたいこと>` を使う。仕様固め → 実装 → レビュー → 動作確認まで通る。

---

## 人に話しかけるときのルール

**相手はエンジニアではない。** 質問も報告も、次を守る。

- **1 問ずつ聞く。** まとめて 3 問投げない
- **選択式にする。** `AskUserQuestion` を使い、おすすめを先頭に置く
- **短く。** 前置きは 2 行まで。表や箇条書きを並べ立てない
- **専門用語を使わない**
  - ✗ RLS / ポリシー / スキーマ / マイグレーション / ペイロード / ハイドレーション
  - ○ 「他の人に書き換えられないようにする設定」「表のつくり」「データの受け渡し」
- どうしても用語が要るときは、**一度だけ 1 行で言い換えを添える**

報告するときも同じ。**できたこと・できなかったこと・次にやることの 3 つ**を短く。

## 勝手に決めない

仕様に無いことを聞かれたら、推測で埋めない。「仕様に無いので判断できない」と言って止まる。
間違ったものを作り込むより、止まるほうが安い。

デザイン・ライブラリ・構成を独断で変えない。必要だと思ったら**提案して承認を待つ**。

---

## 破ってはいけない 3 つ

### 1. 書き込みは必ず Route Handler 経由

ブラウザの Supabase クライアント（`src/db/client.ts`）で
`insert` / `update` / `delete` を呼ばない。設計違反であり、そもそも弾かれる。

書き込みは `src/app/api/**/route.ts` に作り、必ずこの順で書く:

```ts
const operator = await requireOperator();          // 1. 誰か確認（未入場は 401）
const body = await parseBody(request, schema);     // 2. zod で入力検証
// 3. getSupabaseAdminClient() で書き込み
await logWrite(operator, 'なにをしたか', body);     // 4. 記録を残す
// 5. catch で toErrorResponse(error)
```

### 2. `getSupabaseAdminClient()` は Route Handler の中だけ

この鍵はすべての制限を無視する。Server Component から呼ぶと、公開ページに
秘密のデータを載せてしまう。画面表示のための読み取りは `createSupabaseServerClient()` を使う。

### 3. 新規テーブルは「読める設定」だけ書く

```sql
alter table public.foo enable row level security;
grant select on public.foo to anon, authenticated;
grant all    on public.foo to service_role;

create policy foo_public_read on public.foo
  for select to anon, authenticated using (true);
-- insert / update / delete のポリシーは書かない
```

`for all` や `with check (true)` を書くと**誰でも書けるようになる**。書かない。
`grant` を省くと、ローカルでは動くのに本番で `permission denied` になる（実際になった）。

テーブルを足したら `tests/rls.test.ts` にテストも足す。

詳しくは `docs/security.md`。

---

## テスト

**先にテストを書く。** 受け入れ基準をそのままテストの名前にする。
赤（失敗）を一度見てから実装する。赤を見ずに書いたテストは、壊れていても通ることがある。

| 書くもの | 置く場所 | 動く場所 |
| --- | --- | --- |
| ロジック・API・DB | `src/**/*.test.ts` `tests/**/*.test.ts` | node |
| 画面の部品 | `src/**/*.test.tsx`（部品の隣） | jsdom |
| ページ全体・画面の崩れ | `e2e/*.spec.ts` | 実ブラウザ |

`page.tsx` のような async な Server Component は Vitest では動かせない。そこは `e2e/` に書く。

```bash
npm run db:start                       # 先にこれ（DB を使うテストに必要）
npm test                               # 全部
npm run test:related src/domain/standings.ts    # 直したファイルの周りだけ
npm run test:e2e                       # 画面
```

**画面幅を確かめるときは必ず Playwright を使う。**
`chrome --headless --window-size=390` は当てにならない（実際には 500px で描画され、
崩れていないものを「崩れている」と誤報告した実例がある）。見た目で判断せず数値を測る。

**CI の「日本語フォントを入れる」手順を消さないこと。** 幅の測定は字形で変わる。
消すと日本語が別の字形で描かれ、テストは緑のまま**測定だけが嘘になる**
（実際に消したら、はみ出すはずの星取表がぴったり収まって 1 件落ちた）。

## コードの書き方

- 名前が中身を表していること（`data` `tmp` `flag` は避ける）
- コメントは**なぜそうしたか**を書く。何をしているかはコードを読めば分かる
- 同じ処理を 3 か所コピーしたらまとめる
- 一覧を読むクエリには `.limit()` を付ける（付け忘れると通信量の枠を食い潰す）
- エラーは必ず日本語で画面に出す。黙って失敗させない
- 秘密の値に `NEXT_PUBLIC_` を付けない

## UI

- Konsta UI（`konsta/react`）を第一選択。`Page` / `Navbar` / `List` / `Block` / `Button` で組む
- Konsta の部品はクライアント側だけ。**Server Component から import するとビルドが落ちる**。
  `'use client'` を付けた部品を挟む（`src/ui/app-shell.tsx` が例）
- 対戦表のような Konsta に無い画面は Tailwind で個別に作る
- テーマ色は `src/app/globals.css` の `--color-brand-primary` 1 箇所。
  ここを変えると背景やボタンの色まで連動して変わる
- ダークモードは使わない。体育館の照明下ではライト固定のほうが読みやすい

## 当日運用の前提

- 体育館の電波は細い。Web フォントや大きな画像を足さない
- 片手・汗ばんだ指で押される。タップ領域は大きく
- 得点表示は `.tabular` で桁を揃える

## ブランチと公開

### 手を動かす前に必ずやる 2 つ

**コードを 1 行でも書く前に、この 2 つを済ませる。** 直したくなった時点ではなく、始める前。

```bash
git switch develop && git pull   # 1. 最新にする
git switch -c feature/<名前>      # 2. 枝を切る
```

1. **`develop` の最新を取ってから始める。** 取らないと、他の人が直したものを
   知らないまま古いコードの上に書くことになる。あとで衝突するか、
   直したはずのバグを書き戻す
2. **必ず枝を切る。** `develop` や `main` の上で直接書き始めない。
   途中でやめられなくなり、テストが赤いまま共有の枝に残る

**この 2 つは `/feature` を使わないときも同じ。** 文言の直し、ちょっとしたバグ、
ドキュメントだけの変更でも変わらない。「小さいから」で飛ばさない。

作業の途中で `develop` が進むこともある。長引いたら `git pull` して
`git rebase origin/develop` で追いつく（使い捨ての枝なので rebase してよい）。

### そのほか

- **枝は `develop` から切る。PR の宛先も `develop`。** `main` は本番なので直接触らない
- **マージしても公開されない。** テストだけ走る
- 公開は Actions の「公開する」を人が押したときだけ。**勝手に公開しない**
- 出し忘れは `npm run release:status` で見る（コミットの並びではなく**中身**を見る）
- 公開の前に「そのコミットのテストが緑か」を見る。赤い／未実行なら止まる
- `本番` は `main` からしか選べない
- スキーマ変更は自動反映されない。**先に `npm run db:push`、あとからコード**

### マージのしかたを間違えないこと

| どれを | どうマージするか |
| --- | --- |
| `feature/*` → `develop` | `gh pr merge --rebase --delete-branch` |
| **`develop` → `main`** | **`gh pr merge --merge`（rebase を使わない）** |

`develop` と `main` は**ずっと生き続ける 2 本**です。ここを rebase でマージすると、
同じ内容が別コミットとして作り直され、**2 本の履歴が永久に分かれます。**
すると次回以降の `develop` → `main` の PR に、マージ済みのコミットが毎回並びます。

実際にやってしまい、`main` を `develop` に取り込んで合流させる作業が必要になりました。

使い捨ての `feature/*` は rebase で問題ありません。

詳しくは `docs/deploy.md`。

## データベース

- 本番は 1 つだけ。**確認用のサイトも同じデータベースを触る**（無料プランなので）
- 本番を白紙に戻すのは `npx supabase db reset --linked`。**戻す手段は無い**（無料プランにバックアップは無い）
- そのコマンドは危険なので `package.json` に入れていない。ショートカットを作らないこと
- **大会当日と前日は `--linked` を打たない**

詳しくは `docs/database.md`。

## 当日バックアップ

大会当日だけ、GitHub Actions が 15 分おきに `/api/backup` を叩いて全データを
Google スプレッドシートへ書き出す（`src/app/api/backup/route.ts`）。
Supabase には書き込まない（読むだけ）ので、上の「書き込みは `requireOperator()` から」は
当てはまらない。代わりに秘密のヘッダー（`x-backup-secret`）で守っている。
準備の手順は `docs/backup.md`。

## スキーマ変更の手順

1. `supabase/migrations/<日付時刻>_<名前>.sql` を追加（既存ファイルは編集しない）
2. `npm run db:reset`（ローカルに反映）
3. `npm run db:types`（`src/types/database.ts` を再生成。手書きしない）
4. `tests/rls.test.ts` にテストを足す
5. 本番へは `npm run db:push`

## コマンド

```bash
npm run dev        # 開発サーバー（ホスト）
docker compose up  # 開発サーバー（Docker）
npm run db:start   # ローカル DB
npm test           # テスト
npm run test:e2e   # 画面テスト
npm run check      # 型・lint・整形（コミット前に必ず）

npm run release:status  # main に出し忘れが無いか
```
