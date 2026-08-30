'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CourtLiveCard } from '@/ui/courts/court-live-card';
import { useLiveScores, type GameScoreChange } from '@/ui/courts/use-live-scores';
import type { Court, GameScore, LiveScore } from '@/ui/courts/types';

type Props = {
  courts: Court[];
  /** 見出しの「◯/◯ 試合消化」。終わった試合の数と、いまの大会の試合の数（行を数えただけ）。 */
  completedMatches: number;
  totalMatches: number;
  /** 観戦者には ＋/− を出さない（押しても 403 になるだけなので）。 */
  canEdit: boolean;
};

/** 進行中のコートぶんだけ、渡された値を得点の初期値にする。matchId をキーにする。 */
function toLiveScores(courts: Court[]): Record<string, LiveScore> {
  const entries = courts.flatMap((court) =>
    court.live ? [[court.live.matchId, { games: court.live.games }] as const] : []
  );
  return Object.fromEntries(entries);
}

async function postScore(matchId: string, gameNumber: number, score: GameScore): Promise<void> {
  const response = await fetch(`/api/matches/${matchId}/scores`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ gameNumber, sideAScore: score[0], sideBScore: score[1] }),
  });
  if (response.ok) return;

  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  throw new Error(body?.error ?? '保存に失敗しました。少し待ってからやり直してください。');
}

/**
 * 結果LIVE画面（トップ）。
 *
 * 表示と「押したらすぐ画面を動かし、裏で保存する」を担当する。
 * データの出どころ（Server Component が読んだ初期値、Realtime の更新）は知らない。
 *
 * 得点は複数のコートで同時に動く。進行表（1 件だけ選んで開く作り）と違い、
 * 試合 ID をキーにした状態をここで持つ。
 *
 * 送信中の試合は、DB から読み直した値（props の更新）でも Realtime の値でも
 * 上書きしない。連打で先に送った分があとから失敗しても、あとの成功した値を
 * 巻き戻さないようにするため（docs/specs/2026-08-30-courts-live-scores.md）。
 */
