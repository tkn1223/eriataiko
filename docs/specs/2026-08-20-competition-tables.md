# 大会データの表を作る（段1）

作った日: 2026-08-20

## なぜ作るか

画面は 4 つできているのに、**中身は全部サンプルの固定値**（`src/ui/*/sample-data.ts`）。
いま何を入力しても消える。データベースには `operators` と `write_logs` しか無く、
**大会のデータを入れる場所が 1 つも無い。**

先に表を作り切る。本番のデータベースは巻き戻せない（無料プランにバックアップは無い。
`docs/database.md`）ので、画面をつなぎながら少しずつ表を足すと、作り直しが当日に近づくほど危ない。

## やること

`supabase/migrations/20260820000000_competition_tables.sql` に、次の 10 表を作る。
既存のマイグレーションは編集しない。

```
competitions  大会 ──┬── divisions   部（名前と並び順だけ）
                     ├── teams       チーム
                     ├── entries     参加（players × competitions）
                     └── stages      予選リーグ / 決勝トーナメント
                           └── team_matches  対戦（チームA 対 チームB。空枠も持てる）
                                 └── matches      試合（部・コート・順番・状態・何点先取）
                                       ├── match_players  出場者（片側 2 人）
                                       └── games          ゲームごとの得点

players  人（大会をまたぐ。番号で見分ける）── entries から参照
```

| 表 | 主な列 |
| --- | --- |
| `competitions` | `name` `held_on` `is_current` |
| `divisions` | `competition_id` `name` `display_order` |
| `teams` | `competition_id` `number` `name` `display_order` |
| `players` | `number`(一意) `name` |
| `entries` | `competition_id` `player_id` `team_id`(null可) `division_id`(null可) `can_input` |
| `stages` | `competition_id` `name` `kind`('league'/'knockout') `display_order` |
| `team_matches` | `stage_id` `label` `team_a_id`(null可) `team_b_id`(null可) `slot_a_label` `slot_b_label` `display_order` |
| `matches` | `team_match_id` `division_id` `order_in_team_match` `court_number` `order_in_court` `status` `outcome` `points_to_win` `games_to_win` `started_at` `finished_at` |
| `match_players` | `match_id` `side`('a'/'b') `entry_id` `player_order`(1 か 2)。`position` は SQL の予約語と紛れるので避けた |
| `games` | `match_id` `game_number` `score_a` `score_b` `updated_at` |

- `status` は `waiting` / `live` / `done`
- `outcome` は `normal` / `retired_a` / `retired_b` / `walkover_a` / `walkover_b`
- 権限はベースライン（`20260811000000_baseline.sql`）の型どおり。10 表とも公開読み取り可、
  `insert` / `update` / `delete` のポリシーは**書かない**
- `matches` と `games` を Realtime の配信対象に足す
- `supabase/seed.sql` に開発用の 1 大会分（4チーム・3部・予選と決勝の枠・数試合。**全部ダブルス**）

## やらないこと

- **画面のつなぎこみ。** `src/ui/*/sample-data.ts` は 1 文字も触らない
- **`operators` の削除。** 入場画面がまだ参照している。段2 で入場画面を `entries` に
  切り替えるときに、`write_logs` の参照ごと付け替えて消す。
  それまで**名簿が 2 つある状態**になる（`operators` は本番で空のまま）
- スプレッドシートからの取り込み
- 組み合わせを自動で作る機能（**今後も作らない方針**。流し込んだデータをそのまま出す）
- 順位・勝敗の計算、21点／デュースの判定
- 得点入力の保存 API
- 本番への反映（`npm run db:push` は段2 の直前）

## 受け入れ基準

