import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('@/server/session', () => ({ getSession: vi.fn() }));

import { PUT } from '@/app/api/matches/[matchId]/correction/route';
import { getSupabaseAdminClient } from '@/db/admin';
import { getSession, type Session } from '@/server/session';
import {
  createScorerFixture,
  type ScorerFixture,
} from '../../../../../../tests/helpers/match-scorer-fixture';

/**
 * 訂正の入口を、本物の DB とセッションの偽物で確かめる。
 * 仕様: docs/specs/2026-11-22-matches-redesign.md
 * 実行前に `npm run db:start` が必要。
 */
const mockedGetSession = vi.mocked(getSession);
const admin = getSupabaseAdminClient();

let fixture: ScorerFixture;
beforeAll(async () => {
  fixture = await createScorerFixture(873000 + Math.floor(Math.random() * 1000) * 10);
});
afterAll(async () => {
  await fixture.dispose();
});
beforeEach(() => {
  mockedGetSession.mockReset();
});

function enterAs(session: Session | null) {
  mockedGetSession.mockResolvedValue(session);
}

function contextOf(matchId: string) {
  return { params: Promise.resolve({ matchId }) } as Parameters<typeof PUT>[1];
}

function correctionRequest(body: unknown) {
  return new Request('http://localhost/api/matches/x/correction', {
    method: 'PUT',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

/** 担当・終了時刻が入った終わった試合（第 1 ゲームは 21-15、第 2 ゲームは 8-3 のまま終了した形）。 */
async function makeDoneMatch() {
  const matchId = await fixture.makeMatch('done');
  const finishedAt = '2026-11-22T01:00:00.000Z';
  await admin
    .from('matches')
    .update({
      finished_at: finishedAt,
      scorer_participant_id: fixture.people.kitaTaro.participantId,
      scorer_claimed_at: finishedAt,
    })
    .eq('id', matchId);
  await admin.from('game_scores').insert([
    { match_id: matchId, game_number: 1, side_a_score: 21, side_b_score: 15 },
    { match_id: matchId, game_number: 2, side_a_score: 8, side_b_score: 3 },
  ]);
  return { matchId, finishedAt };
}

async function stateOf(matchId: string) {
  const { data: match } = await admin
    .from('matches')
    .select('status, finished_at, ending, scorer_participant_id')
    .eq('id', matchId)
    .single();
  const { data: scores } = await admin
    .from('game_scores')
    .select('game_number, side_a_score, side_b_score')
    .eq('match_id', matchId)
    .order('game_number');
  return { match: match!, scores: scores! };
}

const CORRECTED = [
  { gameNumber: 1, sideAScore: 21, sideBScore: 15 },
  { gameNumber: 2, sideAScore: 21, sideBScore: 17 },
];

describe('PUT /api/matches/[matchId]/correction', () => {
  test('入場していない人は 401、観戦者は 403。何も変わらない', async () => {
    const { matchId } = await makeDoneMatch();
    enterAs(null);
    expect(
      (await PUT(correctionRequest({ scores: CORRECTED, retiredSide: null }), contextOf(matchId)))
        .status
    ).toBe(401);
    enterAs({ role: 'viewer' });
    expect(
      (await PUT(correctionRequest({ scores: CORRECTED, retiredSide: null }), contextOf(matchId)))
        .status
    ).toBe(403);

    const { scores } = await stateOf(matchId);
    expect(scores[1]).toMatchObject({ side_a_score: 8, side_b_score: 3 });
  });

  test('担当でも参加者でもない選手が、2 試合前の試合を終わったまま直せる', async () => {
    const { matchId, finishedAt } = await makeDoneMatch();
    enterAs(fixture.people.minamiTaro.session);

    const response = await PUT(
      correctionRequest({ scores: CORRECTED, retiredSide: null }),
      contextOf(matchId)
    );

    expect(response.status).toBe(200);
    const { match, scores } = await stateOf(matchId);
    expect(scores).toEqual([
      { game_number: 1, side_a_score: 21, side_b_score: 15 },
      { game_number: 2, side_a_score: 21, side_b_score: 17 },
    ]);
    expect(match.status).toBe('done');
    expect(new Date(match.finished_at!).toISOString()).toBe(finishedAt);
    expect(match.scorer_participant_id).toBe(fixture.people.kitaTaro.participantId);
  });

  test('棄権を付ける・外すができ、新しいゲームも足せる', async () => {
    const { matchId } = await makeDoneMatch();
    enterAs(fixture.people.minamiTaro.session);

    await PUT(correctionRequest({ scores: CORRECTED, retiredSide: 'B' }), contextOf(matchId));
    expect((await stateOf(matchId)).match.ending).toBe('retired_side_b');

    const withThird = [...CORRECTED, { gameNumber: 3, sideAScore: 5, sideBScore: 2 }];
    await PUT(correctionRequest({ scores: withThird, retiredSide: null }), contextOf(matchId));
    const { match, scores } = await stateOf(matchId);
    expect(match.ending).toBe('normal');
    expect(scores).toHaveLength(3);
  });

  test('同じ内容を送り直しても同じ結果になる', async () => {
    const { matchId } = await makeDoneMatch();
    enterAs(fixture.people.minamiTaro.session);
    const send = () =>
      PUT(correctionRequest({ scores: CORRECTED, retiredSide: 'A' }), contextOf(matchId));

    expect((await send()).status).toBe(200);
    const first = await stateOf(matchId);
    expect((await send()).status).toBe(200);
    expect(await stateOf(matchId)).toEqual(first);
  });

  test('同点・1 点も無い・上限超えは 400 で、何も変わらない', async () => {
    const { matchId } = await makeDoneMatch();
    enterAs(fixture.people.minamiTaro.session);

    const tie = [
      { gameNumber: 1, sideAScore: 21, sideBScore: 15 },
      { gameNumber: 2, sideAScore: 15, sideBScore: 21 },
    ];
    const empty = [{ gameNumber: 1, sideAScore: 0, sideBScore: 0 }];
    const tooMany = [{ gameNumber: 4, sideAScore: 21, sideBScore: 0 }];
    for (const scores of [tie, empty, tooMany]) {
      const response = await PUT(
        correctionRequest({ scores, retiredSide: null }),
        contextOf(matchId)
      );
      expect(response.status).toBe(400);
      expect((await response.json()).error).toEqual(expect.any(String));
    }
    expect((await stateOf(matchId)).scores[1]).toMatchObject({ side_a_score: 8, side_b_score: 3 });
  });

  test('終わっていない試合は 409、無い試合は 404', async () => {
    const liveId = await fixture.makeMatch('live');
    enterAs(fixture.people.minamiTaro.session);

    const live = await PUT(
      correctionRequest({ scores: CORRECTED, retiredSide: null }),
      contextOf(liveId)
    );
    expect(live.status).toBe(409);
    expect((await live.json()).error).toContain('試合速報');
    expect((await stateOf(liveId)).scores).toEqual([]);

    const missing = await PUT(
      correctionRequest({ scores: CORRECTED, retiredSide: null }),
      contextOf('00000000-0000-4000-8000-000000000000')
    );
    expect(missing.status).toBe(404);
  });

  test('記録（write_logs）に match.correct が残る', async () => {
    const { matchId } = await makeDoneMatch();
    enterAs(fixture.people.minamiTaro.session);
    await PUT(correctionRequest({ scores: CORRECTED, retiredSide: null }), contextOf(matchId));

    const { data } = await admin
      .from('write_logs')
      .select('action')
      .eq('player_name', fixture.people.minamiTaro.session.playerName)
      .eq('action', 'match.correct')
      .limit(5);
    expect(data!.length).toBeGreaterThan(0);
  });
});
