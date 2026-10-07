# 星取表・順位表を本物のデータにつなぐ（3-b。#62 を含む）

作った日: 2026-10-07

## なぜ作るか

対戦表（`/bracket`）は今も見本の固定データ（`src/ui/bracket/sample-data.ts`）。
勝敗と順位の計算（3-a、`src/domain/standings.ts`）は #60 でできてマージ済み。
3-b はその計算を使って、**予選リーグの星取表・順位表・対戦の詳細**を本物のデータにつなぐ（`docs/roadmap.md` の 3-b）。

あわせて、たかひろさんの課題 **#62**（yosuke 担当）：今の計算は「予選の対戦か決勝の対戦か」を区別しないので、
そのままつなぐと**決勝の勝ちまで予選の順位表に数えてしまう**（エラーは出ない）。ここで防ぐ。

## 決めたこと（yosuke さん確認済み）

1. **今回本物にするのは予選リーグ側だけ。** 決勝トーナメント側は 3-c まで「準備中」と出す（作り物の名前を本物の予選と並べて見せない）
2. **#62 の守りは計算の中に置く。** 「順位は予選だけで決まる」は大会のルールそのものなので、ルールの持ち主（`buildStandings`）が自分で決勝の対戦を弾く。どこから使っても間違えようがない
3. （#60 で決定済み）勝敗は対戦が全部終わってから。並びは 勝ち数 → ゲーム → 得失点。同率は同順位

## やること

**計算（`src/domain/standings.ts`）**
- `MatchupInput` に、その対戦が属する段の種類（`stageFormat`。表の `stages.format` と同じ名前・値。`'league'` / `'knockout'`）を足す
- `buildStandings` は `stageFormat !== 'league'` の対戦を数えない（#62）

**データを読む（`src/db/bracket.ts`、新規。結果LIVE の `src/db/courts.ts` と同じ形）**
- いまの大会（既存の `findCurrentCompetition`）→ チーム・部・予選の段の対戦と中の試合（出場者・得点つき）・自分の参加者を読む
- 一覧はすべて `.limit()`、上限 + 1 件読んで超えたら分かるようにする（結果LIVE と同じ）
- 開いたときに 1 回だけ読む。自動では読み直さない（1-c の宿題）

**画面の形に組み立てる（`src/usecases/build-bracket-view.ts`、新規。純粋な関数）**
- 星取表のマス: 対戦の状態は「中の試合が全部終わった → 終了」「全部まだ → 未」「それ以外 → 試合中」。数字はカード内の勝ち試合数（`matchupResult` の `wonMatches`）
- 終わった対戦が引き分け（勝ち試合数が同数）のマスは「△」
- 順位表: `buildStandings` の `TeamStanding` を画面の `StandingRow` に直す（チーム番号・色・自分のチームの印）。引き分けがあるチームだけ「◯勝◯敗◯分」
- 対戦の詳細シート: 中の試合ごとに部（`divisions.name`、色は `src/domain/class-labels.ts`）・両ペアの名前・ゲーム数・状態
- 自分のチームの印は、選手として入った人のチームだけ（観戦者には付けない）

**画面（`src/app/(app)/bracket/page.tsx` ほか）**
- `page.tsx` は 読む → 組み立てる → `BracketPage` に渡すだけ。大会が無い／つながらないときは結果LIVE と同じ日本語の案内
- 予選の組み合わせがまだ無いときは「予選リーグの組み合わせはまだありません」
- 決勝トーナメントのタブは「準備中」（既存の `ComingSoon` か同じ見た目）
- 見本データ `sample-data.ts` は消し、型は `src/ui/bracket/types.ts` へ（結果LIVE と同じやり方）。勝ち上がり表の部品と型は 3-c で使うので残す（テストは自前の小さな値）

## やらないこと

- 決勝トーナメントを本物にすること（3-c。勝者を次の枠に入れる計算もそこ）
- 棄権・不戦勝の扱い（#61。たかひろさんが決めたルールで別に作る）
- 自動での読み直し・他の人の点をその場で映すこと（1-c）
- 表のつくりの変更（`supabase/migrations/` は触らない）
- 320px 幅への対応（ミーティングで決める）