- [ ] `npm run db:reset` がエラーなく通り、`seed.sql` の 1 大会分が入る
- [ ] `npm run db:types` で `src/types/database.ts` が再生成され、`npm run check` が通る
- [ ] 10 表すべて、anon で読める
- [ ] 10 表すべて、anon で追加・書き換え・削除ができない（**実際に値が変わらないこと**で確認）
- [ ] 同じ大会に同じ人を 2 回参加登録できない
- [ ] 人の番号は重複できない
- [ ] 対戦は、チームが未定でも「予選1位」の空枠として保存できる
- [ ] 対戦で、チームも空枠ラベルも両方空にはできない
- [ ] 1 つの試合の片側に 2 人（ダブルス）を入れられる。同じ位置に 2 人目は入れられない
- [ ] 同じ 2 人を複数の試合に入れられる（決勝でペア固定の形が表せる）
- [ ] 試合ごとに別の 2 人を入れられる（予選でペアばらばらの形が表せる）
- [ ] 同じ大会の中で、予選の試合と決勝の試合に別々の「何点先取」を入れられる
- [ ] 棄権・不戦勝を試合に記録できる
- [ ] `matches` と `games` が Realtime の配信対象に入っている
- [ ] `docs/database.md` を読めば、表の関係と番号の運用が分かる

## 触るファイル

| ファイル | 新規 / 変更 |
| --- | --- |
| `supabase/migrations/20260820000000_competition_tables.sql` | 新規 |
| `tests/schema.test.ts` | 新規 |
| `src/types/database.ts` | 変更（`npm run db:types` で再生成。**手書きしない**） |
| `supabase/seed.sql` | 変更 |
| `tests/rls.test.ts` | 変更 |
| `docs/database.md` | 変更 |

## 決めたこと

ヒアリングで決まったこと。**なぜそうしたかを残す。**

| | 決定 | なぜ |
| --- | --- | --- |
| 大会 | 毎年ためる | 通算成績を見たい |
| 種目 | **ダブルス大会**。シングルスは当面無い | 実態がそう |
| ペア | **試合ごとに持つ。ペアの表は作らない** | 予選はばらばら、決勝は固定、と大会ごとに違う。試合ごとに出場者を持てば**どちらも同じ形で表せる**。ペアの表にすると固定でない予選を表現できず狭くなる |
| 人 | 一生に 1 行。**運営がふる番号**で見分ける | ニックネームなので同名がいる。名前では人を特定できない |
| 名簿 | 選手と入力係を**一本**に。`players` に入力係も入る | 選手兼運営が二重に載るのを避ける。`operators` は本番で空なので今なら安く変えられる |
| 何ゲーム・何点 | **試合に焼き付ける**（既定 15 点） | 部でもステージでも変わる。後からルールを変えても**終わった試合の解釈が壊れない** |
| 勝者 | **列を作らない。** 得点と `outcome` から計算 | 保存すると必ず食い違う（順位表を保存しないのと同じ理由） |
| `team_matches` | 残す | 予選だけなら出場者から計算できるので不要。**決勝を事前に作ると決めたから**要る。準決勝を作る時点では出場者が 1 人も決まっておらず逆算できない。さらに `docs/specs/2026-08-17-bracket.md` が「予選中も『予選1位』の薄字で決勝の形を出す」と決めており、その文字の置き場所が要る |
| 片側 2 人 | **データベースでは強制しない** | 行を 1 つずつ入れるので「2 人そろうまでは違反」になってしまう。取り込みと API 側で確かめる。将来シングルスが出ても 1 行入れれば済む |
| 得点の保存 | 「＋1」を押すたび | 観戦者にすぐ反映するため。見積り 5 時間で約 3,240 回・1 人 1.2MB・無料枠の 16% |
| 入場 | 今回の参加者だけを一覧に。選ぶだけ。**入力係のときだけ合言葉**。別に観戦者用の入口 | 100 人に合言葉を配る手間を避けつつ、書き込みは絞る |

⚠ **サンプルデータは実態と違う。** `src/ui/matches/sample-data.ts` に `players: ['中村']` という
シングルスの試合があり、マイページも「シングルス」と出し分けている。以前の作業が見本として
入れたもので、実際の大会はダブルスのみ。**段2 で直す**（この段では触らない）。

## 残した宿題

- 段2: 入場画面を `entries` に切り替え、`operators` を消す。観戦者用の入口を作る
- 段2: 画面のサンプルデータをダブルス前提に直す
- 別の段: スプレッドシートからの取り込み
- 別の段: 順位・勝敗の計算、21点／デュースの判定
- **5 チーム以上になるとチーム色が足りない**（`globals.css` に `--color-team-1..4` しか無い）
