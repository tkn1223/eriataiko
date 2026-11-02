# 棄権を記録する（roadmap 5 / #61）

作った日: 2026-10-11

## なぜ作るか

試合で棄権が出たときの扱いがどこにも無い。いまは点数だけで勝ち負けが決まるので、
棄権した側が点数で勝っていると**棄権した側の勝ち**になり、エラーも出ないので気づけない（#60 レビュー）。

## 決まっていること

#61（#60 レビューで決定）:
- 棄権が出ても試合は飛ばさず、必ず代わりの試合をする（点数は必ず入る）
- 棄権した試合は、点数に関係なく**相手の勝ち**
- ゲーム数と得失点は、代わりの試合の点数から数える
- 「同点では終了できない」は今のまま
- 順位表と個人ページで勝ち負けが食い違わないこと

10/11 たかひろさん:
- 印は「普通・A 側が棄権・B 側が棄権」の 3 つ。**不戦勝はなくす**（必ず代わりの試合をするので起きない）。「普通」は画面に出ない既定値
- 印は**結果LIVE で試合を終了するとき**に付ける（確認画面で選ぶ）。間違えたら「直す」で取り消して付け直す
- 代わりに出た人の付け替えは**しない**。棄権した人の個人ページには「負け」と、代わりの試合のゲーム数・得失点が入る

## やること

1. **表のつくり**: `supabase/migrations/<日付時刻>_ending_retired_only.sql`（既存ファイルは編集しない）
   - 不戦勝の行があれば相手側の棄権に読み替え（walkover_side_a → retired_side_b）、`matches.ending` の検査を `normal / retired_side_a / retired_side_b` だけにする。冒頭コメントに経緯
   - `npm run db:reset` → `npm run db:types`、`tests/schema.test.ts` にテスト
2. **勝ち負けの決め方を 1 か所に**: `src/domain/match-rules.ts` に `matchWinner(scores, maxGameCount, ending)` を足す
   （棄権なら相手、それ以外はいまの `leadingSide(matchOutcome(...).wonGames)`）。次をすべてこれに置き換える:
   - `src/domain/standings.ts` の `winnerOfMatch`（→ 順位表・対戦の勝ち・優勝・星取表が全部そろう）
   - `src/domain/player-record.ts`（入力に ending を足す）
   - `src/usecases/build-my-page-view.ts` の `won`
   - `src/ui/courts/court-live-card.tsx` の `finishSummary`（終了後の「勝ち: ◯◯」、確認画面）
   - `src/ui/bracket/card-detail-sheet.tsx` の太字（試合ごとの勝ちを usecase から渡す）
3. **読み込みに ending を足す**: `src/db/courts.ts` `src/db/bracket.ts` `src/db/me.ts`、購読の `use-live-updates.ts`（toMatchChange）・`apply-live-change.ts`・`types.ts`（CourtMatch など）
4. **終了の入口**: `POST /api/matches/[matchId]/result` に本文 `{ retiredSide?: 'A' | 'B' }`（zod。無ければ普通）。
   `src/usecases/finish-match.ts` が ending も書く。**取り消し（DELETE）で ending を普通に戻す**（`src/usecases/reopen-match.ts`・`src/db/matches.ts`）
5. **画面（結果LIVE）**:
   - 終了の確認画面（`finish-confirm-sheet.tsx`）に「棄権があった」と、どちらが棄権したか（両ペアの名前のボタン。大きく押しやすく）。選ぶと「試合の勝ち」の表示が相手側に変わる
   - 今の試合と「直し中」の両方の確認画面で使える。終了の預かり場所（`use-score-sync.ts` の finish）が棄権の側も持って送る
   - 終わった試合・1 つ前・対戦表の試合一覧・myページの試合に「（◯◯ 棄権）」と小さく添える（点数では負けている側が勝ちになるので、理由を見せる）

## やらないこと

- 不戦勝（点数なしで終わる試合）
- 代わりに出た人の付け替え
- 試合中に棄権の印を付けるボタン
- 進行表（`/matches`）への棄権の画面（まだ見本データ）
- 棄権した人の個人成績から、代わりの試合のゲーム数・得失点を除くこと

## 受け入れ基準

- [ ] 点数で A が勝っている試合を「A 側が棄権」で終了すると、B の勝ちとして記録・表示される（結果LIVE の終わった試合・1 つ前・対戦表の試合一覧・myページ）
- [ ] 同じ試合で、順位表（勝ち・負け）と星取表・対戦の勝ち数・優勝・myページの勝敗が、すべて B の勝ちでそろう
- [ ] ゲーム数と得失点は、点数のとおりに数える（棄権でも変えない）
- [ ] 棄権を選ばずに終了すると、いまと同じ（点数で勝ち負け）
- [ ] 同点のときは、棄権を選んでも終了できない（いまの案内のまま）
- [ ] 「直す」で取り消すと棄権の印が消え、もう一度終了するときに選び直せる
- [ ] 棄権を選んだ終了が、送れていない点があっても点が届いてから記録される（いまの終了と同じ）
- [ ] 他の人の画面にも、棄権の印と勝ちがその場で映る
- [ ] 観戦者には棄権を選ぶ欄が出ない（終了ボタン自体が出ない、いまのまま）
- [ ] 不正な本文（retiredSide が A/B 以外）は 400 と日本語のエラー
- [ ] `matches.ending` に不戦勝の値が入らない（表の検査）
- [ ] 375px / 390px で、確認画面の棄権の欄がはみ出さない（Playwright で実測）
- [ ] `npm run check && npm test && npm run test:e2e` が緑

## 触るファイル（主なもの）

- 新規: `supabase/migrations/<日付時刻>_ending_retired_only.sql`
- 変更: `src/domain/match-rules.ts` `standings.ts` `player-record.ts`、`src/usecases/finish-match.ts` `reopen-match.ts` `build-my-page-view.ts` `build-bracket-view.ts` `build-courts-view.ts`、`src/db/matches.ts` `courts.ts` `bracket.ts` `me.ts`、`src/app/api/matches/[matchId]/result/route.ts`、`src/ui/courts/*`（finish-confirm-sheet・court-live-card・courts-page・use-score-sync・use-live-updates・apply-live-change・types・derive-courts）、`src/ui/bracket/card-detail-sheet.tsx`、`src/ui/me/my-page.tsx`、`src/types/database.ts`（生成）
- テスト: 上の各 `*.test.ts(x)`、`tests/schema.test.ts`、`e2e/courts-live.spec.ts`（棄権で終了 → 他の画面・対戦表・myページ）

## 気をつけること

- **結果LIVE は yosuke さんの次の PR（得点入力の担当）も触る。** 先にこちらが入るので、yosuke さんが取り込み直すときにぶつかりうる。終了の確認画面と預かり場所の finish の形を変えることを、マージ後に伝える
- **表のつくりを変えるので、本番は「先に `npm run db:push`、あとからコード」**。この PR では本番に流さない（人の判断）

## 確認のしかた

- `npm run db:reset && npm run db:types` → `npm run check && npm test && npm run test:e2e`
- 手元で `npm run dev`、選手として入り、点数で勝っている側を棄権にして終了 → 結果LIVE・対戦表・myページで相手の勝ちになっていること

## レビューのあとで決めたこと（10/11 たかひろさん）

- **2 人がほぼ同時に終了を押し、先の人の終了が記録されたとき、後から押した人には案内を出さない。** 画面は記録どおりにそろうので食い違いは起きない。次の「得点入力の担当」で終了できるのが担当だけになり、同時に押す場面自体がなくなるため