export function CourtsPage({ courts, completedMatches, totalMatches, canEdit }: Props) {
  const router = useRouter();
  const [liveScores, setLiveScores] = useState<Record<string, LiveScore>>(() =>
    toLiveScores(courts)
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // matchId ごとに「いま何件送信中か」。0 より大きい間は、他の入力元（props / Realtime）で
  // 上書きしない。＋と−がほぼ同時に届くこともあるので真偽値ではなく数で持つ。
  const pendingCountRef = useRef<Record<string, number>>({});
  // 画面に出ている得点と同じ中身を ref にも持つ。連打されると再描画の前に次の指が来るので、
  // 「1 つ前の押下を含んだ最新の点数」をその場で読めるようにしておく。
  const liveScoresRef = useRef(liveScores);

  const commitLiveScores = useCallback((next: Record<string, LiveScore>) => {
    liveScoresRef.current = next;
    setLiveScores(next);
  }, []);

  // Server Component が新しい courts を渡してきたとき（他の試合の Realtime 更新を拾って
  // router.refresh() したときや、保存に失敗して読み直したときなど）に取り込む。
  // 送信中の試合だけは、確定していない値で上書きしないよう素通りする。
  useEffect(() => {
    const next = { ...liveScoresRef.current };
    for (const court of courts) {
      if (!court.live) continue;
      const matchId = court.live.matchId;
      if ((pendingCountRef.current[matchId] ?? 0) > 0) continue;
      next[matchId] = { games: court.live.games };
    }
    commitLiveScores(next);
  }, [courts, commitLiveScores]);

  const { connectionStatus } = useLiveScores({
    onGameScoreChange: (change: GameScoreChange) => {
      const current = liveScoresRef.current[change.matchId];
      if (!current) return; // 画面に出ていない試合（次の試合など）は無視
      if ((pendingCountRef.current[change.matchId] ?? 0) > 0) return; // 自分の送信中
      const index = change.gameNumber - 1;
      if (index < 0 || index >= current.games.length) return;
      const games = [...current.games];
      games[index] = [change.sideAScore, change.sideBScore];
      commitLiveScores({ ...liveScoresRef.current, [change.matchId]: { games } });
    },
  });

  function changeScore(matchId: string, gameNumber: number, side: 'A' | 'B', delta: 1 | -1) {
    const current = liveScoresRef.current[matchId];
    if (!current) return;
    const index = gameNumber - 1;
    const [a, b] = current.games[index] ?? [0, 0];
    // 押し間違いでマイナスの点にならないよう 0 で止める
    const pair: GameScore =
      side === 'A' ? [Math.max(0, a + delta), b] : [a, Math.max(0, b + delta)];
    const games = [...current.games];
    games[index] = pair;
    commitLiveScores({ ...liveScoresRef.current, [matchId]: { games } });

    // 保存は state の更新関数の外で始める。中に置くと、React が更新関数を
    // 2 回呼んだとき（StrictMode や描き直し）に同じ点が 2 回送られる。
    // 送るのは「いまの点数」なので、同じ試合が二重に送られても壊れない
    // （docs/specs/2026-08-29-score-input-backend.md の「決めたこと」）。
    pendingCountRef.current[matchId] = (pendingCountRef.current[matchId] ?? 0) + 1;
    postScore(matchId, gameNumber, pair)
      // 前の失敗の帯を出しっぱなしにしない。保存できたのに赤い帯が残ると、
      // 得点係は入った点まで疑って押し直してしまう。
      .then(() => setErrorMessage(null))
      .catch((error: unknown) => {
        setErrorMessage(error instanceof Error ? error.message : '保存に失敗しました。');
        // 覚えておいた「押す前の値」には戻さない。連打中に別の送信が先に成功していると、
        // 古い値へ戻すことでその成功分まで巻き戻ってしまう。DB の本当の値で描き直す。
        router.refresh();
      })
      .finally(() => {
        pendingCountRef.current[matchId] = Math.max(0, (pendingCountRef.current[matchId] ?? 1) - 1);
      });
  }

  return (
    <div className="mx-auto max-w-md px-4 py-4">
      <h1 className="mb-[14px] text-[18px] font-black">結果LIVE</h1>

      <div className="mb-[14px] flex flex-wrap items-center gap-2">
        <span className="bg-ink inline-flex items-center rounded-full px-3 py-1 text-[13px] font-extrabold text-white">
          予選リーグ
        </span>
        <span className="tabular text-[13px] font-bold text-gray-400">
          {completedMatches}/{totalMatches} 試合消化
        </span>
      </div>

      {connectionStatus === 'disconnected' && (
        <div
          role="alert"
          className="text-accent bg-accent-soft mb-[14px] rounded-[10px] px-3 py-2 text-[12px] font-extrabold"
        >
          つながっていません。画面を更新してください。
        </div>
      )}

      {errorMessage && (
        <div
          role="alert"
          className="text-accent bg-accent-soft mb-[14px] rounded-[10px] px-3 py-2 text-[12px] font-extrabold"
        >
          {errorMessage}
        </div>
      )}

      <h2 className="mb-[10px] text-[15px] font-black">コートの状況</h2>

      <div className="flex flex-col gap-[10px]">
        {courts.map((court) => (
          <CourtLiveCard
            key={court.courtNumber}
            court={court}
            liveScore={court.live ? (liveScores[court.live.matchId] ?? null) : null}
            canEdit={canEdit}
            onIncrement={(gameNumber, side) => {
              if (court.live) changeScore(court.live.matchId, gameNumber, side, 1);
            }}
            onDecrement={(gameNumber, side) => {
              if (court.live) changeScore(court.live.matchId, gameNumber, side, -1);
            }}
          />
        ))}
      </div>
    </div>
  );
}
