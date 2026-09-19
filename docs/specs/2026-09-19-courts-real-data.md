# 結果LIVE（/courts）を本物のデータから読む（1-a）

作った日: 2026-09-19

## なぜ作るか

結果LIVE は今も見本の固定データ（`src/ui/courts/sample-data.ts`）を出している。当日いちばん見られる画面なのに、実際の試合も点数も出ていない。
`docs/roadmap.md` の最優先「1. 結果LIVE を本物の得点につなぐ」の最初の 1 本（1-a）。
**読むだけ。** 押しても保存しないのは今までどおりで、保存は次の 1-b でやる。

## 決めたこと（yosuke さん確認済み）

1. **コートは常に 8 面出す。** 試合の無いコートは「予定なし」
2. **「◯/◯ 試合消化」は、いまの段だけを数える。** 決勝の試合が 1 つでも始まったら（waiting 以外になったら）数える対象もラベルも「決勝トーナメント」に切り替わる
3. **観戦者には「＋」「−」を今回から出さない。** 「試合を終了する」も出さない。得点は見るだけ

## やること

`src/app/(app)/courts/page.tsx` が、開いたときに 1 回だけ DB を読み、今までと同じ画面部品に渡す。

- **大会**: `is_current` の 1 件（#53 の `findCurrentCompetitionId` を使う）
- **段のラベルと消化数**: 上の決定 2。消化 = その段の `done` の試合数 / その段の全試合数
- **コート 1〜8 ごとに**
  - 進行中: そのコートの `status = 'live'` の試合（2 つあれば `order_in_court` の若いほう）
    - 部のラベル（`divisions.sort_order` 順に 1部/2部/3部。#53 と同じ決め方を使い回す）
    - 回戦（`matchups.round_name`）、両側のペア名（`match_players` → 参加者 → 選手。`order_in_pair` 順）
    - チーム色（`matchups.side_x_team_id` → `teams.team_number`。1〜4 に収める）
    - 枠の数は `matches.max_game_count`、入っている得点は `game_scores`
  - 次: そのコートの `status = 'waiting'` で `order_in_court` がいちばん若い試合
  - 進行中が無く次があれば「呼出待ち」、どちらも無ければ「予定なし」（今の出し分けのまま）
  - 出場者がまだ決まっていない側は、対戦の空枠ラベル（「予選1位」など）を出す
- **「あなたの試合」**: 選手として入っている人が出る試合に印（観戦者は無し）
- **観戦者**: ＋・−・試合を終了する を出さず、各ゲームの得点を数字で見せる
- **つながらない／大会が無い**: myページ（#53）と同じ日本語の案内を出す
- 「入れた点はまだ保存されません」の帯は残す（1-b まで保存しないので）

## やらないこと

- 得点・試合終了の**保存**（1-b / 1-d）。押したときの動きは今までどおり画面の中だけ
- 他の人の得点を**その場で映す**こと（1-c）。自動で読み直さない
- 進行表・対戦表のデータ接続
- 「呼出待ち」から次の試合への自動繰り上げ
- 表のつくりの変更（`supabase/migrations/` は触らない）

## 受け入れ基準

