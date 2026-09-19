'use client';

import { useRef, useState } from 'react';
import { hasAnyPoint, type GameScore } from '@/domain/scoring';
import { UnsavedNotice } from '@/ui/components/unsaved-notice';
import { CourtLiveCard } from '@/ui/courts/court-live-card';
import { activeMatchId, type Court, type LiveScore } from '@/ui/courts/types';
import { useScoreSync } from '@/ui/courts/use-score-sync';

type Props = {
  courts: Court[];
  /** いまの段のラベル（例: '予選リーグ' → 決勝が始まると '決勝トーナメント'）。 */
  stageLabel: string;
  completedMatches: number;
  totalMatches: number;
  /**
   * 得点を押せる人（選手として入った人）かどうか。false（観戦者・未入場）のときは
   * どのコートも「−」「＋」「試合を終了する」を出さず、得点は数字で見せるだけ
   * （docs/specs/2026-09-19-courts-real-data.md の「決めたこと」3）。
   */
  canInput: boolean;
};

/** 試合の終了はまだ記録されない旨を、得点を入れる人（選手）にだけ出す。 */
const PLAYER_UNSAVED_NOTICE = '試合の終了はまだ記録されません（点は保存されます）';

/** 進行中のコートぶんだけ、渡された値を得点の初期値にする。 */
function initialLiveScores(courts: Court[]): Record<number, LiveScore> {
  const entries = courts.flatMap((court) =>
    court.live
      ? [
          [
            court.courtNumber,
            { scores: court.live.scores, finished: false, started: true },
          ] as const,
        ]
      : []
  );

  return Object.fromEntries(entries);
}

/**
 * 結果LIVE画面（トップ）。
 *
 * 表示だけを担当する。データの出どころ（DB かダミーか）は知らない。
 * 渡す props は `page.tsx` が DB から組み立てる（`src/usecases/build-courts-view.ts`）。
 *
 * 得点は複数のコートで同時に動く。進行表（1 件だけ選んで開く作り）と違い、
 * コート番号をキーにした状態をここで持つ。
 *
 * 押した点の保存は `use-score-sync.ts` に任せる（送る・送り直す・まとめる仕組みを
 * 画面の部品から切り離す。docs/specs/2026-09-19-save-score-from-courts.md の「つくりの方針」）。
 */
export function CourtsPage({
  courts,
  stageLabel,
  completedMatches,
  totalMatches,
  canInput,
}: Props) {
  const [liveScores, setLiveScores] = useState<Record<number, LiveScore>>(() =>
    initialLiveScores(courts)
  );
  const { sync, statusByMatchId } = useScoreSync();

  // 押した直後の得点を、描画を待たずに読める形でも持つ（画面に出すのは上の state）。
  //
  // 描画のたびに作り直される `liveScores` から次の値を計算すると、描き直される前に
  // 2 回目のタップが届いたとき、2 回とも同じ古い値から計算して 1 点落ちる
  // （e2e/courts.spec.ts の tapTenTimesAtOnce で 10 回押して 1 しか増えないのを確かめた）。
  // `setLiveScores(prev => ...)` の中で計算すれば数えそこねないが、そこで計算した値を
  // 外に持ち出して保存の入口に送ると、関数が呼ばれるのが「あとで」になることがあり送信が飛んだ。
  // そこで、押した時点でここから計算し、同じ値を state と保存の両方に渡す。
  // ここを書き換えるのは下の 2 つの関数（押したときに呼ばれる）だけ。
  const latestScoresRef = useRef(liveScores);

  function commitLiveScores(next: Record<number, LiveScore>) {
    latestScoresRef.current = next;
    setLiveScores(next);
  }

  /** 1 コート・1 ゲームの枠の得点を 1 点だけ動かし、その点数を保存の入口に送る。 */
  function changeScore(courtNumber: number, gameNumber: number, side: 'A' | 'B', delta: 1 | -1) {
    const court = courts.find((c) => c.courtNumber === courtNumber);
    const matchId = court ? activeMatchId(court, canInput) : null;

    const latest = latestScoresRef.current;
    const current = latest[courtNumber] ?? { scores: [], finished: false, started: false };
    const index = current.scores.findIndex((score) => score.gameNumber === gameNumber);
    const existing = current.scores[index] ?? { gameNumber, sideAScore: 0, sideBScore: 0 };
    // 押し間違いでマイナスの点にならないよう 0 で止める
    const updated: GameScore =
      side === 'A'
        ? { ...existing, sideAScore: Math.max(0, existing.sideAScore + delta) }
        : { ...existing, sideBScore: Math.max(0, existing.sideBScore + delta) };
    const scores =
      index >= 0
        ? current.scores.map((score, i) => (i === index ? updated : score))
        : [...current.scores, updated];
    // 入口は 1 点入った時点で試合を LIVE にし、0 対 0 に戻しても呼出待ちには戻さない
    // （src/usecases/save-score.ts）。画面もそれに合わせ、一度入ったら LIVE のままにする。
    const started = current.started || hasAnyPoint(scores);

    commitLiveScores({ ...latest, [courtNumber]: { ...current, scores, started } });

    if (matchId) {
      sync({
        matchId,
        gameNumber,
        sideAScore: updated.sideAScore,
        sideBScore: updated.sideBScore,
      });
    }
  }

  /** 確認画面の「OK」で呼ばれる。そのコートを終了状態にする（保存は 1-d の宿題）。 */
  function finishMatch(courtNumber: number) {
    const latest = latestScoresRef.current;
    const current = latest[courtNumber];
    if (!current) return;

    commitLiveScores({ ...latest, [courtNumber]: { ...current, finished: true } });
  }

  return (
    <div className="mx-auto max-w-md px-4 py-4">
      <h1 className="mb-[14px] text-[18px] font-black">結果LIVE</h1>

      <div className="mb-[14px] flex flex-wrap items-center gap-2">
        <span className="bg-ink inline-flex items-center rounded-full px-3 py-1 text-[13px] font-extrabold text-white">
          {stageLabel}
        </span>
        <span className="tabular text-[13px] font-bold text-gray-400">
          {completedMatches}/{totalMatches} 試合消化
        </span>
      </div>

      {canInput && (
        <div className="mb-[14px]">
          <UnsavedNotice text={PLAYER_UNSAVED_NOTICE} />
        </div>
      )}

      <h2 className="mb-[10px] text-[15px] font-black">コートの状況</h2>

      <div className="flex flex-col gap-[10px]">
        {courts.map((court) => {
          const matchId = activeMatchId(court, canInput);
          return (
            <CourtLiveCard
              key={court.courtNumber}
              court={court}
              liveScore={liveScores[court.courtNumber] ?? null}
              canInput={canInput}
              syncStatus={matchId ? (statusByMatchId[matchId] ?? null) : null}
              onIncrement={(gameNumber, side) =>
                changeScore(court.courtNumber, gameNumber, side, 1)
              }
              onDecrement={(gameNumber, side) =>
                changeScore(court.courtNumber, gameNumber, side, -1)
              }
              onFinishMatch={() => finishMatch(court.courtNumber)}
            />
          );
        })}
      </div>
    </div>
  );
}
