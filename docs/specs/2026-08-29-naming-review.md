# 表と列の名前を、中身に合う名前に直す

作った日: 2026-08-29

## なぜ作るか

名前と中身が食い違っている場所がいくつもある。

- `matches.outcome`（結果）に**勝敗が入っていない**。入っているのは棄権・不戦勝かどうかだけ
- `entries.can_input`（入力できる）は、**何を**入力できるのか名前から分からない。しかも**どこからも使われていない**
- `players.number` `teams.number` は、何の番号か名前から分からない
- 同じ「部」を、データベースは `division`、画面は `class` と呼んでいる
- 同じ「対戦」を、データベースは `team_match`、画面は `card`、書類は「対戦」と呼んでいる
- `operators` という表は 2026-08-21 に消したのに、`requireOperator()` という関数名だけ残っている

**いま直すのが一番安い。** 本番の `matches` `game_scores` `stages` `matchups` は 0 件、
`players` `participants` は 6 件。画面がデータベースを読んでいるのは 5 か所だけで、
残りはテストと見本データ。データがそろってからでは、直す前に当日が来る。

## やること

名前を直すだけ。**機能は 1 つも変わらない。** ただし `can_input` は列ごと消す（下記）。

### 表の名前（3 つ）

| 今 | 変更後 | なぜ |
| --- | --- | --- |
| `entries` | `participants` | 「申し込み」ではなく「その大会でのその人」だから |
| `team_matches` | `matchups` | `matches` と似すぎていて親子に見えない。画面の「カード」とも統一する |
| `games` | `game_scores` | 1 行が持つのは 1 ゲームぶんの**得点**。画面の `gamesWon`（勝ち試合数）と紛れる |

### 列の名前（20）

| 表 | 今 | 変更後 |
| --- | --- | --- |
| `divisions` | `display_order` | `sort_order` |
| `teams` | `number` | `team_number` |
| `teams` | `display_order` | `sort_order` |
| `players` | `number` | `player_number` |
| `stages` | `kind` | `format` |
| `stages` | `display_order` | `sort_order` |
| `matchups` | `label` | `round_name` |
| `matchups` | `team_a_id` | `side_a_team_id` |
| `matchups` | `team_b_id` | `side_b_team_id` |
| `matchups` | `slot_a_label` | `side_a_slot_label` |
| `matchups` | `slot_b_label` | `side_b_slot_label` |
| `matchups` | `display_order` | `sort_order` |
| `matches` | `team_match_id` | `matchup_id` |
| `matches` | `order_in_team_match` | `order_in_matchup` |
| `matches` | `outcome` | `ending` |
| `match_players` | `entry_id` | `participant_id` |
| `match_players` | `player_order` | `order_in_pair` |
| `game_scores` | `score_a` | `side_a_score` |
| `game_scores` | `score_b` | `side_b_score` |
| `write_logs` | `detail` | `action_detail` |

### 消す列（1）

`entries.can_input`。理由は「決めたこと」に書く。

### 足す表と列（別セッションの計画から取り込み）

`~/.claude/plans/ticklish-squishing-coral.md`（得点入力のバックエンド）が
新しい表と列を必要としている。**名前をこちらで決めると書いてあった**ので、
決めたうえでこの段で作る。中身の設計はあちらの計画のまま。

| | 決めた名前 | 中身 |
| --- | --- | --- |
| 表 | `match_settings` | 段 × 部ごとの決めごと。大会ごとに 6〜9 行 |
| 列 | `match_settings.max_game_count` | 最大何ゲームやるか |
| 列 | `matches.max_game_count` | 上をコピーした値。既定は 3 |

`match_rules` ではなく `match_settings` にした。`game_count` ではなく
`max_game_count` にしたのは、**3 ゲームの試合が 2 ゲームで終わることがある**ため。
「やったゲーム数」ではなく上限だと名前で分かるようにした。

### 値の書き方（4）

`matches.ending` の値を A/B から side_a/side_b に揃える。

```
normal / retired_side_a / retired_side_b / walkover_side_a / walkover_side_b
```

`match_players.side` の値は `'a'` / `'b'` のまま（列名が `side` なので重ねない）。

### 画面側の言葉をそろえる

