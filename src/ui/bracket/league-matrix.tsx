'use client';

import { teamBgClass } from '@/domain/class-labels';
import type { LeagueCard, Team } from '@/ui/bracket/types';

type Props = {
  teams: Team[];
  cards: LeagueCard[];
  onSelectCard: (card: LeagueCard) => void;
  /** 自分のチームの番号。チームに入っていない人（観戦者など）は無い。 */
  selfTeamNumber?: number;
  /** 自分のチームの名前。右上の札に出す。自分のチームが無ければ無い。 */
  selfTeamName?: string;
};

function findCard(cards: LeagueCard[], a: number, b: number) {
  return cards.find(
    (card) => (card.teamA === a && card.teamB === b) || (card.teamA === b && card.teamB === a)
  );
}

/**
 * 予選リーグの 4×4 星取表。
 *
 * 行・列とも同じチーム順で並べ、行チームから見た結果（勝ち/負け/引き分け/進行中/未実施）を
 * マスに出す。対戦が無い組み合わせは「－」、同じチーム同士は斜めの縞（押せない）。
 * 列の幅は表を等分する（table-fixed）。375px でも 4 チーム分が横に動かさずに収まるように、
 * 横に動かす枠は作らない。
 */
export function LeagueMatrix({ teams, cards, onSelectCard, selfTeamNumber, selfTeamName }: Props) {
  return (
    <section className="court-card mb-3 rounded-[18px] p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-[16px] font-extrabold">星取表</h2>
        {selfTeamName !== undefined && (
          <span className="text-gold-ink bg-gold-soft border-gold-mine rounded-md border px-2 py-[5px] text-[11px] font-bold">
            自分：{selfTeamName}
          </span>
        )}
      </div>
      <p className="text-muted-ink text-[12px] leading-[1.7]">
        左のチームから見た結果です。マスを押すと中身が見られます。
      </p>

      <div data-testid="league-matrix-scroll">
        <table className="my-1.5 w-full table-fixed border-separate border-spacing-[3px]">
          <thead>
            <tr>
              <th scope="col" className="w-[63px]" />
              {teams.map((column) => (
                <th key={column.number} scope="col" className="p-0 align-bottom">
                  <TeamLabel team={column} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {teams.map((row) => {
              const isSelf = row.number === selfTeamNumber;
              return (
                <tr key={row.number}>
                  <th
                    scope="row"
                    className={`p-0 text-left align-middle ${isSelf ? 'bg-gold-soft rounded-[7px]' : ''}`}
                  >
                    <TeamLabel team={row} />
                    {isSelf && (
                      <small className="text-gold-ink block pl-2.5 text-[11px] font-semibold">
                        自分
                      </small>
                    )}
                  </th>
                  {teams.map((column) => (
                    <td key={column.number} className="p-0">
                      {row.number === column.number ? (
                        <div aria-hidden="true" className="cell-diag min-h-[54px]" />
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
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="border-line border-t pt-2 text-[12px] leading-[1.7]">
        <p className="text-ink-3 font-semibold">○ 勝ち　● 負け　△ 引き分け　未 未実施</p>
        <p className="text-muted-ink">数字は、対戦内の勝ち試合数です。</p>
      </div>
    </section>
  );
}

function TeamLabel({ team }: { team: Team }) {
  return (
    <span className="text-ink flex items-center gap-[3px] text-[11px] leading-tight font-extrabold tracking-[-0.5px] break-all">
      <span
        aria-hidden="true"
        className={`size-[7px] shrink-0 rounded-[2px] ${teamBgClass(team.number)}`}
      />
      {team.name}
    </span>
  );
}

const CELL_BASE =
  'flex min-h-[54px] w-full flex-col items-center justify-center gap-px rounded-[9px] border text-[12px] font-bold';

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
    return <div className={`${CELL_BASE} border-line bg-fill-row text-gray-400`}>－</div>;
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
      className={`${CELL_BASE} ${cellToneClass(card, own, opponent)}`}
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

/** 終わった対戦で、行チームが勝ったか。勝ち試合数が同じなら引き分け（standings.ts の matchupResult と同じ決め方）。 */
function rowResult(own: number | undefined, opponent: number | undefined) {
  const ownWins = own ?? 0;
  const opponentWins = opponent ?? 0;
  if (ownWins === opponentWins) return 'draw';
  return ownWins > opponentWins ? 'win' : 'loss';
}

function cellToneClass(card: LeagueCard, own: number | undefined, opponent: number | undefined) {
  if (card.status === 'live') return 'bg-status-live border-cell-live-line text-status-live-ink';
  if (card.status === 'waiting') return 'bg-fill-row border-line text-ink-3';
  // 勝ちだけ金。負け・引き分けは灰色
  return rowResult(own, opponent) === 'win'
    ? 'bg-gold-soft border-gold-mine text-gold-ink'
    : 'bg-fill-row border-line text-ink-2';
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
    return <span className="text-[11px] font-extrabold">試合中</span>;
  }
  if (card.status === 'waiting') {
    return <span className="text-[12px] font-bold">未</span>;
  }
  // 記号だけだと読み上げが「白丸」などになって意味が伝わらないので、role="img" と言葉を添える
  const result = rowResult(own, opponent);
  if (result === 'draw') {
    return (
      <span role="img" aria-label="引き分け" className="text-[17px] leading-5 font-black">
        △
      </span>
    );
  }
  return result === 'win' ? (
    <span role="img" aria-label="勝ち" className="text-[17px] leading-5 font-black">
      ○
    </span>
  ) : (
    <span role="img" aria-label="負け" className="text-[17px] leading-5 font-black">
      ●
    </span>
  );
}
