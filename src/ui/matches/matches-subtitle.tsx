'use client';

import { useMemo } from 'react';
import { NavbarSubtitle } from '@/ui/navbar-subtitle';

/**
 * 上の帯の小見出し「進行表 ・ 予選リーグ 27/72 試合」。
 * 数え方は試合速報の小見出しと同じ（`build-courts-view.ts` の `currentStageProgress`）。
 * 段が 1 つも無いときは「進行表」だけ。
 */
export function MatchesSubtitle({
  stageLabel,
  completedMatches,
  totalMatches,
}: {
  stageLabel: string;
  completedMatches: number;
  totalMatches: number;
}) {
  // 描き直しのたびに作り直すと、上の帯への差し込みを毎回やり直すので、値が変わったときだけ作る
  const content = useMemo(
    () => (
      <NavbarSubtitle>
        進行表
        {stageLabel !== '' && (
          <>
            {' ・ '}
            {stageLabel}{' '}
            <span className="tabular">
              {completedMatches}/{totalMatches}
            </span>{' '}
            試合
          </>
        )}
      </NavbarSubtitle>
    ),
    [stageLabel, completedMatches, totalMatches]
  );
  return content;
}
