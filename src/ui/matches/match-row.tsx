import { matchWinner, retiredSideOf } from '@/domain/match-rules';
import { playedGameScores } from '@/domain/scoring';
import { ClassChip } from '@/ui/components/class-chip';
import { RetiredNote } from '@/ui/components/retired-note';
import { YouTag } from '@/ui/components/you-tag';
import type { BoardMatch } from '@/ui/matches/types';

type Props = {
  match: BoardMatch;
};

/** 行の右側に出す得点。実際にプレーされたゲーム（0 対 0 の枠を除く）を連結する。 */
function scoreTextOf(match: BoardMatch): string | null {
  const games = playedGameScores(match.scores);
  if (games.length === 0) return null;
  return games.map((game) => `${game.sideAScore}-${game.sideBScore}`).join(' / ');
}

/** ペアの名前。まだ決まっていなければ空枠ラベル（例: 予選1位）、それも無ければ「未定」。 */
function pairNameOf(team: BoardMatch['teamA']): string {
  if (team.players.length > 0) return team.players.join('・');
  return team.slotLabel ?? '未定';
}

/** 勝った側は太字、負けた側はグレー。まだ勝ち負けが無ければそのまま。 */
function nameClassOf(side: 'A' | 'B', winner: 'A' | 'B' | null): string {
  if (winner === null) return '';
  return winner === side ? 'font-black' : 'text-gray-500';
}

/**
 * コートカードの中の 1 試合の行。**見るだけで、押しても何も起きない**
 * （得点を入れる場所は結果LIVE だけ。docs/specs/2026-10-14-matches-real-data.md の「決めたこと」1・2）。
 *
 * 勝った側は `matchWinner`（試合の勝ち負けを決める 1 か所）で決める。棄権は点数に関係なく相手の勝ち
 * なので、棄権した側には「（◯◯ 棄権）」を添えて、点数と勝ちが逆になっている理由を見せる。
 *
 * 印・部・「あなたの試合」を 1 行目、名前とスコアを 2 行目に分けている。
 * 3 ゲームの試合はスコアが長く（例: 16-21 / 21-23）、375px 幅では
 * 印・部・タグ・名前・スコアを 1 行に並べると横にはみ出すことが実測で分かったため。
 */
export function MatchRow({ match }: Props) {
  const winner =
    match.status === 'done' ? matchWinner(match.scores, match.maxGameCount, match.ending) : null;
  const retiredSide = match.status === 'done' ? retiredSideOf(match.ending) : null;
  const scoreText = scoreTextOf(match);

  return (
    <li
      data-testid={`match-row-${match.matchId}`}
      className={`flex w-full items-center py-[9px] text-left ${
        match.status === 'live' ? 'bg-accent-soft rounded-[10px] px-2' : ''
      }`}
    >
      <div className="flex w-full flex-col gap-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="tabular flex min-w-[58px] shrink-0 items-center justify-center rounded-full bg-gray-100 px-2 py-1 text-[11px] font-extrabold text-gray-500">
            {match.orderInCourt === null ? '順番未定' : `${match.orderInCourt}試合目`}
          </span>
          <ClassChip classLabel={match.classLabel} />
          {match.isMine && <YouTag />}
        </div>

        <div className="flex items-start gap-2">
          <span className="min-w-0 flex-1 text-left text-[14px] leading-snug font-bold break-words">
            <span className={nameClassOf('A', winner)}>{pairNameOf(match.teamA)}</span>
            {retiredSide === 'A' && (
              <>
                {' '}
                <RetiredNote names={match.teamA.players} />
              </>
            )}
            <span className="text-[11px] font-normal text-gray-400"> vs </span>
            <span className={nameClassOf('B', winner)}>{pairNameOf(match.teamB)}</span>
            {retiredSide === 'B' && (
              <>
                {' '}
                <RetiredNote names={match.teamB.players} />
              </>
            )}
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
    </li>
  );
}
