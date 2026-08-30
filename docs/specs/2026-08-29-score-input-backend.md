# 得点入力のバックエンド

作った日: 2026-08-29

## なぜ作るか

得点を保存する入口が 1 つも無い。`/matches` の得点入力は画面を閉じると消えるので、
「まだ保存されません」と注意書きを出している（`src/ui/matches/score-sheet.tsx`）。

当日サーバーに届くのは**得点と試合の進み具合だけ**。人・大会・組み合わせは CSV で流し込む。

## やること

画面はまだ作らない。**入口（API）とその中身**だけを作る。

### 1. 得点を保存する `POST /api/matches/[matchId]/scores`

送るもの: `{ gameNumber, sideAScore, sideBScore }`

- `game_scores` に `match_id` × `game_number` の行が無ければ作り、あれば書き換える
- `updated_at` を**必ず自分で入れる**。自動更新の仕掛け（トリガー）はこの DB に 1 つも無い
- 1 点でも入っていて試合が `waiting` なら、`matches` を `live` にして `started_at` を入れる
- 0 対 0 を送っただけでは `waiting` のまま

断るとき:

| 何が起きたか | 返すもの |
| --- | --- |
| 入場していない | 401 |
| 観戦者として入場している | 403 |
| 試合が見つからない | 404 |
| `gameNumber` が 1 未満、または `matches.max_game_count` を超えている | 400 |
| 試合が `done`（先に終了を取り消してもらう） | 409 |

### 2. 試合を終了する `POST /api/matches/[matchId]/result`

送るもの: なし

- `matches` の `status` を `done` にして `finished_at` を入れる
- **1 点も入っていなければ 400 で止める**（押し間違いを防ぐ）
- 既に `done` のときは何も変えずに成功を返す（二重に押しても壊れない）

### 3. 終了を取り消す `DELETE /api/matches/[matchId]/result`

送るもの: なし

- `matches` の `status` を `live` に戻し、`finished_at` を空にする
- `done` でない試合に送ったときは何も変えずに成功を返す

### 共通

どの入口も `AGENTS.md` の順を守る。
誰か確認（`requirePlayer()`）→ zod で検証 → `getSupabaseAdminClient()` で書き込み →
`logWrite()` → catch で `toErrorResponse()`。

`write_logs` に残す名前: `score.save` / `match.finish` / `match.reopen`。

### 計算（`src/domain/scoring.ts`）

DB も HTTP も触らない純粋な計算。

- `playedGameScores(scores)` … **0 対 0 のゲームを除く**
- `hasAnyPoint(scores)` … 1 点でも入っているか

## やらないこと

- **画面。** フロントは別の人が担当する（下の「フロントに渡すこと」を読んでもらう）
- **棄権・不戦勝**（`matches.ending`）
- **順位・勝敗の計算。** `playedGameScores` は作るが、順位表は作らない
- **21 点・デュースの判定。** 「何点先取かは持たない」方針は変えない
- **CSV 取り込み。** `match_settings` から `matches.max_game_count` へのコピーもここではやらない
- **コート番号・試合順の変更**
- **本番への公開**

## 受け入れ基準

- [ ] 入場していない状態で得点を送ると 401 が返り、日本語のエラーが返る
- [ ] 観戦者として入場した状態で得点を送ると 403 が返る
- [ ] 得点を送ると `game_scores` に保存され、もう一度送ると同じ行が書き換わる（行が増えない）
- [ ] 得点を送ると `game_scores.updated_at` が前より新しくなる
- [ ] `waiting` の試合に 1 点入ると `matches.status` が `live` になり、`started_at` が入る
- [ ] 0 対 0 を送っただけでは `matches.status` は `waiting` のまま
- [ ] `max_game_count` が 1 の試合に 2 ゲーム目の得点を送ると 400 が返る
- [ ] `gameNumber` が 0 や負の数のとき 400 が返る
- [ ] 無い試合 ID に得点を送ると 404 が返る
- [ ] 終了を送ると `status` が `done` になり、`finished_at` が入る
- [ ] 1 点も入っていない試合に終了を送ると 400 が返り、`status` は変わらない
- [ ] `done` の試合に得点を送ると 409 が返る
- [ ] 終了の取り消しを送ると `status` が `live` に戻り、`finished_at` が空になる。そのあと得点を送れる
- [ ] 得点・終了・取り消しのたびに `write_logs` に 1 行増える
- [ ] `playedGameScores` が 0 対 0 のゲームを除く
- [ ] `npm run check && npm test` が緑