| 今 | 変更後 |
| --- | --- |
| `ClassLabel` / `class-chip.tsx` / `--color-class-1〜6` | `DivisionLabel` / `division-chip.tsx` / `--color-division-1〜6` |
| `LeagueCard` / `CardMatch` / `CardStatus` / `card-detail-sheet.tsx` / `onSelectCard` / `findCard` | `matchup` 系に |
| `roundLabel` | `roundName` |
| `gamesWonA` / `gamesWonB`（`bracket/sample-data.ts`。実体は**勝ち試合数**） | `matchesWonA` / `matchesWonB` |
| `requireOperator()` / 変数 `operator` | `requirePlayer()` / 変数 `player` |
| `canInput`（Cookie・セッション） | 消す |

`src/ui/me/sample-data.ts` の `gamesWon`（本当にゲーム数）はそのまま。

### 書類

バックアップの見出し（`src/config/backup.ts`）で `stages` を「段（予選・決勝）」と
呼んでいるのをやめ、「予選リーグ・決勝トーナメント」にする。

## やらないこと

- **機能の追加・変更。** 画面の見た目も動きも 1 つも変えない
- **`match_players` の表名を変えること。** `participant_id` を指すことになるが、
  この表が表すのは「その試合に出た人」なので `players` のほうが読める
- **`game_number` を並び順の名前に寄せること。** 「第 2 ゲーム」と画面に出す**番号**であって、
  並べるための重みではない
- **`competitions` `matches.status` `match_players.side` などの直し。** 中身とよく合っている
- **過去の仕様書の書き換え。** `docs/specs/` は決めた当時の記録なので触らない。
  ただし本書で取り消した宿題は「残した宿題」に明記する
- **得点入力の API そのもの。** `match_settings` と `max_game_count` は作るが、
  `save-score` / `finish-match` / `reopen-match` は別セッションの計画の担当
- **`match_settings` から `matches` への値のコピー。** CSV 取り込みの段でやる
- **本番への反映。** `npm run db:push` は人の判断で行う（`docs/database.md`）

## 進め方（提案）

1 本の PR にすると 40 ファイルを超えるので、2 本に分けることを提案する。

| | 中身 | 本番に流すか |
| --- | --- | --- |
| 1 本目 | データベース（SQL・seed・型・テスト）と、それを読むサーバー側 5 か所 | **流す** |
| 2 本目 | 画面の言葉（`class` → `division`、`card` → `matchup`、`roundLabel` → `roundName`） | 流さない |

1 本目だけでアプリは通しで動く。2 本目は見本データの型名の付け替えなので、
本番のデータには一切触れない。

## 受け入れ基準

動作確認担当が 1 件ずつ ○× で判定する。

- [ ] `npm run db:reset` がエラーなく通り、`seed.sql` の 1 大会分が入る
- [ ] `npm run db:types` で `src/types/database.ts` が再生成され、`npm run check` が通る
- [ ] `npm test` が全部緑
- [ ] `npm run test:e2e` が全部緑
- [ ] 「やること」の表 3 つが、新しい名前で存在する（`entries` `team_matches` `games` は存在しない）
- [ ] 「やること」の列 20 個が、新しい名前で存在する（古い名前は 1 つも存在しない）
- [ ] `participants` に `can_input` 列が存在しない
- [ ] `matches.ending` に `retired_side_a` を入れられ、`retired_a` は入れられない
- [ ] `match_settings` に同じ「段 × 部」を 2 つ作れない
- [ ] `match_settings.max_game_count` と `matches.max_game_count` に 0 や負の数を入れられない
- [ ] 新しい試合の `max_game_count` は 3 から始まる
- [ ] 12 表すべて、anon で読める
- [ ] 12 表すべて、anon で追加・書き換え・削除ができない（**実際に値が変わらないこと**で確認）
- [ ] `game_scores` と `matches` が Realtime の配信対象に入っている
      （`games` を rename しても配信対象から外れていないこと）
- [ ] 入場画面が今までどおり動く（参加者の一覧が部ごとに出て、合言葉を入れると入場できる）
- [ ] `/api/backup` が 12 表ぶんを書き出す（表の名前が変わっても落ちない）
- [ ] コード全体に `requireOperator` `can_input` `canInput` が 1 つも残っていない
- [ ] 1 本目のあと `git grep -n "team_match\|'entries'\|display_order\|can_input\|\.outcome"` が
      0 件（**過去のマイグレーションと過去の仕様書は除く**。どちらも当時の記録なので直さない）