## 受け入れ基準

- [ ] `/bracket` の予選リーグに、本物のチーム名・本物の対戦結果が出る。見本の名前は出ない
- [ ] 星取表のマスが、対戦の状態どおりに ○ / ● / 試合中 / 未 / △（引き分け）を出し、数字はカード内の勝ち試合数
- [ ] 順位表が `buildStandings` の結果どおり（勝ち数 → ゲーム → 得失点、同率は同順位）に並ぶ
- [ ] **決勝トーナメントの対戦が終わっていても、予選の順位表の数字も並びも変わらない**（#62。計算のテストと、画面までの e2e の両方で確かめる）
- [ ] `buildStandings` に決勝の対戦を混ぜて渡しても、混ぜないときと同じ結果になる（計算の側で弾いている）
- [ ] マスを押すと、その対戦の試合一覧（部・両ペアの名前・ゲーム数・状態）が下から出る
- [ ] 選手として入った人のチームの行が強調される。観戦者では強調されない
- [ ] 決勝トーナメントのタブは「準備中」と出て、作り物の名前は出ない
- [ ] 大会が無い／つながらない／予選の組み合わせが無いとき、日本語の案内が出る
- [ ] 375px と 390px で横にはみ出さない（星取表と順位表。Playwright で実測）
- [ ] 一覧を読むクエリすべてに `.limit()`。上限を超えたら黙って欠けさせない
- [ ] 色の対応は `src/domain/class-labels.ts` だけ（`color-decisions-single-source.test.ts` が緑）
- [ ] `src/ui/bracket/` の部品は `@/db` を import しない。`page.tsx` は `@/db/admin` を import しない
- [ ] `npm run check && npm test && npm run test:e2e` が緑

## つくりの方針

- 結果LIVE（`src/db/courts.ts` → `src/usecases/build-courts-view.ts` → `load-courts-page.ts` → `page.tsx`）と同じ層の分け方。出し分けは `load-` に切り出して Vitest で確かめる
- 計算は作り直さない: `matchupResult` / `buildStandings`（standings.ts）、`playedGameScores`（scoring.ts）、色と部（class-labels.ts）
- e2e は `e2e/helpers/bracket-scenario.ts`（新規）でテスト用の対戦・試合・得点を作って消す（`courts-scenario.ts` と同じやり方。seed の状態に頼らない。`is_current` は触らない）。**終わった決勝の対戦も 1 つ作り、順位表が変わらないことを確かめる**

## 触るファイル（予定）

| ファイル | 新規 / 変更 |
| --- | --- |
| `docs/specs/2026-10-07-bracket-real-data.md` | 新規（仕様） |
| `src/domain/standings.ts` / `.test.ts` | 変更（`stageFormat` で決勝の対戦を弾く。#62） |
| `src/db/bracket.ts` / `.test.ts` | 新規 |
| `src/usecases/build-bracket-view.ts` / `.test.ts` | 新規 |
| `src/usecases/load-bracket-page.ts` / `.test.ts` | 新規 |
| `src/ui/bracket/types.ts` | 新規（型を `sample-data.ts` から移す） |
| `src/ui/bracket/sample-data.ts` | 削除 |
| `src/ui/bracket/*.tsx` と各テスト | 変更（引き分け「△」、決勝タブを準備中、見本データをやめる） |
| `src/app/(app)/bracket/page.tsx` | 変更 |
| `e2e/helpers/bracket-scenario.ts` | 新規 |
| `e2e/bracket.spec.ts` | 変更 |
| `docs/roadmap.md` | 変更（3-b と #62） |

## 確認のしかた

```bash
npm run test:related src/domain/standings.ts src/usecases/build-bracket-view.ts
npm test
npm run test:e2e     # 3000 番を止めてから
npm run check
```

手元の http://localhost:3000/bracket を選手・観戦者の両方で開いて、yosuke さんと一緒に見る。

## 残した宿題

- 3-c 勝ち上がり表を本物のデータにつなぐ（勝者を次の枠に入れる計算も）
- #61 棄権・不戦勝の扱い
- 1-c 自動で読み直す（他の人の点をその場で映す）
