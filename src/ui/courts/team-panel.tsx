import type { ReactNode } from 'react';
import { teamPanelClasses } from '@/domain/class-labels';
import type { CourtTeam } from '@/ui/courts/types';

/**
 * 得点板の枠 1 枚。上に 5px のチーム色の帯。チーム名（14/800）・選手名（1 人 1 行、16/800）・大きな点数。
 *
 * 試合速報と、進行表の詳しい画面・直す画面で**同じ見た目を使う**ので、ここに 1 か所だけ置く
 * （2 か所に持つと、片方だけ直して同じ得点板が画面によって違って見える）。
 * 直す画面は点の数字を押せるようにし、変えた点の下に「元は ◯」を出すので、
 * `scoreSlot`（点の数字の代わり）と `footer`（点の下）を差し込める。
 */
export function TeamPanel({
  testId,
  team,
  score,
  scoreSlot,
  footer,
}: {
  testId: string;
  team: CourtTeam;
  score: number;
  scoreSlot?: ReactNode;
  footer?: ReactNode;
}) {
  const colors = teamPanelClasses(team.teamNumber);
  return (
    <div
      data-testid={testId}
      className={`team-panel min-w-0 rounded-[14px] border-t-[5px] px-1.5 pt-2.5 pb-1.5 text-center ${colors.border} ${colors.tint}`}
    >
      {team.teamName && (
        <p className={`text-[14px] font-extrabold break-words ${colors.text}`}>{team.teamName}</p>
      )}
      <div className="mt-0.5 text-[16px] leading-[1.35] font-extrabold">
        {team.players.length > 0 ? (
          team.players.map((name, index) => (
            <p key={index} className="break-words">
              {name}
            </p>
          ))
        ) : (
          <p className="break-words">{team.slotLabel ?? ''}</p>
        )}
      </div>
      {scoreSlot ?? <p className="score-number mt-1 mb-0.5">{score}</p>}
      {footer}
    </div>
  );
}