## 触るファイル

| ファイル | 新規 / 変更 |
| --- | --- |
| `src/domain/scoring.ts` / `scoring.test.ts` | 新規 |
| `src/usecases/save-score.ts` / `save-score.test.ts` | 新規 |
| `src/usecases/finish-match.ts` / `finish-match.test.ts` | 新規 |
| `src/usecases/reopen-match.ts` / `reopen-match.test.ts` | 新規 |
| `src/db/matches.ts` | 新規（usecases に渡す DB の実装） |
| `src/app/api/matches/[matchId]/scores/route.ts` | 新規 |
| `src/app/api/matches/[matchId]/result/route.ts` | 新規（`POST` で終了、`DELETE` で取り消し） |
| `docs/database.md` | 変更（書き込みの入口の説明を足す） |

`supabase/migrations/` は触らない。表の変更は `20260829000100_match_settings.sql` で済んでいる。

## 決めたこと

| | 決定 | なぜ |
| --- | --- | --- |
| 送る中身 | **今の点数をそのまま送る**（「1 点足して」ではない） | 連打しても、電波が悪くて送り直しても余分に入らない。画面の数字が正、が得点係に分かりやすい |
| 終了後の修正 | **「終了を取り消す」を作る。** 終了した試合は直接は直せない | 順位発表後に誤って押しても黙って結果が変わらない。それでも直す道は残り、取り消した記録も残る |
| 終了の条件 | **1 点も入っていないときだけ止める** | 押し間違いだけ防ぐ。「何点先取か」を持っていないので、これ以上は確かめようがない |
| 空のゲーム | **0 対 0 のゲームは数えない、をルールにする** | バドミントンに 0 対 0 で終わるゲームは無い。1 ゲームでも 3 ゲームでも同じ扱いにでき、消す処理も例外も要らない |
| 二重に押されたとき | 終了・取り消しは**何も変えずに成功を返す** | 電波の悪い体育館では同じ操作が 2 回届く。2 回目でエラーを出すと得点係が不安になる |
| 誰が入れられるか | **入場した人は全員。** `requirePlayer()` だけで足りる | `can_input` は `20260829000000_naming_review.sql` で消えた。「今回の大会の参加者＝得点を入れられる人」 |
| 入口の名前 | **`result` というモノを作る（`POST`）／消す（`DELETE`）。** `finish` `reopen` という動詞のパスにしない | 動詞にすると入口が増えるたびに名前を考えることになり、2 つが表裏であることもパスから読めない。**「1 点も入っていなければ止める」のような大会のルールは入口の名前に出さない**（判断は `src/usecases/` にある。ルールが変わっても URL は変わらない） |

## フロントに渡すこと

画面のボタンは **「試合を終了する」1 つだけ**でよい。「次のゲームへ」は要らない。

```
第1ゲーム   [ 21 ] [ 15 ]   ← 押せる
第2ゲーム   [  0 ] [  0 ]   ← 押せる      枠の数 = matches.max_game_count
第3ゲーム   [  0 ] [  0 ]   ← 押せる

          [ 試合を終了する ]
```

`max_game_count` 個のゲームの枠を並べておけば、得点係は**いま進んでいる枠を押すだけ**で済む。
1 ゲームで終わる試合は残りが 0 対 0 のまま残るが、0 対 0 は数えないので順位に響かない。

いまの `src/ui/matches/score-sheet.tsx` にある「ゲーム終了」ボタンは、これに置き換わる。
「まだ保存されません」の注意書き（`src/ui/components/unsaved-notice.tsx`）も外す。

## 残した宿題

- 棄権・不戦勝（`matches.ending`）を記録する入口
- 順位・勝敗の計算（`playedGameScores` を使う）
- CSV 取り込み。そのときに `match_settings` から `matches.max_game_count` へコピーする
- 画面をこの入口につなぐ（フロント担当）
- 本番への反映（`npm run db:push`）。**人の判断で行う**
