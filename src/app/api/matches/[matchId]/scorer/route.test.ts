import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('@/server/session', () => ({ getSession: vi.fn() }));

import { DELETE, POST } from '@/app/api/matches/[matchId]/scorer/route';
import { getSupabaseAdminClient } from '@/db/admin';
import { getSession, type Session } from '@/server/session';
import {
  createScorerFixture,
  type ScorerFixture,
} from '../../../../../../tests/helpers/match-scorer-fixture';

/**
 * 担当を取る・やめる入口を、本物の DB とセッションの偽物で確かめる。
 * 偽物にするのは「誰が入場しているか」だけ。判断（usecases）も書き込み（db）も本物。
 *
 * 仕様: docs/specs/2026-10-14-match-scorer.md
 * 実行前に `npm run db:start` が必要。
 */
const mockedGetSession = vi.mocked(getSession);
const admin = getSupabaseAdminClient();

let fixture: ScorerFixture;
beforeAll(async () => {
  fixture = await createScorerFixture(870000 + Math.floor(Math.random() * 1000) * 10);
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

function claimRequest(body?: unknown) {
  return new Request('http://localhost/api/matches/x/scorer', {
    method: 'POST',
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function scorerOf(matchId: string) {
  const { data } = await admin
    .from('matches')
    .select('scorer_participant_id, scorer_last_scored_at')
    .eq('id', matchId)
    .single();
  return data!;
}

/** この試合の記録のうち、テストの人（印付きの名前）のものを古い順に。 */
async function logsOf(matchId: string) {
  const { data } = await admin
    .from('write_logs')
    .select('player_name, action, action_detail')
    .like('player_name', `${fixture.tag}-%`)
    .eq('action_detail->>matchId', matchId)
    .order('id', { ascending: true });
  return data ?? [];
}

/** 担当の時刻をずらす（「5 分たった」を作る）。 */
async function setLastScoredAt(matchId: string, minutesAgo: number) {
  await admin
    .from('matches')
    .update({ scorer_last_scored_at: new Date(Date.now() - minutesAgo * 60_000).toISOString() })
    .eq('id', matchId);
}

describe('入場の確かめ', () => {
  test('入場していない人が担当を取ろうとすると 401', async () => {
    enterAs(null);
    const matchId = await fixture.makeMatch();

    const response = await POST(claimRequest(), contextOf(matchId));

    expect(response.status).toBe(401);
    expect((await scorerOf(matchId)).scorer_participant_id).toBeNull();
  });

  test('観戦者が担当を取ろうとすると 403', async () => {
    enterAs({ role: 'viewer' });
    const matchId = await fixture.makeMatch();

    const response = await POST(claimRequest(), contextOf(matchId));

    expect(response.status).toBe(403);
    expect((await scorerOf(matchId)).scorer_participant_id).toBeNull();
  });

  test('観戦者が担当をやめようとしても 403（担当は外れない）', async () => {
    const matchId = await fixture.makeMatch();
    await admin
      .from('matches')
      .update({
        scorer_participant_id: fixture.people.minamiTaro.participantId,
        scorer_last_scored_at: new Date().toISOString(),
      })
      .eq('id', matchId);
    enterAs({ role: 'viewer' });

    const response = await DELETE(claimRequest(), contextOf(matchId));

    expect(response.status).toBe(403);
    expect((await scorerOf(matchId)).scorer_participant_id).toBe(
      fixture.people.minamiTaro.participantId
    );
  });
});

describe('担当を取る', () => {
  test('空いている試合は、本文なしでも取れる。担当と時刻が入り、scorer.claim が残る', async () => {
    enterAs(fixture.people.minamiTaro.session);
    const matchId = await fixture.makeMatch();

    const response = await POST(claimRequest(), contextOf(matchId));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, outcome: 'claimed' });
    const scorer = await scorerOf(matchId);
    expect(scorer.scorer_participant_id).toBe(fixture.people.minamiTaro.participantId);
    expect(scorer.scorer_last_scored_at).not.toBeNull();
    expect(await logsOf(matchId)).toEqual([
      expect.objectContaining({
        player_name: fixture.people.minamiTaro.session.playerName,
        action: 'scorer.claim',
      }),
    ]);
  });

  test('呼出待ちの試合でも取れる', async () => {
    enterAs(fixture.people.minamiTaro.session);
    const matchId = await fixture.makeMatch('waiting');

    const response = await POST(claimRequest({ takeOver: false }), contextOf(matchId));

    expect(response.status).toBe(200);
  });

  test('もう自分が担当なら、押し直しても成功し、記録は増えない', async () => {
    enterAs(fixture.people.minamiTaro.session);
    const matchId = await fixture.makeMatch();
    await POST(claimRequest(), contextOf(matchId));

    const again = await POST(claimRequest(), contextOf(matchId));

    expect(await again.json()).toEqual({ ok: true, outcome: 'already-mine' });
    expect(await logsOf(matchId)).toHaveLength(1);
  });

  test('ほかの人が 5 分以内に担当中なら、引き継ぐと言わない限り 409 で、担当は変わらない（理由にチーム名つきの名前）', async () => {
    const matchId = await fixture.makeMatch();
    enterAs(fixture.people.kitaTaro.session);
    await POST(claimRequest(), contextOf(matchId));
    enterAs(fixture.people.minamiTaro.session);

    const response = await POST(claimRequest({ takeOver: false }), contextOf(matchId));

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: expect.stringContaining('愛知北のたろうさんが入力しています'),
      code: 'scorer-active',
    });
    expect((await scorerOf(matchId)).scorer_participant_id).toBe(
      fixture.people.kitaTaro.participantId
    );
  });

  test('引き継ぐと明示すれば取れる。scorer.takeover に前の担当の名前が残る', async () => {
    const matchId = await fixture.makeMatch();
    enterAs(fixture.people.kitaTaro.session);
    await POST(claimRequest(), contextOf(matchId));
    enterAs(fixture.people.minamiTaro.session);

    const response = await POST(claimRequest({ takeOver: true }), contextOf(matchId));

    expect(await response.json()).toEqual({ ok: true, outcome: 'took-over' });
    expect((await scorerOf(matchId)).scorer_participant_id).toBe(
      fixture.people.minamiTaro.participantId
    );
    const logs = await logsOf(matchId);
    expect(logs.at(-1)).toEqual(
      expect.objectContaining({
        player_name: fixture.people.minamiTaro.session.playerName,
        action: 'scorer.takeover',
        action_detail: { matchId, from: '愛知北のたろう' },
      })
    );
  });

  test('引き継がれた前の担当も、引き継ぎ直せる', async () => {
    const matchId = await fixture.makeMatch();
    enterAs(fixture.people.kitaTaro.session);
    await POST(claimRequest(), contextOf(matchId));
    enterAs(fixture.people.minamiTaro.session);
    await POST(claimRequest({ takeOver: true }), contextOf(matchId));
    enterAs(fixture.people.kitaTaro.session);

    const response = await POST(claimRequest({ takeOver: true }), contextOf(matchId));

    expect(response.status).toBe(200);
    expect((await scorerOf(matchId)).scorer_participant_id).toBe(
      fixture.people.kitaTaro.participantId
    );
  });

  test('ほかの人の担当が 5 分たっていれば、引き継ぐと言わなくても取れる（scorer.claim）', async () => {
    const matchId = await fixture.makeMatch();
    enterAs(fixture.people.kitaTaro.session);
    await POST(claimRequest(), contextOf(matchId));
    await setLastScoredAt(matchId, 5);
    enterAs(fixture.people.minamiTaro.session);

    const response = await POST(claimRequest(), contextOf(matchId));

    expect(await response.json()).toEqual({ ok: true, outcome: 'claimed' });
    expect((await scorerOf(matchId)).scorer_participant_id).toBe(
      fixture.people.minamiTaro.participantId
    );
    expect((await logsOf(matchId)).at(-1)?.action).toBe('scorer.claim');
  });

  test('ほかの人の担当が 4 分前なら、まだ取れない', async () => {
    const matchId = await fixture.makeMatch();
    enterAs(fixture.people.kitaTaro.session);
    await POST(claimRequest(), contextOf(matchId));
    await setLastScoredAt(matchId, 4);
    enterAs(fixture.people.minamiTaro.session);

    const response = await POST(claimRequest(), contextOf(matchId));

    expect(response.status).toBe(409);
  });

  test('終了した試合では取れない（409）', async () => {
    enterAs(fixture.people.minamiTaro.session);
    const matchId = await fixture.makeMatch('done');

    const response = await POST(claimRequest(), contextOf(matchId));

    expect(response.status).toBe(409);
    expect((await scorerOf(matchId)).scorer_participant_id).toBeNull();
  });

  test('参加者でない人は取れない（403）', async () => {
    enterAs(fixture.stranger);
    const matchId = await fixture.makeMatch();

    const response = await POST(claimRequest(), contextOf(matchId));

    expect(response.status).toBe(403);
  });

  test('無い試合は 404、uuid でない文字列でも 404（500 にならない）', async () => {
    enterAs(fixture.people.minamiTaro.session);

    expect(
      (await POST(claimRequest(), contextOf('00000000-0000-4000-8000-000000000000'))).status
    ).toBe(404);
    expect((await POST(claimRequest(), contextOf('まだ決まっていない'))).status).toBe(404);
  });

  test('takeOver が true / false でなければ 400', async () => {
    enterAs(fixture.people.minamiTaro.session);
    const matchId = await fixture.makeMatch();

    const response = await POST(claimRequest({ takeOver: 'はい' }), contextOf(matchId));

    expect(response.status).toBe(400);
  });

  test('同時に空の担当を取りに来た 2 人のうち、担当になるのは 1 人だけ（もう 1 人は 409）', async () => {
    const matchId = await fixture.makeMatch();
    // セッションは呼び出しごとに読まれるので、同時に 2 人を入場させるため人ごとに順に差し替える
    mockedGetSession
      .mockResolvedValueOnce(fixture.people.minamiTaro.session)
      .mockResolvedValueOnce(fixture.people.kitaTaro.session);

    const responses = await Promise.all([
      POST(claimRequest(), contextOf(matchId)),
      POST(claimRequest(), contextOf(matchId)),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
  });
});

describe('担当をやめる', () => {
  test('自分が担当なら、やめると担当も時刻も空になり、scorer.release が残る', async () => {
    enterAs(fixture.people.minamiTaro.session);
    const matchId = await fixture.makeMatch();
    await POST(claimRequest(), contextOf(matchId));

    const response = await DELETE(claimRequest(), contextOf(matchId));

    expect(await response.json()).toEqual({ ok: true, outcome: 'released' });
    expect(await scorerOf(matchId)).toEqual({
      scorer_participant_id: null,
      scorer_last_scored_at: null,
    });
    expect((await logsOf(matchId)).at(-1)).toEqual(
      expect.objectContaining({ action: 'scorer.release' })
    );
  });

  test('ほかの人が担当中なら、やめられない（409）。担当は外れない', async () => {
    const matchId = await fixture.makeMatch();
    enterAs(fixture.people.kitaTaro.session);
    await POST(claimRequest(), contextOf(matchId));
    enterAs(fixture.people.minamiTaro.session);

    const response = await DELETE(claimRequest(), contextOf(matchId));

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: expect.stringContaining('愛知北のたろうさんが担当しています'),
      code: 'not-scorer',
    });
    expect((await scorerOf(matchId)).scorer_participant_id).toBe(
      fixture.people.kitaTaro.participantId
    );
  });

  test('誰も担当でなければ、何も変えずに成功し、記録も残さない', async () => {
    enterAs(fixture.people.minamiTaro.session);
    const matchId = await fixture.makeMatch();

    const response = await DELETE(claimRequest(), contextOf(matchId));

    expect(await response.json()).toEqual({ ok: true, outcome: 'already-vacant' });
    expect(await logsOf(matchId)).toEqual([]);
  });

  test('やめたあとは、ほかの人が確認なしで取れる', async () => {
    const matchId = await fixture.makeMatch();
    enterAs(fixture.people.kitaTaro.session);
    await POST(claimRequest(), contextOf(matchId));
    await DELETE(claimRequest(), contextOf(matchId));
    enterAs(fixture.people.minamiTaro.session);

    const response = await POST(claimRequest(), contextOf(matchId));

    expect(response.status).toBe(200);
  });
});
