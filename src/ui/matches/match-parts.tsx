import { teamBgClass, teamPanelClasses } from '@/domain/class-labels';
import type { CourtStatus } from '@/ui/matches/court-summary';
import type { BoardMatch } from '@/ui/matches/types';

/**
 * 進行表の画面（コートのカード・試合の行・詳しい画面）が共有する小さな部品。
 * 同じ見た目を画面ごとに書き直さないよう、ここに 1 か所だけ置く。
 * チーム・部の色は `src/domain/class-labels.ts` から引く（ここに色の対応表を持たない）。
 */

type Team = BoardMatch['teamA'];

/** ペアの名前。まだ決まっていなければ空枠ラベル（例: 予選1位）、それも無ければ「未定」。 */
export function pairNameOf(team: Team): string {
  if (team.players.length > 0) return team.players.join('・');
  return team.slotLabel ?? '未定';
}

/** 出場者がまだ決まっていない側か（決勝の「予選1位」など）。 */
export function isUndecided(team: Team): boolean {
  return team.players.length === 0;
}

/** 名前の左の、チーム色の四角。未定の枠は灰色。 */
export function TeamSwatch({ team, size }: { team: Team; size: 9 | 10 }) {
  const color = isUndecided(team) ? 'bg-btn-line-round' : teamBgClass(team.teamNumber);
  const sizeClass = size === 10 ? 'size-2.5' : 'size-[9px]';
  return <span aria-hidden="true" className={`${sizeClass} shrink-0 rounded-[3px] ${color}`} />;
}

/** 選手名の右に添える、チーム名（チームの文字色）。 */
export function TeamNameTag({ team }: { team: Team }) {
  if (!team.teamName) return null;
  const colors = teamPanelClasses(team.teamNumber);
  return (
    <span className={`shrink-0 text-[11px] font-bold whitespace-nowrap ${colors.text}`}>
      {team.teamName}
    </span>
  );
}

/** 自分が出る側に付ける、金の小さな点。 */
export function MineDot() {
  return <span role="img" aria-label="あなた" className="bg-gold size-1.5 shrink-0 rounded-full" />;
}

/** 棄権の札。myページの棄権と同じ濃い金。 */
export function RetiredBadge() {
  return (
    <span className="bg-gold-soft text-gold-ink shrink-0 rounded-[5px] px-1.5 py-px text-[10.5px] font-extrabold whitespace-nowrap">
      棄権
    </span>
  );
}

const COURT_STATUS_LABELS: Record<CourtStatus, string> = {
  live: '試合中',
  waiting: '呼出中',
  finished: '全試合終了',
};

const COURT_STATUS_CLASSES: Record<CourtStatus, string> = {
  live: 'bg-status-live text-status-live-ink',
  waiting: 'bg-status-wait text-status-wait-ink',
  finished: 'bg-[#efede9] text-[#555]',
};

/** コートの状態の札（試合中・呼出中・全試合終了）。試合中だけ緑の点が付く。 */
export function CourtStatusPill({ status, label }: { status: CourtStatus; label?: string }) {
  return (
    <span
      data-testid="court-status"
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-bold whitespace-nowrap ${COURT_STATUS_CLASSES[status]}`}
    >
      {status === 'live' && (
        <span aria-hidden="true" className="bg-status-live-dot size-2 rounded-full" />
      )}
      {label ?? COURT_STATUS_LABELS[status]}
    </span>
  );
}

/** 試合 1 つの状態の札。終了は灰色。 */
export function MatchStatusPill({ status }: { status: BoardMatch['status'] }) {
  if (status === 'live') return <CourtStatusPill status="live" />;
  if (status === 'waiting') return <CourtStatusPill status="waiting" label="これから" />;
  return <CourtStatusPill status="finished" label="終了" />;
}

/** 進み具合の線の色。自分の出番（mine）は金。 */
export function segmentClass(
  kind: 'done' | 'live' | 'calling' | 'upcoming',
  mine: boolean
): string {
  if (mine) return 'bg-gold';
  if (kind === 'done') return 'bg-[#8f897f]';
  if (kind === 'live') return 'bg-status-live-dot';
  if (kind === 'calling') return 'bg-[#e0a93a]';
  return 'bg-[#e7e3dc]';
}
