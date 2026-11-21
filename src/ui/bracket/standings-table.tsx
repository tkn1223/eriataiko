'use client';

import { teamBgClass } from '@/domain/class-labels';
import type { StandingRow, Team } from '@/ui/bracket/types';

type Props = {
  teams: Team[];
  rows: StandingRow[];
};

function teamName(teams: Team[], teamNumber: number) {
  return teams.find((team) => team.number === teamNumber)?.name ?? '';
}

/**
 * 予選リーグの順位表（暫定）。
 * 順位 / チーム / 勝敗 / ゲーム / 得失点 の 5 列。自分のチームの行だけ強調する。
 */
export function StandingsTable({ teams, rows }: Props) {
  return (
    <section className="court-card mb-3 rounded-[18px] p-3">
      <h2 className="mb-2 text-[16px] font-extrabold">順位表（暫定）</h2>
      <div data-testid="standings-scroll">
        {/* 横に動かす枠は作らない。5 列は 375px（iPhone SE）でも枠に収まる */}
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-line border-b">
              <th scope="col" className="text-muted-ink py-1.5 text-left text-[11px] font-semibold">
                順位
              </th>
              <th scope="col" className="text-muted-ink py-1.5 text-left text-[11px] font-semibold">
                チーム
              </th>
              <th
                scope="col"
                className="text-muted-ink py-1.5 text-center text-[11px] font-semibold"
              >
                勝敗
              </th>
              <th
                scope="col"
                className="text-muted-ink py-1.5 text-center text-[11px] font-semibold"
              >
                ゲーム
              </th>
              <th
                scope="col"
                className="text-muted-ink py-1.5 text-center text-[11px] font-semibold"
              >
                得失点
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr
                key={row.teamNumber}
                data-testid={`standing-row-${row.teamNumber}`}
                className={`${index < rows.length - 1 ? 'border-line border-b border-dashed' : ''} ${
                  row.isSelf ? 'bg-self-row' : ''
                }`}
              >
                <td className="py-2 text-[15px] font-extrabold">{row.rank}</td>
                <td className="py-2 text-left">
                  <span className="flex items-center gap-1 text-[13px] font-bold break-all">
                    <span
                      aria-hidden="true"
                      className={`size-[10px] shrink-0 rounded-[2px] ${teamBgClass(row.teamNumber)}`}
                    />
                    {teamName(teams, row.teamNumber)}
                  </span>
                </td>
                <td className="tabular py-2 text-center text-[13px] font-bold">
                  {row.wins}勝{row.losses}敗{row.draws > 0 ? `${row.draws}分` : ''}
                </td>
                <td className="tabular py-2 text-center text-[13px] font-bold">
                  {row.gamesWon}-{row.gamesLost}
                </td>
                <td className="tabular py-2 text-center text-[13px] font-bold">
                  {row.pointDiff >= 0 ? '+' : ''}
                  {row.pointDiff}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-muted-ink mt-[9px] text-[12px] leading-[1.65]">
        順位は 勝敗 → ゲーム → 得失点 の順で決定
      </p>
    </section>
  );
}
