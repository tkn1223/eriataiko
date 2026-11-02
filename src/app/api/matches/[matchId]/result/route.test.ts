import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('@/server/session', () => ({ getSession: vi.fn() }));

import { DELETE, POST } from '@/app/api/matches/[matchId]/result/route';
import { getSupabaseAdminClient } from '@/db/admin';
import { getSession, type Session } from '@/server/session';
import {
  createScorerFixture,
  type ScorerFixture,
} from '../../../../../../tests/helpers/match-scorer-fixture';

/**
 * 試合の終了・終了の取り消しの入口が、担当を確かめることを、本物の DB とセッションの偽物で確かめる。
 * 「試合の終了は担当だけ」「直すのは誰でも。押した人が担当になる」。
 *
 * 仕様: docs/specs/2026-10-14-match-scorer.md
 * 実行前に `npm run db:start` が必要。
 */
const mockedGetSession = vi.mocked(getSession);
const admin = getSupabaseAdminClient();

let fixture: ScorerFixture;
beforeAll(async () => {
  fixture = await createScorerFixture(872000 + Math.floor(Math.random() * 1000) * 10);
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
  return { params: Promise.resolve({ matchId }) } as Parameters<typeof POST>[1];
}

const finishRequest = () =>
  new Request('http://localhost/api/matches/x/result', { method: 'POST' });
const reopenRequest = () =>
  new Request('http://localhost/api/matches/x/result', { method: 'DELETE' });

/** 点が入った進行中の試合を作る。 */
async function makeScoredMatch(status: 'live' | 'done' = 'live') {
  const matchId = await fixture.makeMatch(status);
  await admin
    .from('game_scores')
    .insert({ match_id: matchId, game_number: 1, side_a_score: 21, side_b_score: 15 });
  return matchId;
}

/**
 * `minutesAgo` 分前に担当になり、最後の点もその時刻に入れた担当にする（最後に点を入れた時刻は、
 * 担当になった時刻と点の保存時刻の遅いほうなので、両方ずらす）。
 */
async function setScorer(matchId: string, participantId: string, minutesAgo: number) {
  const at = new Date(Date.now() - minutesAgo * 60_000).toISOString();
  await admin
    .from('matches')
    .update({ scorer_participant_id: participantId, scorer_claimed_at: at })
    .eq('id', matchId);
  await admin.from('game_scores').update({ updated_at: at }).eq('match_id', matchId);
}

async function matchRow(matchId: string) {
  const { data } = await admin
    .from('matches')
    .select('status, scorer_participant_id, scorer_claimed_at')
    .eq('id', matchId)
    .single();
  return data!;
}

describe('試合の終了は担当だけ', () => {
  test('入場していない人は 401、観戦者は 403。試合は終わらない', async () => {
    const matchId = await makeScoredMatch();

    enterAs(null);
    expect((await POST(finishRequest(), contextOf(matchId))).status).toBe(401);
    enterAs({ role: 'viewer' });
    expect((await POST(finishRequest(), contextOf(matchId))).status).toBe(403);

    expect((await matchRow(matchId)).status).toBe('live');
  });

  test('担当の人が終了を押すと、試合が終わる', async () => {
    const matchId = await makeScoredMatch();
    await setScorer(matchId, fixture.people.minamiTaro.participantId, 1);
    enterAs(fixture.people.minamiTaro.session);

    const response = await POST(finishRequest(), contextOf(matchId));

    expect(response.status).toBe(200);
    expect((await matchRow(matchId)).status).toBe('done');
  });

  test('担当でない人が入口を直接叩いても断られる（409・理由に担当の名前）。試合は終わらない', async () => {
    const matchId = await makeScoredMatch();
    await setScorer(matchId, fixture.people.kitaTaro.participantId, 1);
    enterAs(fixture.people.minamiTaro.session);

    const response = await POST(finishRequest(), contextOf(matchId));

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: expect.stringContaining('愛知北のたろうさんが担当しています'),
      code: 'not-scorer',
    });
    expect((await matchRow(matchId)).status).toBe('live');
  });

  test('担当がいない試合も、担当を取っていない人は終了できない', async () => {
    const matchId = await makeScoredMatch();
    enterAs(fixture.people.minamiTaro.session);

    const response = await POST(finishRequest(), contextOf(matchId));

    expect(response.status).toBe(409);
    expect((await matchRow(matchId)).status).toBe('live');
  });

  test('ほかの人の担当が 5 分たっていても、取っていない人は終了できない', async () => {
    const matchId = await makeScoredMatch();
    await setScorer(matchId, fixture.people.kitaTaro.participantId, 6);
    enterAs(fixture.people.minamiTaro.session);

    expect((await POST(finishRequest(), contextOf(matchId))).status).toBe(409);
  });
});

describe('終了の取り消し（直す）は誰でも押せて、押した人が担当になる', () => {
  test('担当でない人が直すと、終了が取り消され、その人が担当になる', async () => {
    const matchId = await makeScoredMatch('done');
    await setScorer(matchId, fixture.people.kitaTaro.participantId, 1);
    enterAs(fixture.people.minamiTaro.session);

    const response = await DELETE(reopenRequest(), contextOf(matchId));

    expect(response.status).toBe(200);
    const row = await matchRow(matchId);
    expect(row.status).toBe('live');
    expect(row.scorer_participant_id).toBe(fixture.people.minamiTaro.participantId);
    expect(Date.now() - new Date(row.scorer_claimed_at!).getTime()).toBeLessThan(60_000);
  });

  test('担当がいない終了済みの試合も、直した人が担当になる', async () => {
    const matchId = await makeScoredMatch('done');
    enterAs(fixture.people.honbu.session);

    await DELETE(reopenRequest(), contextOf(matchId));

    expect((await matchRow(matchId)).scorer_participant_id).toBe(
      fixture.people.honbu.participantId
    );
  });

  test('直した人は、そのまま終了もできる（もう一度終了する）', async () => {
    const matchId = await makeScoredMatch('done');
    enterAs(fixture.people.minamiTaro.session);
    await DELETE(reopenRequest(), contextOf(matchId));

    const response = await POST(finishRequest(), contextOf(matchId));

    expect(response.status).toBe(200);
    expect((await matchRow(matchId)).status).toBe('done');
  });

  test('観戦者は直せない（403）', async () => {
    const matchId = await makeScoredMatch('done');
    enterAs({ role: 'viewer' });

    expect((await DELETE(reopenRequest(), contextOf(matchId))).status).toBe(403);
    expect((await matchRow(matchId)).status).toBe('done');
  });

  test('この大会の参加者でない人は直せない（403）。終了は取り消されない', async () => {
    const matchId = await makeScoredMatch('done');
    enterAs(fixture.stranger);

    expect((await DELETE(reopenRequest(), contextOf(matchId))).status).toBe(403);
    expect((await matchRow(matchId)).status).toBe('done');
  });

  test('終了していない試合を直す操作は、何も変えずに成功し、担当も変わらない', async () => {
    const matchId = await makeScoredMatch('live');
    await setScorer(matchId, fixture.people.kitaTaro.participantId, 1);
    enterAs(fixture.people.minamiTaro.session);

    const response = await DELETE(reopenRequest(), contextOf(matchId));

    expect(response.status).toBe(200);
    expect((await matchRow(matchId)).scorer_participant_id).toBe(
      fixture.people.kitaTaro.participantId
    );
  });
});
