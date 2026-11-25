'use client';

import { classColorClasses, teamBgClass, teamPanelClasses } from '@/domain/class-labels';
import type { CardMatch, CardStatus, LeagueCard, Team } from '@/ui/bracket/types';
import { BottomSheet } from '@/ui/components/bottom-sheet';
import { RetiredNote } from '@/ui/components/retired-note';

type Props = {
  card: LeagueCard | null;
  teams: Team[];
  /** 自分のチームの番号。いれば結果の箱で「自分のチーム」を添える。 */
  selfTeamNumber?: number;
  onClose: () => void;
};

function teamName(teams: Team[], teamNumber: number) {
  return teams.find((team) => team.number === teamNumber)?.name ?? '';
}

const RESULT_STATUS_TEXT: Record<CardStatus, string> = {
  done: '終了した対戦',
  live: '試合中の対戦',
  waiting: 'まだの対戦',
};

/**
 * 真ん中に出す文字。
 * まだやっていない対戦を「0-0」と書くと「0 対 0 で終わった」と読めてしまうので「vs」にする。
 */
function scoreTextOf(card: LeagueCard) {
  if (card.gamesWonA === undefined || card.gamesWonB === undefined) return 'vs';
  return `${card.gamesWonA}-${card.gamesWonB}`;
}

/** 終わった対戦の一言。勝ち試合数が同じなら引き分け（standings.ts の matchupResult と同じ決め方）。 */
function verdictOf(card: LeagueCard, teams: Team[]): string | null {
  if (card.status !== 'done' || card.gamesWonA === undefined || card.gamesWonB === undefined) {
    return null;
  }
  if (card.gamesWonA === card.gamesWonB) return '△ 引き分け';
  const winnerNumber = card.gamesWonA > card.gamesWonB ? card.teamA : card.teamB;
  return `○ ${teamName(teams, winnerNumber)}の勝利`;
}

/**
 * 星取表のマスを押したときに下から出る詳細シート。
 * 背景の暗い部分・「閉じる」・「星取表に戻る」・Esc のどれでも閉じる。
 */
export function CardDetailSheet({ card, teams, selfTeamNumber, onClose }: Props) {
  if (!card) return null;

  const verdict = verdictOf(card, teams);

  return (
    <BottomSheet
      open
      labelledBy="card-detail-title"
      onClose={onClose}
      header={
        <h2 id="card-detail-title" className="text-[15px] font-black">
          予選リーグ・対戦詳細
        </h2>
      }
    >
      <div
        data-testid="card-result"
        className="border-result-line mb-3.5 rounded-[15px] border bg-white px-2.5 py-3.5 text-center"
      >
        <p className="text-gold-ink-soft mb-2 text-[12px]">{RESULT_STATUS_TEXT[card.status]}</p>
        <div className="grid grid-cols-[1fr_80px_1fr] items-center">
          <ResultSide
            name={teamName(teams, card.teamA)}
            teamNumber={card.teamA}
            isSelf={card.teamA === selfTeamNumber}
          />
          {/* 行の高さを詰める（leading-none）と、Android の字体（Noto Sans JP）では数字の上下が
              入れ物から 7px はみ出して切れた。1.4 倍あれば収まる（公開前の画面テストで見つかった） */}
          <p
            data-testid="card-result-score"
            className="tabular text-[34px] leading-[1.4] font-extrabold tracking-[-1px]"
          >
            {scoreTextOf(card)}
          </p>
          <ResultSide
            name={teamName(teams, card.teamB)}
            teamNumber={card.teamB}
            isSelf={card.teamB === selfTeamNumber}
          />
        </div>
        {verdict && <p className="text-gold-ink mt-2.5 text-[13px] font-extrabold">{verdict}</p>}
      </div>

      <ul className="flex flex-col gap-2">
        {card.matches.map((match) => (
          <CardMatchRow key={match.id} match={match} card={card} />
        ))}
      </ul>

      <button
        type="button"
        onClick={onClose}
        className="btn-end mt-3 h-12 w-full rounded-xl text-[14px] font-bold"
      >
        星取表に戻る
      </button>
    </BottomSheet>
  );
}

