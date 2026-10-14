import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('@/server/session', () => ({ getSession: vi.fn() }));

import { POST } from '@/app/api/matches/[matchId]/scores/route';
import { getSupabaseAdminClient } from '@/db/admin';
import { getSession, type Session } from '@/server/session';
import {
  createScorerFixture,
  type ScorerFixture,
} from '../../../../../../tests/helpers/match-scorer-fixture';

/**
 * 得点の保存の入口が、担当を確かめることを、本物の DB とセッションの偽物で確かめる。
 *
 * 仕様: docs/specs/2026-10-14-match-scorer.md
 * 実行前に `npm run db:start` が必要。
 */
const mockedGetSession = vi.mocked(getSession);
const admin = getSupabaseAdminClient();

let fixture: ScorerFixture;
beforeAll(async () => {
  fixture = await createScorerFixture(871000 + Math.floor(Math.random() * 1000) * 10);
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

function scoreRequest(sideAScore: number, sideBScore: number, gameNumber = 1) {
  return new Request('http://localhost/api/matches/x/scores', {
    method: 'POST',
    body: JSON.stringify({ gameNumber, sideAScore, sideBScore }),
  });
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

async function savedScore(matchId: string, gameNumber = 1) {
  const { data } = await admin
    .from('game_scores')
    .select('side_a_score, side_b_score')
    .eq('match_id', matchId)
    .eq('game_number', gameNumber)
    .maybeSingle();
  return data;
}

async function savedScoreAt(matchId: string, gameNumber = 1) {
  const { data } = await admin
    .from('game_scores')
    .select('updated_at')
    .eq('match_id', matchId)
    .eq('game_number', gameNumber)
    .single();
  return data!.updated_at;
}

async function matchRow(matchId: string) {
  const { data } = await admin
    .from('matches')
    .select('status, scorer_participant_id, scorer_claimed_at')
    .eq('id', matchId)
    .single();
  return data!;
}

async function actionsOf(matchId: string) {
  const { data } = await admin
    .from('write_logs')
    .select('action')
    .like('player_name', `${fixture.tag}-%`)
    .eq('action_detail->>matchId', matchId)
    .order('id', { ascending: true });
  return (data ?? []).map((row) => row.action);
}

describe('入場の確かめ', () => {
  test('入場していない人の点は 401 で、保存されない', async () => {
    enterAs(null);
    const matchId = await fixture.makeMatch();

    expect((await POST(scoreRequest(1, 0), contextOf(matchId))).status).toBe(401);
    expect(await savedScore(matchId)).toBeNull();
  });

  test('観戦者の点は 403 で、保存されず、担当にもならない', async () => {
    enterAs({ role: 'viewer' });
    const matchId = await fixture.makeMatch();

    expect((await POST(scoreRequest(1, 0), contextOf(matchId))).status).toBe(403);
    expect(await savedScore(matchId)).toBeNull();
    expect((await matchRow(matchId)).scorer_participant_id).toBeNull();
  });
});

describe('担当の確かめ', () => {
  test('担当でない人から点が届いても保存されず、いまの担当の点が残る（409・理由に担当の名前）', async () => {
    const matchId = await fixture.makeMatch();
    enterAs(fixture.people.kitaTaro.session);
    await POST(scoreRequest(11, 10), contextOf(matchId));
    // 引き継がれて古い画面になった前の担当ではなく、もともと担当でない人が送ってくる形
    enterAs(fixture.people.minamiTaro.session);

    const response = await POST(scoreRequest(3, 3), contextOf(matchId));

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: expect.stringContaining('愛知北のたろうさんが担当しています'),
      code: 'not-scorer',
    });
    expect(await savedScore(matchId)).toEqual({ side_a_score: 11, side_b_score: 10 });
    expect((await matchRow(matchId)).scorer_participant_id).toBe(
      fixture.people.kitaTaro.participantId
    );
  });

  test('引き継がれた前の担当の点は断られる（引き継いだ人の点が残る）', async () => {
    const matchId = await fixture.makeMatch();
    await setScorer(matchId, fixture.people.minamiTaro.participantId, 0);
    enterAs(fixture.people.minamiTaro.session);
    expect((await POST(scoreRequest(5, 4), contextOf(matchId))).status).toBe(200);
    // 愛知北のたろうが引き継ぐ（入口を通さず、結果だけ作る）
    await setScorer(matchId, fixture.people.kitaTaro.participantId, 0);

    const response = await POST(scoreRequest(6, 4), contextOf(matchId));

    expect(response.status).toBe(409);
    expect(await savedScore(matchId)).toEqual({ side_a_score: 5, side_b_score: 4 });
  });

  test('担当の人の点は保存され、最後に点を入れた時刻（点の保存時刻）が新しくなる。matches は書かない', async () => {
    const matchId = await fixture.makeMatch();
    await setScorer(matchId, fixture.people.minamiTaro.participantId, 3);
    const before = await matchRow(matchId);
    enterAs(fixture.people.minamiTaro.session);

    const response = await POST(scoreRequest(12, 10), contextOf(matchId));

    expect(response.status).toBe(200);
    expect(await savedScore(matchId)).toEqual({ side_a_score: 12, side_b_score: 10 });
    expect(Date.now() - new Date(await savedScoreAt(matchId)).getTime()).toBeLessThan(60_000);
    // 担当の欄（matches）はそのまま。書くと全員への知らせが 1 点あたり 2 通になる
    const after = await matchRow(matchId);
    expect(after.scorer_claimed_at).toBe(before.scorer_claimed_at);
    expect(after.scorer_participant_id).toBe(fixture.people.minamiTaro.participantId);
    // 取り直したわけではないので、担当の記録は増えない
    expect(await actionsOf(matchId)).toEqual(['score.save']);
  });

  test('担当がいない試合に点が届いたら、送ってきた人が担当になって保存される（記録も残る）', async () => {
    const matchId = await fixture.makeMatch();
    enterAs(fixture.people.minamiTaro.session);

    const response = await POST(scoreRequest(1, 0), contextOf(matchId));

    expect(response.status).toBe(200);
    expect(await savedScore(matchId)).toEqual({ side_a_score: 1, side_b_score: 0 });
    expect((await matchRow(matchId)).scorer_participant_id).toBe(
      fixture.people.minamiTaro.participantId
    );
    expect(await actionsOf(matchId)).toEqual(['score.save', 'scorer.claim']);
  });

  test('呼出待ちの試合の最初の 1 点で LIVE になり、その人が担当になる', async () => {
    const matchId = await fixture.makeMatch('waiting');
    enterAs(fixture.people.honbu.session);

    await POST(scoreRequest(1, 0), contextOf(matchId));

    const row = await matchRow(matchId);
    expect(row.status).toBe('live');
    expect(row.scorer_participant_id).toBe(fixture.people.honbu.participantId);
  });

  test('ほかの人の担当が 5 分たっていれば、送ってきた人が担当になって保存される', async () => {
    const matchId = await fixture.makeMatch();
    await setScorer(matchId, fixture.people.kitaTaro.participantId, 5);
    enterAs(fixture.people.minamiTaro.session);

    const response = await POST(scoreRequest(2, 1), contextOf(matchId));

    expect(response.status).toBe(200);
    expect(await savedScore(matchId)).toEqual({ side_a_score: 2, side_b_score: 1 });
    expect((await matchRow(matchId)).scorer_participant_id).toBe(
      fixture.people.minamiTaro.participantId
    );
  });

  test('ほかの人の担当が 4 分前なら、まだ断る', async () => {
    const matchId = await fixture.makeMatch();
    await setScorer(matchId, fixture.people.kitaTaro.participantId, 4);
    enterAs(fixture.people.minamiTaro.session);

    expect((await POST(scoreRequest(2, 1), contextOf(matchId))).status).toBe(409);
    expect(await savedScore(matchId)).toBeNull();
  });

  test('この大会の参加者でない人の点は 403 で、保存されない', async () => {
    const matchId = await fixture.makeMatch();
    enterAs(fixture.stranger);

    expect((await POST(scoreRequest(1, 0), contextOf(matchId))).status).toBe(403);
    expect(await savedScore(matchId)).toBeNull();
  });

  test('終了した試合は、担当に関わらず今までどおり 409（終了した試合です）', async () => {
    const matchId = await fixture.makeMatch('done');
    enterAs(fixture.people.minamiTaro.session);

    const response = await POST(scoreRequest(1, 0), contextOf(matchId));

    expect(response.status).toBe(409);
    expect((await response.json()).error).toContain('終了した試合');
  });
});
