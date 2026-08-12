# エリア対抗バド大会 運営アプリ

バドミントン大会の対戦・得点をリアルタイムに共有する Web アプリ。**現在は土台のみ**（画面はこれから）。

## 機能をひとつ作るとき

```
/feature スコア入力画面を作って
```

これだけでよい。仕様の深掘り → 承認 → 実装 → レビュー → 動作確認 → PR まで通る。
途中で必ず「この内容で進める？」と聞かれるので、そこで違ったら直させる。

細かい仕組みは `.claude/commands/feature.md`、開発の決まりは `AGENTS.md`、
セキュリティの考え方は `docs/security.md`。

| 層 | 採用技術 |
| --- | --- |
| フレームワーク | Next.js 16（App Router）+ TypeScript |
| UI | Konsta UI 5 + Tailwind CSS v4 |
| テスト | Vitest（ロジック）+ Playwright（画面） |
| DB / Realtime | Supabase（Postgres + Realtime） |
| ホスティング | Vercel（東京リージョン `hnd1`） |

---

## セットアップ

### 1. 起動（Docker）

Node のバージョン差を気にせず動かせるほうを推奨。

```bash
docker compose up     # http://localhost:3000
docker compose down
```

`node_modules` と `.next` はコンテナ側の volume に置いてある。ホストの
`node_modules`（macOS 用バイナリ）で上書きされないようにするため。

そのため **依存を追加したら volume を作り直す**必要がある（`--build` だけでは
古い volume が残って新しいパッケージが見えない）:

```bash
docker compose down -v && docker compose up -d --build
```

コンテナ内でコマンドを叩きたいとき:

```bash
docker compose exec web npm run check
```

本番相当のイメージを確認したいとき（http://localhost:3001）:

```bash
docker compose --profile prod up prod --build
```

### 1'. 起動（ホスト直）

**Node 22 が必須**（テストの Vitest が Node 20.12 以上を要求する）。
`.node-version` / `.nvmrc` で 22 に固定してあるので、nodenv や nvm を使っていれば
このディレクトリに入るだけで切り替わる。

```bash
node -v     # v22 系であることを確認
npm install
npm run dev
```

### 1''. テストを動かす準備

```bash
npm run db:start                  # ローカル Supabase（初回はイメージ DL で数分）
npm test                          # ロジック・API・DB
npx playwright install chromium   # 初回だけ
npm run test:e2e                  # 画面
```

DB を止めるときは `npm run db:stop`。鍵がずれてテストが落ちたら `npm run test:env`。

### 2. Supabase プロジェクトを作る

