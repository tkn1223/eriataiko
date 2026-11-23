'use client';

import { useMemo } from 'react';
import { NavbarSubtitle } from '@/ui/navbar-subtitle';

/**
 * 上の帯の小見出し「対戦表 ・ 予選リーグ 3/6 対戦終了」。作りは進行表の `MatchesSubtitle` と同じ。
 * 予選の対戦が 1 つも無いときは「対戦表」だけ。
 */
export function BracketSubtitle({
  finishedCount,
  totalCount,
}: {
  finishedCount: number;
  totalCount: number;
}) {
  // 描き直しのたびに作り直すと、上の帯への差し込みを毎回やり直すので、値が変わったときだけ作る
  const content = useMemo(
    () => (
      <NavbarSubtitle>
        対戦表
        {totalCount > 0 && (
          <>
            {' ・ 予選リーグ '}
            <span className="tabular">
              {finishedCount}/{totalCount}
            </span>{' '}
            対戦終了
          </>
        )}
      </NavbarSubtitle>
    ),
    [finishedCount, totalCount]
  );
  return content;
}