function ResultSide({
  name,
  teamNumber,
  isSelf,
}: {
  name: string;
  teamNumber: number;
  isSelf: boolean;
}) {
  const panel = teamPanelClasses(teamNumber);
  return (
    <div className={`min-w-0 border-t-[3px] pt-2 ${panel.border}`}>
      <span className={`block text-[14px] font-bold break-words ${panel.text}`}>{name}</span>
      {isSelf && (
        <small className="text-gold-ink mt-1 block text-[11px] font-semibold">自分のチーム</small>
      )}
    </div>
  );
}

const MATCH_STATUS_TEXT: Record<CardStatus, string> = {
  done: '終了',
  live: '試合中',
  waiting: '未実施',
};

function CardMatchRow({ match, card }: { match: CardMatch; card: LeagueCard }) {
  const classColors = classColorClasses(match.classLabel.colorNumber);
  const hasGames = match.status !== 'waiting' && match.gamesWonA !== undefined;
  // 勝ったほうを太字にするのは、終わった試合だけ（進行中はまだ決まっていない）。
  // 勝ちは usecase が matchWinner で決めて渡す（棄権は点数と逆になるので、ここでゲーム数から決めない）
  const aWins = match.status === 'done' && match.winner === 'A';
  const bWins = match.status === 'done' && match.winner === 'B';
  const retiredNames =
    match.retiredSide === 'A'
      ? match.teamAPlayers
      : match.retiredSide === 'B'
        ? match.teamBPlayers
        : [];

  return (
    <li
      data-testid={`card-match-${match.id}`}
      className="border-line rounded-xl border bg-white px-3 py-2.5"
    >
      <div className="mb-2 flex items-center justify-between text-[11px]">
        <span
          className={`rounded-full px-2 py-0.5 font-bold ${classColors.text} ${classColors.tint}`}
        >
          {match.classLabel.name}
        </span>
        {match.status === 'live' ? (
          <span className="bg-status-live text-status-live-ink rounded-full px-2 py-0.5 font-extrabold">
            {MATCH_STATUS_TEXT.live}
          </span>
        ) : (
          <span className="text-ink-3 font-bold">{MATCH_STATUS_TEXT[match.status]}</span>
        )}
      </div>
      <PlayerLine
        teamNumber={card.teamA}
        names={match.teamAPlayers}
        games={hasGames ? match.gamesWonA : undefined}
        testId="games-a"
        emphasis={aWins ? 'win' : bWins ? 'lose' : 'none'}
      />
      <PlayerLine
        teamNumber={card.teamB}
        names={match.teamBPlayers}
        games={hasGames ? match.gamesWonB : undefined}
        testId="games-b"
        emphasis={bWins ? 'win' : aWins ? 'lose' : 'none'}
      />
      <RetiredNote names={retiredNames} />
    </li>
  );
}

function PlayerLine({
  teamNumber,
  names,
  games,
  testId,
  emphasis,
}: {
  teamNumber: number;
  names: string[];
  games: number | undefined;
  testId: string;
  emphasis: 'win' | 'lose' | 'none';
}) {
  return (
    <div className="flex items-center gap-1.5 py-[3px]">
      <span
        aria-hidden="true"
        className={`size-[7px] shrink-0 rounded-[2px] ${teamBgClass(teamNumber)}`}
      />
      <span
        className={`min-w-0 flex-1 text-[13px] break-words ${
          emphasis === 'win'
            ? 'font-black'
            : emphasis === 'lose'
              ? 'font-bold text-gray-500'
              : 'font-bold'
        }`}
      >
        {names.join('・')}
      </span>
      <span
        data-testid={testId}
        className={`tabular shrink-0 text-[16px] font-black ${emphasis === 'lose' ? 'text-gray-500' : ''}`}
      >
        {games ?? '―'}
      </span>
    </div>
  );
}