1. [supabase.com](https://supabase.com) で新規プロジェクトを作成（リージョンは **Northeast Asia (Tokyo)**）
2. Project Settings > API から URL とキーを控える
3. `.env.local` に貼る（`.env.example` を参照）

```bash
cp .env.example .env.local   # 初回のみ。SESSION_SECRET は生成済み
```

`SESSION_SECRET` を作り直したいときは:

```bash
openssl rand -base64 32
```

### 3. スキーマを流し込む

```bash
npx supabase login
npm run db:link          # プロジェクト参照 ID を聞かれる
npm run db:push          # supabase/migrations/*.sql を適用
```

運営者のサンプルを入れる場合（Dashboard の SQL Editor に `supabase/seed.sql` を貼っても可）:

```bash
psql "$SUPABASE_DB_URL" -f supabase/seed.sql
```

スキーマを変えたら型を再生成する:

```bash
npm run db:types         # src/types/database.ts を上書き
```

### 4. 起動

```bash
npm run dev              # http://localhost:3000
```

---

## セキュリティモデル（重要）

このアプリには **ID / パスワードのログインがない**。代わりに次の形で守る。

### 読み書きの経路を分ける

```
読み取り（観戦者含む全員）
  ブラウザ ──anon key──> Supabase        ← Realtime 購読もこの経路
                                            RLS: SELECT のみ許可

書き込み（得点入力など）
  ブラウザ ──fetch──> Next.js /api/** ──service_role──> Supabase
                       ↑ ここで「誰か」を検証        RLS: 素通り（サーバー専用）
```

anon key はブラウザに配られるので **誰でも入手できる**。だから anon には
`INSERT / UPDATE / DELETE` を一切与えない。鍵が漏れても、公開前提のデータが
読めるだけで、書き換え・全件抜き取り・削除はできない。

### 「誰が書いたか」の担保

1. 大会共通の**合言葉 1 つ**（`TOURNAMENT_PASSCODE`）を入力
2. `operators` テーブルの一覧から自分を選ぶ
3. サーバーが合言葉と運営者の実在を確認し、**署名付き httpOnly Cookie** を発行

Cookie は `SESSION_SECRET` で署名（HS256）されているので、ブラウザ側で中身を
書き換えて別人になりすますことはできない。個人ごとのパスワードは不要。

すべての書き込みは `write_logs` に `operator_name` 付きで残る。

### 新しいテーブルを足すときの決まり

```sql
alter table public.new_table enable row level security;

-- 公開してよいものだけ SELECT を許す
create policy new_table_public_read
  on public.new_table for select to anon, authenticated using (true);

-- insert / update / delete ポリシーは書かない ← これが書き込み禁止の実体
```

Realtime で配信したいときは追加で:

```sql
alter publication supabase_realtime add table public.new_table;
```

RLS が有効でないテーブルが混ざっていないかの点検（SQL Editor で実行）:

```sql
select relname, relrowsecurity
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by relrowsecurity, relname;
```

`relrowsecurity = false` の行があったら即対応する。

---

## 書き込み API の書き方

`src/server/route-helpers.ts` の部品を使う。**この形から外れない**こと。

```ts
// src/app/api/scores/route.ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { logWrite, parseBody, requireOperator, toErrorResponse } from '@/server/route-helpers';
import { getSupabaseAdminClient } from '@/db/admin';

export async function POST(request: Request) {
  try {
    const operator = await requireOperator();               // 未入場なら 401
    const body = await parseBody(
      request,
      z.object({ matchId: z.uuid(), scoreA: z.number().int().min(0), scoreB: z.number().int().min(0) })
    );

    const { error } = await getSupabaseAdminClient()
      .from('scores')
      .upsert({ match_id: body.matchId, score_a: body.scoreA, score_b: body.scoreB });
    if (error) throw error;

    await logWrite(operator, 'score.update', body);          // 監査ログ
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
```

読み取りは Route Handler を通さず、ブラウザから直接 Supabase を叩く
（`getSupabaseBrowserClient()`）。そのほうが Realtime がそのまま使えて速い。

---

## ディレクトリ

層で分けている。**「見た目は ui/、計算は domain/、DB は db/」**の 3 つを覚えれば迷わない。

```
src/
  app/          URL と画面の対応（Next.js の決まり。ここは動かせない）
    (app)/      タブ付きの画面。layout.tsx がヘッダーとタブを描く
      page.tsx  → /courts に飛ばすだけ
      courts/   現在        standings/ 順位表     bracket/ 対戦表
      matches/  全試合      me/        myページ
    api/        書き込みの入口。受け取って usecases を呼ぶだけの薄い層
    enter/      入場画面（タブなし）
  ui/           見た目だけ。データを取らない・書かない
    providers.tsx  app-shell.tsx  tab-nav.tsx   全画面共通の外枠
    components/    2 つ以上の画面で使う部品
    courts/ standings/ ...   画面ごとの部品（app/(app)/ と同じ名前）
  domain/       大会そのもののルール。外を何も知らない（README あり）
  usecases/     1 操作 = 1 関数。テストの主戦場（README あり）
  db/           Supabase を触る唯一の場所
    client.ts   ブラウザ用（読み取り + Realtime）
    server.ts   サーバー用（SSR の読み取り）
    admin.ts    service_role（書き込み専用・サーバーのみ）
  server/       サーバー専用の裏方
    session.ts        入場（署名付き Cookie）
    route-helpers.ts  書き込み API の共通部品
  config/       環境変数、タブ一覧、大会名
  types/        DB の自動生成型

supabase/       表のつくり（スキーマ）。書き込みのコードは入っていない
  migrations/   seed.sql
tests/          DB の約束を確かめるテスト
e2e/            画面全体のテスト
.claude/        開発ハーネス（/feature とサブエージェント）
docs/           specs/ 仕様   security.md セキュリティ方針
```

`ui/` のフォルダ名は `app/(app)/` と URL に 1 対 1 で対応させる。例外は作らない。

---

## 公開の流れ

**テストは自動。公開は手動。** マージしても公開されません。

```
feature/なにか
   │  PR を作る ──► テストが自動で走る（約5分）
   ▼
develop ──────────► テスト（公開はしない）
   │  PR を作る
   ▼
main ─────────────► テスト（公開はしない）


公開したいとき ──► Actions の「公開する」を押すだけ
                     main から押せば本番、それ以外なら確認用
```

覚えることは 3 つ。

- **作業は `develop` から枝を切って `develop` に戻す**
- **本番に出す前に `develop` → `main` の PR を作る**
- **公開はボタンを押したときだけ起きる**

### 公開のしかた

1. GitHub の `Actions` タブ → 左の一覧から **`公開する`**
2. `Run workflow` を押す
3. `Use workflow from` が **`main`** になっていることを確かめる（既定で `main`）
4. `Run workflow` を押す

**選ぶものはありません。** 出す先は枝で決まります。

| `Use workflow from` | 出る先 |
| --- | --- |
| `main` | **本番** |
| それ以外（`develop` など） | 確認用 |

押すと最初に「そのコミットのテストが緑か」を数秒で確かめます。赤い・まだ走っていない場合は
公開せずに止まります。テストを走らせ直しはしません（マージのときに走っているので）。
**この確認を飛ばす手段はありません。**

`main` は本番なので、ここに直接コミットしないこと。

自動で確かめているのは、型・lint・整形 → テスト → DB の権限テスト → スマホ幅で
画面が崩れていないか（実ブラウザ）。

**Vercel の自動デプロイは切ってあります**（`vercel.json` の `git.deploymentEnabled`）。
そのままだとテストが落ちていても公開されてしまうためです。戻さないこと。

初回の準備（Vercel プロジェクト作成・環境変数・GitHub Secrets）は **`docs/deploy.md`**。

リージョンは `vercel.json` で `hnd1`（東京）に固定済み。Supabase も Tokyo にすると往復が短い。

### スキーマ（表のつくり）を変えたとき

コードの公開と DB の変更は別です。**先に DB、あとからコード**の順で。

```bash
npm run db:push
```

---

## 大会当日までの残タスク

- [x] Vercel プロジェクト作成 → GitHub Secrets を 3 つ登録（`docs/deploy.md`）
- [x] Supabase プロジェクト作成（東京）→ `.env.local` と Vercel に環境変数を設定
      ※ 本番で読み取り可・書き込み不可を実測済み
- [ ] `operators` に実際の運営者名を登録
- [x] `TOURNAMENT_PASSCODE` を決めて設定
- [x] GitHub Secrets（`SUPABASE_URL` / `SUPABASE_ANON_KEY`）を入れて keepalive を有効化
- [ ] 本番と確認用でデータベースを分けるか決める（いまは共有。`docs/database.md`）
- [x] 当日バックアップの準備（サービスアカウント・スプレッドシート共有・環境変数）
      ※ 手で押す経路は本番で実測済み。シートからの書き戻しは無く、壊れたら人が打ち直す
- [ ] **バックアップの定期実行リハーサル（最重要・未達）**
      2026-08-13 時点で **GitHub の定期実行が 1 回も発火していない**（リポジトリ作成当日
      だったためと思われる）。時間帯もタイムゾーンも外した `*/5 * * * *` で 30 分待って 0 回。
      設定の誤りではない（`docs/backup.md` に調査結果）。
      **大会前にもう一度試し、動かなければ別の手段に切り替えること。**
- [ ] Realtime 接続数の実測（観客込み 200 接続が無料枠の上限）
- [ ] 当日朝に Pro プラン（$25/月）へ一時アップグレードするか判断
