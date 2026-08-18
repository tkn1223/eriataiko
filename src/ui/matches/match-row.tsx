import type { CourtMatch } from '@/ui/matches/sample-data';

type Props = {
  match: CourtMatch;
  onSelect: () => void;
};

const CLASS_TEXT_CLASS: Record<CourtMatch['classLabel'], string> = {
  '1部': 'text-class-1',
  '2部': 'text-class-2',
  '3部': 'text-class-3',
};

const CLASS_BG_CLASS: Record<CourtMatch['classLabel'], string> = {
  '1部': 'bg-class-1-bg',
  '2部': 'bg-class-2-bg',
  '3部': 'bg-class-3-bg',
};

/** 終わった試合のゲーム得点を見て、どちらが勝ったかを返す（引き分けは無い前提）。 */
function winnerOf(match: CourtMatch): 'A' | 'B' | null {
  if (match.status !== 'done') return null;
  const aWins = match.finishedGames.filter(([a, b]) => a > b).length;
  const bWins = match.finishedGames.filter(([a, b]) => b > a).length;
  if (aWins === bWins) return null;
  return aWins > bWins ? 'A' : 'B';
}

/** 行の右側に出す得点。終わったゲームに、進行中なら現在のゲームも足して連結する。 */
function scoreTextOf(match: CourtMatch): string | null {
  const games = [...match.finishedGames, ...(match.currentGame ? [match.currentGame] : [])];
  if (games.length === 0) return null;
  return games.map(([a, b]) => `${a}-${b}`).join(' / ');
}

/**
 * コートカードの中の 1 試合の行。
 * 進行中の試合だけ押せて、得点入力シートを開く。
 *
 * 印・部・「あなたの試合」を 1 行目、名前とスコアを 2 行目に分けている。
 * 3 ゲームの試合はスコアが長く（例: 16-21 / 21-23）、375px 幅では
 * 印・部・タグ・名前・スコアを 1 行に並べると横にはみ出すことが実測で分かったため。
 */
export function MatchRow({ match, onSelect }: Props) {
  const winner = winnerOf(match);
  const scoreText = scoreTextOf(match);
  const clickable = match.status === 'live';

  const content = (
    <div className="flex w-full flex-col gap-1">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="tabular flex min-w-[58px] shrink-0 items-center justify-center rounded-full bg-gray-100 px-2 py-1 text-[11px] font-extrabold text-gray-500">
          {match.orderInCourt}試合目
        </span>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-extrabold ${CLASS_TEXT_CLASS[match.classLabel]} ${CLASS_BG_CLASS[match.classLabel]}`}
        >
          {match.classLabel}
        </span>
        {match.isMine && (
          <span className="bg-accent shrink-0 rounded-[5px] px-1.5 py-0.5 text-[11px] font-extrabold whitespace-nowrap text-white">
            あなたの試合
          </span>
        )}
      </div>

      <div className="flex items-start gap-2">
        <span className="min-w-0 flex-1 text-left text-[14px] leading-snug font-bold break-words">
          <span className={winner === 'B' ? 'text-gray-500' : winner === 'A' ? 'font-black' : ''}>
            {match.teamA.players.join('・')}
          </span>
          <span className="text-[11px] font-normal text-gray-400"> vs </span>
          <span className={winner === 'A' ? 'text-gray-500' : winner === 'B' ? 'font-black' : ''}>
            {match.teamB.players.join('・')}
          </span>
        </span>

        <span className="shrink-0 text-right">
          {scoreText && (
            <span className="tabular text-accent block text-[12px] font-extrabold">
              {scoreText}
            </span>
          )}
          {match.status === 'live' && (
            <span className="text-live inline-flex items-center gap-1 text-[11px] font-extrabold tracking-[0.08em]">
              <span aria-hidden="true" className="bg-live animate-blink size-1.5 rounded-full" />
              LIVE
            </span>
          )}
        </span>
      </div>
    </div>
  );

  const className = `flex w-full items-center py-[9px] text-left ${
    match.status === 'live' ? 'bg-accent-soft rounded-[10px] px-2' : ''
  }`;

  if (!clickable) {
    return (
      <li data-testid={`match-row-${match.id}`} className={className}>
        {content}
      </li>
    );
  }

  return (
    <li data-testid={`match-row-${match.id}`}>
      <button
        type="button"
        onClick={onSelect}
        aria-label={`${match.teamA.players.join('・')} 対 ${match.teamB.players.join('・')} の試合`}
        className={`min-h-11 ${className}`}
      >
        {content}
      </button>
    </li>
  );
}
