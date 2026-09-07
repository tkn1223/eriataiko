'use client';

import { useState } from 'react';
import type { GameScore } from '@/domain/scoring';
import { UnsavedNotice } from '@/ui/components/unsaved-notice';
import { CourtLiveCard } from '@/ui/courts/court-live-card';
import type { Court, LiveScore } from '@/ui/courts/sample-data';

type Props = {
  courts: Court[];
  completedMatches: number;
  totalMatches: number;
};

/** 進行中のコートぶんだけ、見本データの値を得点の初期値にする。 */
function initialLiveScores(courts: Court[]): Record<number, LiveScore> {
  const entries = courts.flatMap((court) =>
    court.live ? [[court.courtNumber, { scores: court.live.scores, finished: false }] as const] : []
  );

  return Object.fromEntries(entries);
}

/**
 * 結果LIVE画面（トップ）。
 *
 * 表示だけを担当する。データの出どころ（DB かダミーか）は知らない。
 * 本物のデータをつなぐときは、渡す props を差し替えるだけでよい。
 *
 * 得点は複数のコートで同時に動く。進行表（1 件だけ選んで開く作り）と違い、
 * コート番号をキーにした状態をここで持つ。まだ保存する表が無いので、
 * 画面を閉じる（更新する）と消える（帯で明示する）。
 */
export function CourtsPage({ courts, completedMatches, totalMatches }: Props) {
  const [liveScores, setLiveScores] = useState<Record<number, LiveScore>>(() =>
    initialLiveScores(courts)
  );

  /**
   * 1 コート・1 ゲームの枠の得点を 1 点だけ動かす。
   *
   * 前の値から数える書き方（setState に関数を渡す）にしているので、
   * 「＋」を速く連打されても数えそこねない。
   */
  function changeScore(courtNumber: number, gameNumber: number, side: 'A' | 'B', delta: 1 | -1) {
    setLiveScores((prev) => {
      const current = prev[courtNumber];
      if (!current) return prev;

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

      return { ...prev, [courtNumber]: { ...current, scores } };
    });
  }

  /** 確認画面の「OK」で呼ばれる。そのコートを終了状態にする。 */
  function finishMatch(courtNumber: number) {
    setLiveScores((prev) => {
      const current = prev[courtNumber];
      if (!current) return prev;

      return { ...prev, [courtNumber]: { ...current, finished: true } };
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

      <div className="mb-[14px]">
        <UnsavedNotice />
      </div>

      <h2 className="mb-[10px] text-[15px] font-black">コートの状況</h2>

      <div className="flex flex-col gap-[10px]">
        {courts.map((court) => (
          <CourtLiveCard
            key={court.courtNumber}
            court={court}
            liveScore={liveScores[court.courtNumber] ?? null}
            onIncrement={(gameNumber, side) => changeScore(court.courtNumber, gameNumber, side, 1)}
            onDecrement={(gameNumber, side) => changeScore(court.courtNumber, gameNumber, side, -1)}
            onFinishMatch={() => finishMatch(court.courtNumber)}
          />
        ))}
      </div>
    </div>
  );
}
