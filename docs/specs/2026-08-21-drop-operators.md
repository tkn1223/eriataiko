# `operators` を消して、名簿を `players` / `entries` に一本化する

作った日: 2026-08-21

## なぜ作るか

名簿が 2 つある。`operators`（旧）と `players` / `entries`（新）。

同じ人が二重に載るし、`operators` には**同名を見分ける手段が無い**（ニックネームなので
「たろう」が複数いる）。段1 のヒアリングで**名簿を一本にする**と決めたのに、
古いほうが残っている。

**いま消すのが一番安い。** `operators` も `write_logs` も、手元・本番ともに **0 件**。
実際の運営者名を登録したあとだと、人が手で突き合わせる作業が発生する。

## やること

### 1. 入場画面の読み先を差し替える

**見た目は 1 ミリも変えない。** 出どころだけ変える。

| | いま | あと |
| --- | --- | --- |
| 一覧 | `operators` を全件 | `entries` のうち**「いまの大会」**の人（`competitions.is_current`） |
| 表示 | 名前だけ | 名前 ＋ **番号**（同名を見分けるため） |

**大会はユーザーに選ばせない。** `is_current` が true の 1 件をアプリが決める。

### 2. セッションの中身を変える

流れは変えない（大会共通の合言葉 → 一覧から自分を選ぶ → 署名付き httpOnly Cookie）。

| | いま | あと |
| --- | --- | --- |
| Cookie の中身 | `{ sub: operatorId, name }` | `{ sub: playerId, name, number, canInput }` |

**`canInput` は Cookie に焼き付ける。** 毎回データベースに問い合わせる案もあったが、
当日に入力権限を外す場面はまず起きないので、簡単なほうを選んだ。

### 3. `write_logs` の参照先を付け替える

```
operator_id   → player_id    （参照先を players に）
operator_name → player_name
```

### 4. バックアップの対象を差し替える

いまは `operators` と `write_logs` の 2 表だけ。**大会のデータが 1 つも入っていない。**
当日に書き出しても中身が空なので、新しい 10 表を対象にする。

## やらないこと

- **入場画面の見た目・操作**（別の PR で作り替える）
- **観戦者用の入口**（別の PR）
- **`can_input` の人にだけ合言葉を聞く**（今回は今までどおり**全員に聞く**）
- 進行表・対戦表・マイページとデータベースのつなぎ込み
- 本番への反映（`npm run db:push` は人が判断して実行）

## 受け入れ基準

- [ ] `operators` の表が無くなっている
- [ ] `npm run db:reset` と `npm run db:types` が通り、`npm run check` が緑
- [ ] 入場画面に「いまの大会」の参加者だけが出る（過去の大会だけの人は出ない）
- [ ] 一覧に**番号が出る**（同名の 2 人を見分けられる）
- [ ] 名前を選んで合言葉を入れると入場でき、`/api/session` が本人を返す
- [ ] 合言葉が違うと入場できない
- [ ] 名簿にいない id を送っても入場できない
- [ ] `write_logs` に `player_id` と `player_name` が残る
- [ ] `write_logs` は anon から読めない（今までどおり）
- [ ] バックアップの対象に**大会の 10 表**が入っている
- [ ] 入場画面の見た目が今までと変わっていない（画面テストが通る）

## 触るファイル

| ファイル | 新規 / 変更 |
| --- | --- |
| `supabase/migrations/20260821000000_drop_operators.sql` | 新規 |
| `src/app/enter/page.tsx` | 変更（読み先） |
| `src/ui/enter/entry-gate.tsx` | 変更（型と番号の表示） |
| `src/app/api/session/route.ts` | 変更（照合先） |
| `src/server/session.ts` | 変更（Cookie の中身） |
| `src/server/route-helpers.ts` | 変更（`write_logs` の列） |
| `src/config/backup.ts` | 変更（対象の表） |
| `src/types/database.ts` | `npm run db:types` で再生成 |
| `supabase/seed.sql` | 変更（`operators` への挿入を削除） |
| `tests/rls.test.ts` `tests/schema.test.ts` `src/usecases/build-snapshot.test.ts` | 変更 |
| `e2e/enter.spec.ts` | 変更（あれば） |

## 決めたこと

| | 決定 | なぜ |
| --- | --- | --- |
| 大会の選択 | **ユーザーに選ばせない** | `is_current` でアプリが決める。当日に選ばせるのは面倒なだけ |
| `can_input` | **Cookie に焼き付ける** | 毎回問い合わせるほど厳密なアプリではない |
| 失うデータ | **無い** | `operators` も `write_logs` も手元・本番とも 0 件であることを確認済み |
| 見た目 | **変えない** | 入場画面の作り替えは別の PR。同じファイルを二重に触らないため |

## 残した宿題

- 入場画面の作り替え（観戦者用の入口、参加者だけの一覧、`can_input` で合言葉を出し分け）
- 本番へ `npm run db:push`
