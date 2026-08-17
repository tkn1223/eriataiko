'use client';

import type { StandingRow, Team, TeamNumber } from '@/ui/bracket/sample-data';

type Props = {
  teams: Team[];
  rows: StandingRow[];
};

const TEAM_DOT_CLASS: Record<TeamNumber, string> = {
  1: 'bg-team-1',
  2: 'bg-team-2',
  3: 'bg-team-3',
  4: 'bg-team-4',
};

function teamName(teams: Team[], teamNumber: TeamNumber) {
  return teams.find((team) => team.number === teamNumber)?.name ?? '';
}

/**
 * 予選リーグの順位表（暫定）。
 * 順位 / チーム / 勝敗 / ゲーム / 得失点 の 5 列。自分のチームの行だけ強調する。
 */
export function StandingsTable({ teams, rows }: Props) {
  return (
    <div className="mb-5 rounded-2xl border border-gray-200 bg-white p-[14px]">
      <h2 className="mb-2 text-[15px] font-black">順位表（暫定）</h2>
      <div data-testid="standings-scroll" className="overflow-x-auto">
        {/* 5 列が潰れない最小幅。375px（iPhone SE）でも枠に収まる値にして、
            順位表だけ横に少し動く気持ち悪さを無くしている */}
        <table className="w-full min-w-[300px] border-collapse">
          <thead>
            <tr className="border-b border-gray-200">
              <th scope="col" className="py-1.5 text-left text-[11px] font-extrabold text-gray-500">
                順位
              </th>
              <th scope="col" className="py-1.5 text-left text-[11px] font-extrabold text-gray-500">
                チーム
              </th>
              <th
                scope="col"
                className="py-1.5 text-center text-[11px] font-extrabold text-gray-500"
              >
                勝敗
              </th>
              <th
                scope="col"
                className="py-1.5 text-center text-[11px] font-extrabold text-gray-500"
              >
                ゲーム
              </th>
              <th
                scope="col"
                className="py-1.5 text-center text-[11px] font-extrabold text-gray-500"
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
                className={`${index < rows.length - 1 ? 'border-b border-dashed border-gray-200' : ''} ${
                  row.isSelf ? 'bg-self-row' : ''
                }`}
              >
                <td className="py-2 text-[15px] font-extrabold">{row.rank}</td>
                <td className="py-2 text-left">
                  <span className="flex items-center gap-1 text-[14px] font-bold whitespace-nowrap">
                    <span
                      aria-hidden="true"
                      className={`size-[10px] shrink-0 rounded-[2px] ${TEAM_DOT_CLASS[row.teamNumber]}`}
                    />
                    {teamName(teams, row.teamNumber)}
                  </span>
                </td>
                <td className="tabular py-2 text-center text-[14px] font-bold">
                  {row.wins}勝{row.losses}敗
                </td>
                <td className="tabular py-2 text-center text-[14px] font-bold">
                  {row.gamesWon}-{row.gamesLost}
                </td>
                <td className="tabular py-2 text-center text-[14px] font-bold">
                  {row.pointDiff >= 0 ? '+' : ''}
                  {row.pointDiff}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-[10px] text-[12px] text-gray-500">
        順位は 勝敗 → ゲーム → 得失点 の順で決定
      </p>
    </div>
  );
}