- [ ] 2 本目のあと `git grep -n "ClassLabel\|LeagueCard\|roundLabel"` が 0 件（同上）

## 触るファイル

### 1 本目（データベースとサーバー）

| ファイル | 新規 / 変更 |
| --- | --- |
| `supabase/migrations/20260829000000_naming_review.sql` | 新規 |
| `supabase/migrations/20260829000100_match_settings.sql` | 新規 |
| `supabase/seed.sql` | 変更 |
| `src/types/database.ts` | 変更（`npm run db:types` で再生成。**手書きしない**） |
| `tests/schema.test.ts` | 変更 |
| `tests/rls.test.ts` | 変更 |
| `src/config/backup.ts` | 変更（表の名前と見出し） |
| `src/app/enter/page.tsx` | 変更 |
| `src/app/api/session/route.ts` | 変更 |
| `src/server/route-helpers.ts` | 変更（`requirePlayer` / `action_detail`） |
| `src/server/route-helpers.test.ts` | 変更 |
| `src/server/session.ts` | 変更（`canInput` を消す） |
| `src/server/session.test.ts` | 変更 |
| `src/ui/enter/entry-gate.tsx` | 変更（`canInput` を消す） |
| `src/ui/enter/entry-gate.test.tsx` | 変更 |
| `src/db/admin.ts` | 変更（説明文） |
| `src/app/api/backup/route.ts` | 変更（説明文） |
| `src/app/(app)/layout.tsx` | 変更（説明文） |
| `e2e/require-enter.spec.ts` | 変更（説明文） |
| `AGENTS.md` | 変更（「破ってはいけない 3 つ」の手順） |
| `docs/database.md` | 変更 |
| `README.md` | 変更（書き込み API の見本） |
| `.claude/agents/implementer.md` / `reviewer.md` | 変更 |
| `src/usecases/README.md` | 変更 |

### 2 本目（画面）

| ファイル | 新規 / 変更 |
| --- | --- |
| `src/ui/components/class-chip.tsx` → `division-chip.tsx` | 名前変更 |
| `src/app/globals.css` | 変更（`--color-class-*` → `--color-division-*`） |
| `src/ui/bracket/*`（8 ファイル） | 変更 |
| `src/ui/courts/*`（4 ファイル） | 変更 |
| `src/ui/matches/*`（8 ファイル） | 変更 |
| `src/ui/me/*`（3 ファイル） | 変更 |
| `src/app/(app)/bracket/page.tsx` | 変更 |

## 決めたこと

ヒアリングで決まったこと。**なぜそうしたかを残す。**

### A と B の書き方 — `side_a` / `side_b` にする

最初の案は `left` / `right` だった。分かりやすいから。**やめた。**

- バドミントンは**1 ゲームごとにコートを入れ替える**（第 3 ゲームは 11 点でも入れ替え）。
  「左のペアが棄権した」は、どの時点の左か決まらない
- 星取表は同じ対戦を 2 つのマスに出している（`league-matrix.tsx` の `findMatchup`）。
  片方では行、もう片方では列。**画面の位置とデータの左右は最初から一致していない**
- いま得点入力画面は A を左に出しているが、「自分のペアを左に出す」に変えた瞬間に嘘になる

`first` / `second` も考えたが、`score_first` が「第 1 ゲームの得点」に読める。
`1` / `2` は、チーム番号が 1〜4 あるので「チーム 1 の得点」に読める。

**2 つの側は完全に対等で、意味のある言葉が存在しない。** 差がないものに差のある言葉を
付けると必ずどこかで外れる。だから記号（a / b）が正解。ただし「A が何の A か」が
どこにも書いていなかったので、`side` を頭に付けて「これは側の名前だ」と分かるようにした。

A が何を指すかの**定義は 1 か所**。`matchups.side_a_team_id` のチームが A。
コートの左右とも画面の左右とも関係ない。

### `can_input` を消す

得点を入力できないのは**観戦者だけ**で、観戦者は `participants` に行を持たない
（Cookie の `role` が `viewer`。`api/session/route.ts`）。参加者は `can_input` に関係なく
**全員が合言葉を聞かれる**。そして `can_input` は**どこからも判定に使われていない**
（`requireOperator()` に確認を足す宿題が残ったままだった）。

つまりすでに「今回の大会の参加者 = 得点を入れられる人」で動いている。列を残すと、
使われないまま「これは何のためにあるのか」を毎回考えることになる。

