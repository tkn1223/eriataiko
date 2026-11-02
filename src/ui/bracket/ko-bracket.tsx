'use client';

import type { ReactNode } from 'react';
import { teamBgClass } from '@/domain/class-labels';
import type { Champion, KoBracketData, KoMatch, KoSlot } from '@/ui/bracket/types';

type Props = {
  data: KoBracketData;
};

/**
 * 決勝トーナメント（準決勝 → 決勝 → 優勝、と 3位決定戦）。
 *
 * 枠は、チームが入っていればチーム名（チーム色つき）、まだ空なら表に入っている空枠の名前
 * （「予選1位」など）を薄字で出す。予選の結果から自動で埋めることはしない。
 * 対戦の数字は中の試合の勝ち数（終わった試合だけ）。
 */
export function KoBracket({ data }: Props) {
  return (
    <div className="mb-5 rounded-2xl border border-gray-200 bg-white p-[14px]">
      {data.champion.decided && <ChampionBanner champion={data.champion} />}

      {!data.leagueFinished && (
        <p className="mb-3 text-[12px] font-bold text-gray-500">
          組み合わせは予選リーグ終了後に確定します
        </p>
      )}

      <div data-testid="ko-bracket-scroll" className="overflow-x-auto">
        <div className="flex items-stretch gap-4 pb-1">
          <Column title="準決勝">
            <div className="flex flex-1 flex-col justify-center gap-6">
              <KoBox match={data.semifinals[0]} />
              <KoBox match={data.semifinals[1]} />
            </div>
          </Column>
          <Column title="決勝">
            <div className="flex flex-1 flex-col justify-center">
              <KoBox match={data.final} />
            </div>
          </Column>
          <Column title="優勝">
            <div className="flex flex-1 flex-col justify-center">
              <ChampionBox champion={data.champion} />
            </div>
          </Column>
        </div>
      </div>

      <div className="mt-5">
        <h3 className="mb-2 text-[12px] font-extrabold tracking-[0.08em] text-gray-500">
          3位決定戦
        </h3>
        <KoBox match={data.thirdPlace} />
      </div>
    </div>
  );
}

/** 列の幅は中の箱（KoBox / ChampionBox）に任せる。2 か所に幅を書くとズレるため。 */
function Column({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex shrink-0 flex-col items-center gap-4">
      <h3 className="text-[12px] font-extrabold tracking-[0.08em] text-gray-500">{title}</h3>
      {children}
    </div>
  );
}

function ChampionBanner({ champion }: { champion: Champion }) {
  return (
    <div className="bg-ink mb-4 rounded-[14px] px-4 py-3 text-center text-[18px] font-black text-white">
      🏆 優勝：{champion.teamName}
    </div>
  );
}

function ChampionBox({ champion }: { champion: Champion }) {
  return (
    <div className="w-[150px] shrink-0 rounded-[10px] border border-gray-200 bg-white px-3 py-[7px] text-center">
      {champion.decided ? (
        <span className="text-[13.5px] font-black">{champion.teamName}</span>
      ) : (
        <span className="text-[12px] font-bold text-gray-400">優勝未定</span>
      )}
    </div>
  );
}

/** 終わった一戦の勝者。まだ終わっていない・引き分け・数字が無いときは null。 */
function winnerOf(match: KoMatch): 'a' | 'b' | null {
  if (match.status !== 'done' || match.scoreA === undefined || match.scoreB === undefined) {
    return null;
  }
  if (match.scoreA > match.scoreB) return 'a';
  if (match.scoreB > match.scoreA) return 'b';
  return null;
}

function KoBox({ match }: { match: KoMatch }) {
  const winner = winnerOf(match);

  return (
    <div
      data-testid={`ko-match-${match.id}`}
      data-status={match.status}
      className={`relative w-[205px] shrink-0 rounded-[10px] border bg-white text-[13.5px] ${
        match.status === 'live' ? 'border-accent' : 'border-gray-200'
      }`}
    >
      {match.status === 'live' && (
        <span className="bg-live absolute -top-2 right-2 rounded-full px-1.5 py-0.5 text-[9px] font-extrabold text-white">
          LIVE
        </span>
      )}
      <SlotRow
        slot={match.slotA}
        score={match.scoreA}
        scoreTestId="ko-score-a"
        isWinner={winner === 'a'}
        isDone={match.status === 'done'}
      />
      <div aria-hidden="true" className="border-t border-gray-200" />
      <SlotRow
        slot={match.slotB}
        score={match.scoreB}
        scoreTestId="ko-score-b"
        isWinner={winner === 'b'}
        isDone={match.status === 'done'}
      />
    </div>
  );
}

function SlotRow({
  slot,
  score,
  scoreTestId,
  isWinner,
  isDone,
}: {
  slot: KoSlot;
  score: number | undefined;
  scoreTestId: string;
  isWinner: boolean;
  isDone: boolean;
}) {
  const className = !slot.isDecided
    ? 'text-[12px] font-bold text-gray-400'
    : isDone
      ? isWinner
        ? 'text-[13.5px] font-black'
        : 'text-[13.5px] font-bold text-gray-400'
      : 'text-[13.5px] font-bold';

  return (
    <div className="flex items-center gap-1.5 px-3 py-[7px]">
      {slot.isDecided && (
        <span
          aria-hidden="true"
          data-testid="ko-team-dot"
          className={`size-[10px] shrink-0 rounded-[2px] ${teamBgClass(slot.teamNumber ?? null)}`}
        />
      )}
      <span className={`min-w-0 flex-1 break-words ${className}`}>{slot.label}</span>
      {score !== undefined && (
        <span data-testid={scoreTestId} className="tabular shrink-0 text-[13.5px] font-black">
          {score}
        </span>
      )}
    </div>
  );
}
