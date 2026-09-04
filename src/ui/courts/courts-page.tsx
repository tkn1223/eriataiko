'use client';

import { useState } from 'react';
import { matchOutcome } from '@/domain/match-rules';
import { UnsavedNotice } from '@/ui/components/unsaved-notice';
import { CourtLiveCard } from '@/ui/courts/court-live-card';
import type { Court, GameScore, LiveScore } from '@/ui/courts/sample-data';

type Props = {
  courts: Court[];
  completedMatches: number;
  totalMatches: number;
};

/** 進行中のコートぶんだけ、見本データの値を得点の初期値にする。 */
function initialLiveScores(courts: Court[]): Record<number, LiveScore> {
  const entries = courts.flatMap((court) =>
    court.live
      ? [
          [
            court.courtNumber,
            {
              finishedGames: court.live.finishedGames,
              currentGame: court.live.currentGame,
              finished: false,
            },
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
   * 1 コートの得点を 1 点だけ動かす。
   *
   * 前の値から数える書き方（setState に関数を渡す）にしているので、
   * 「＋」を速く連打されても数えそこねない。
   */
  function changeScore(courtNumber: number, side: 'A' | 'B', delta: 1 | -1) {
    setLiveScores((prev) => {
      const current = prev[courtNumber];
      if (!current) return prev;
      const [a, b] = current.currentGame;
      // 押し間違いでマイナスの点にならないよう 0 で止める
      const currentGame: GameScore =
        side === 'A' ? [Math.max(0, a + delta), b] : [a, Math.max(0, b + delta)];

      return { ...prev, [courtNumber]: { ...current, currentGame } };
    });
  }

  /**
   * 確認画面の「OK」で呼ばれる。今のゲームを finishedGames に積み、次のゲームを 0-0 に戻す。
   * ゲーム数が上限に達した、またはどちらかが必要なゲーム数を取ったら、そのコートを終了状態にする。
   */
  function finishGame(courtNumber: number) {
    const maxGameCount = courts.find((court) => court.courtNumber === courtNumber)?.live
      ?.maxGameCount;
    if (maxGameCount == null) return;

    setLiveScores((prev) => {
      const current = prev[courtNumber];
      if (!current) return prev;
      const finishedGames = [...current.finishedGames, current.currentGame];

      return {
        ...prev,
        [courtNumber]: {
          finishedGames,
          currentGame: [0, 0],
          finished: matchOutcome(finishedGames, maxGameCount).finished,
        },
      };
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
            onIncrement={(side) => changeScore(court.courtNumber, side, 1)}
            onDecrement={(side) => changeScore(court.courtNumber, side, -1)}
            onFinishGame={() => finishGame(court.courtNumber)}
          />
        ))}
      </div>
    </div>
  );
}
