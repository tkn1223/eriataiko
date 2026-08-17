'use client';

import type { LeagueCard, Team, TeamNumber } from '@/ui/bracket/sample-data';

type Props = {
  teams: Team[];
  cards: LeagueCard[];
  onSelectCard: (card: LeagueCard) => void;
};

/** チーム番号 → 四角ドットの背景色クラス（globals.css の --color-team-1〜4）。 */
const TEAM_DOT_CLASS: Record<TeamNumber, string> = {
  1: 'bg-team-1',
  2: 'bg-team-2',
  3: 'bg-team-3',
  4: 'bg-team-4',
};

function findCard(cards: LeagueCard[], a: TeamNumber, b: TeamNumber) {
  return cards.find(
    (card) => (card.teamA === a && card.teamB === b) || (card.teamA === b && card.teamB === a)
  );
}

/**
 * 予選リーグの 4×4 星取表。
 *
 * 行・列とも同じチーム順で並べ、行チームから見た結果（勝ち/負け/進行中/未実施）を
 * マスに出す。対戦が無い組み合わせ（同じチーム同士や、まだ組んでいない相手）は空/「－」。
 */
export function LeagueMatrix({ teams, cards, onSelectCard }: Props) {
  return (
    <div className="mb-5 rounded-2xl border border-gray-200 bg-white p-[14px]">
      <div data-testid="league-matrix-scroll" className="overflow-x-auto">
        <table className="border-collapse">
          <thead>
            <tr>
              <th scope="col" className="p-1" />
              {teams.map((column) => (
                <th key={column.number} scope="col" className="p-1 align-bottom">
                  <TeamLabel team={column} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {teams.map((row) => (
              <tr key={row.number}>
                <th scope="row" className="p-1 text-left align-middle">
                  <TeamLabel team={row} />
                </th>
                {teams.map((column) => (
                  <td key={column.number} className="p-1">
                    {row.number === column.number ? (
                      <div
                        aria-hidden="true"
                        className="min-h-[52px] min-w-[56px] rounded-[10px]"
                      />
                    ) : (
                      <Cell
                        rowTeam={row}
                        columnTeam={column}
                        card={findCard(cards, row.number, column.number)}
                        onSelectCard={onSelectCard}
                      />
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-[10px] text-[12px] text-gray-500">
        ○＝カード勝利（数字はカード内の勝ち試合数）。タップで詳細。
      </p>
    </div>
  );
}

function TeamLabel({ team }: { team: Team }) {
  return (
    <span className="text-ink flex items-center gap-1 text-[12px] font-extrabold whitespace-nowrap">
      <span
        aria-hidden="true"
        className={`size-[10px] shrink-0 rounded-[2px] ${TEAM_DOT_CLASS[team.number]}`}
      />
      {team.name}
    </span>
  );
}

function Cell({
  rowTeam,
  columnTeam,
  card,
  onSelectCard,
}: {
  rowTeam: Team;
  columnTeam: Team;
  card: LeagueCard | undefined;
  onSelectCard: (card: LeagueCard) => void;
}) {
  if (!card) {
    return (
      <div className="flex min-h-[52px] min-w-[56px] items-center justify-center rounded-[10px] border border-gray-200 bg-gray-100 text-[12px] font-bold text-gray-400">
        －
      </div>
    );
  }

  // マスは「行チームから見て」表示する。カードの teamA/teamB のどちらが行チームかで数字を入れ替える。
  const isRowTeamA = card.teamA === rowTeam.number;
  const own = isRowTeamA ? card.gamesWonA : card.gamesWonB;
  const opponent = isRowTeamA ? card.gamesWonB : card.gamesWonA;

  return (
    <button
      type="button"
      onClick={() => onSelectCard(card)}
      aria-label={`${rowTeam.name} 対 ${columnTeam.name} の対戦`}
      className="flex min-h-[52px] min-w-[56px] flex-col items-center justify-center gap-0.5 rounded-[10px] border border-gray-200 bg-gray-100"
    >
      <CellMark card={card} own={own} opponent={opponent} />
      {(card.status === 'done' || card.status === 'live') && (
        <span className="tabular text-[12px] font-extrabold">
          {own}-{opponent}
        </span>
      )}
    </button>
  );
}

function CellMark({
  card,
  own,
  opponent,
}: {
  card: LeagueCard;
  own: number | undefined;
  opponent: number | undefined;
}) {
  if (card.status === 'live') {
    return <span className="text-live text-[10px] font-extrabold">試合中</span>;
  }
  if (card.status === 'waiting') {
    return <span className="text-[11px] font-bold text-gray-400">未</span>;
  }
  // 記号だけだと読み上げが「白丸」などになって意味が伝わらないので、role="img" と言葉を添える
  const won = (own ?? 0) > (opponent ?? 0);
  return won ? (
    <span role="img" aria-label="勝ち" className="text-accent text-[15px] font-black">
      ○
    </span>
  ) : (
    <span role="img" aria-label="負け" className="text-[15px] font-black text-gray-400">
      ●
    </span>
  );
}
