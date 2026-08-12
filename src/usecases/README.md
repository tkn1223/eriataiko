# usecases — 1 操作 = 1 関数

**「利用者が 1 回やること」を 1 つの関数にまとめます。** テストの主戦場です。

例:

- `add-point.ts` … 得点を 1 点入れる
- `finish-game.ts` … ゲームを終了して結果を確定する
- `enter.ts` … 入場する

## 書き方

DB を直接触らず、`src/domain/repositories.ts` の約束を**引数で受け取ります**。

```ts
export async function addPoint(
  deps: { matches: MatchRepository; log: WriteLog },
  input: { matchId: string; side: 'A' | 'B'; by: Operator }
) {
  const match = await deps.matches.find(input.matchId);
  if (!match) throw new NotFound('その試合はありません');
  if (match.status === 'done') throw new Conflict('終了した試合には入れられません');

  const next = addPointTo(match, input.side); // domain の計算
  await deps.matches.save(next);
  await deps.log.record(input.by, 'score.add', input);
  return next;
}
```

## なぜこの形か

DB の代わりに**偽物を渡してテストできます**。本物の DB を立てずに、
デュース・終了済み・存在しない試合といった分岐を全部書けます。

```ts
const matches = new InMemoryMatchRepository([...]);
await addPoint({ matches, log }, { ... });
```

## Route Handler は薄くする

`src/app/api/**/route.ts` は「受け取って usecases を呼ぶだけ」にします。
5 行で済むなら、そこにテストは要りません。

```ts
export async function POST(request: Request) {
  try {
    const operator = await requireOperator();
    const body = await parseBody(request, schema);
    await addPoint(deps(), { ...body, by: operator });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
```