- [ ] `/courts` に、手元のデータベースにある本物の試合（seed のコート 1: 2部 愛知南 対 愛知中央）が出る。見本の名前（佐々木・井上 など）は出ない
- [ ] コートのカードが常に 8 枚出る。試合の無いコートは「予定なし」
- [ ] 進行中のコートに LIVE・部・回戦・両ペアの名前・チーム色が出る
- [ ] 枠の数が `max_game_count` どおりで、保存済みの得点が枠に入っている
- [ ] 次の試合（部・ペア名）が出る。次が無ければ出ない。進行中が無く次があれば「呼出待ち」
- [ ] 「◯/◯ 試合消化」がいまの段の done 数 / 全試合数。決勝が始まるとラベルが「決勝トーナメント」になり、決勝の試合だけを数える
- [ ] 選手として入った人の試合に「あなたの試合」が出る。観戦者には出ない
- [ ] 観戦者には ＋・−・「試合を終了する」が出ず、得点は数字で見える
- [ ] 選手として入った人は、今までどおり ＋・− で数字が動き、試合終了の確認画面も今までどおり動く（保存はされない）
- [ ] 大会が無い／つながらないとき、日本語の案内が出る（黙って空にしない）
- [ ] 375px と 390px で横にはみ出さない。長い名前・枠 3 つの 2 桁得点でも崩れない（Playwright で実測）
- [ ] 一覧を読むクエリすべてに `.limit()` が付いている
- [ ] 画面を開いたときに読むだけで、自動では読み直さない
- [ ] `src/ui/courts/` の部品は `@/db` を import しない。`page.tsx` は `@/db/admin` を import しない
- [ ] `npm run check && npm test && npm run test:e2e` が緑

## つくりの方針（myページ #53 と同じ形）

- `src/db/courts.ts` … 表を読んで行を返すだけ（`createSupabaseServerClient()`）。読む回数は 5 回前後、すべて `.limit()`
- `src/usecases/build-courts-view.ts` … 行 → 画面の形（純粋な関数。テストが速い）
- `page.tsx` … `getSession()` → 読む → 組み立てる → `CourtsPage` に渡すだけ
- 画面部品の型は `src/ui/courts/types.ts` に移し、`sample-data.ts` は消す（jsdom のテストは自前の小さな値を持つ）
- 画面テスト（e2e）の多くは見本の 8 面の状態（3 ゲーム・同点・長い名前・呼出待ち…）に頼っている。**テスト用の試合を手元の DB に作って終わったら消す**補助（`e2e/helpers/courts-scenario.ts`。#53 の `long-name-player.ts` と同じやり方）で置き換える
- **#53 の枝の上に積む。** `findCurrentCompetitionId`・日本語の接続エラー表示・`enterAsPlayer` を #53 で作ったので、同じものを二重に作らない。PR の宛先は `develop`、本文に「#53 が先」と書く

## 触るファイル

| ファイル | 新規 / 変更 |
| --- | --- |
| `docs/specs/2026-09-19-courts-real-data.md` | 新規（仕様） |
| `src/db/courts.ts` / `.test.ts` | 新規 |
| `src/usecases/build-courts-view.ts` / `.test.ts` | 新規 |
| `src/usecases/load-courts-page.ts` / `.test.ts` | 新規（page.tsx の分岐。大会が無い／つながらないを DB を壊さずに確かめるため） |
| `src/ui/courts/types.ts` | 新規（型を `sample-data.ts` から移す） |
| `src/ui/courts/sample-data.ts` | 削除 |
| `src/ui/courts/courts-page.tsx` / `court-live-card.tsx` と各テスト | 変更（観戦者は見るだけ） |
| `src/ui/courts/no-db-import.test.ts` | 変更（myページと同じ見張り方） |
| `src/app/(app)/courts/page.tsx` | 変更 |
| `e2e/helpers/courts-scenario.ts` | 新規 |
| `e2e/courts.spec.ts` | 変更 |
| `docs/roadmap.md` | 変更（1-a 完了・いま動いているものを今の状態に） |

## 確認のしかた

```bash
npm run test:related src/db/courts.ts src/usecases/build-courts-view.ts
npm test
npm run test:e2e     # 3000 番の開発サーバーを止めてから。終わったら立ち上げ直す
npm run check
```

画面は http://localhost:3000/courts で、観戦者と選手（愛知南 → さとう）の両方で開いて確かめる。375px でも PM が確認する。

## 残した宿題

- 得点を保存する（1-b）。観戦者には保存の入口も 403 で断られるので、画面側と揃う
- 他の人の得点をその場で映す（1-c）。届いた行だけを当てる形にする
- 試合の終了・取り消しを入口につなぐ（1-d）