**引き換えに失うもの:** 当日「この人には触らせたくない」という絞り込みができなくなる。
合言葉を知っている参加者は全員、他人の試合の点も書き換えられる。ただし誰が書いたかは
`write_logs` に残るので、あとから追える。この取引を承知のうえで消す。

### 並び順の名前 — 役割で書き分ける

**画面に出すだけの順は短く、大会の中身に関わる順は `order_in_**` で詳しく。**

- `sort_order` … 部・チーム・段・対戦を画面に並べるだけの重み（飛び番 10, 20, 30）
- `order_in_matchup` `order_in_court` `order_in_pair` … 大会の中身としての順番
- `game_number` … 順番ではなく「第 2 ゲーム」と画面に出す**番号**なので、この規則の外

`order` という列名にしたかったが、**`order` は SQL の予約語**で使えない
（`create table t (order int)` は構文エラー。手元で確認済み）。引用符で囲めば作れるが、
以後すべての SQL で `"order"` と書き続けることになり、書き忘れ 1 回で落ちる。

### `matchups.round_name` は「対戦の名前」ではない

`seed.sql` を見ると、予選の 2 つの対戦がどちらも「予選 1回戦」を持つ。
つまり対戦を見分ける名前ではなく、**どの回戦に属するか**。
`name` にすると「対戦ごとに違う名前」に読めてしまうので `round_name` にした。

### `can_input` を消すほうを取った（別セッションの計画と食い違った）

得点入力のバックエンドの計画は `can_input` を使う前提で、`requireScorer()` を
足して「得点を入れてよい人か」を確かめると書いてあった。

**こちらを取った。** 入力できないのは観戦者だけで、観戦者は `participants` に
行を持たない。`requireScorer()` は要らず、`requirePlayer()` だけで足りる。

あちらの計画から消えるもの:
- 受け入れ基準「`can_input` が false の人が得点を送ると 403 が返る」
- `src/server/route-helpers.ts` への `requireScorer()` の追加

### `payload` は使わない

`write_logs.detail` の案に `payload` を挙げたが取り下げた。AGENTS.md が
「使わない言葉」に挙げている専門用語だから。`action_detail` にして、隣の `action` との
つながりが見えるようにした。

### 「部」はデータベース側に寄せる

画面の `class` をやめて `division` にした。逆向き（データベースを `classes` にする）は
やらない。`class` は JavaScript の予約語で、CSS のクラスとも紛れる。実際に
`class-chip.tsx` は `const CLASS_TEXT_CLASS` という、1 行に 2 つの意味の CLASS が
並ぶ書き方になっていた。

### 「対戦」は `matchup` にする

データベース（`team_match`）・画面（`card`）・書類（対戦）で 3 通りあった。
`card` は英語だと「イエローカード」「紙のカード」に読まれる。`team_matches` は
`matches` と似すぎていて親子に見えない。両方の弱点が無い `matchup` に統一した。

### `stages` を「段」と呼ぶのをやめる

このプロジェクトでは「段 1」「段 2」が**開発の順番**を指す言葉として定着している
（AGENTS.md、`docs/specs/` 全体）。同じ「段」を大会の予選・決勝にも使うと混ざる。
表名 `stages` はそのままで、日本語の呼び方だけ「予選リーグ・決勝トーナメント」にする。

### `requireOperator()` を放置しない

`operators` 表は 2026-08-21 に消したのに、関数名と変数名だけ残っていた。
もう存在しないものの名前をコードの入口に置き続けると、新しく参加する人が
「operator という表があるはず」と探すことになる。

## 残した宿題

- **取り消す宿題:** `docs/specs/2026-08-23-enter-screen.md:74` と
  `docs/specs/2026-08-23-viewer-entrance.md:70` の「`requireOperator()` に `can_input` の
  確認を足すこと」は、`can_input` を消すので不要になった。**もうやらない**
- **得点入力の API**（`save-score` / `finish-match` / `reopen-match`）。
  表と列はこの段でそろえたので、あとは入口を作るだけ
- `match_settings` から `matches.max_game_count` へのコピー（CSV 取り込みの段）
- 画面 4 つ（進行表・結果 LIVE・対戦表・マイページ）を本物のデータにつなぐ。
  本書はそのときに使う言葉をそろえておくためのもの
- **5 チーム以上になるとチーム色が足りない**（`globals.css` に `--color-team-1〜4` しか無い）
