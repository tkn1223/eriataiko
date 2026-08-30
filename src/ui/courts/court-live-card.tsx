import { ClassChip } from '@/ui/components/class-chip';
import { YouTag } from '@/ui/components/you-tag';
import type { Court, CourtTeam, LiveScore, NextMatch, TeamNumber } from '@/ui/courts/types';

type Props = {
  court: Court;
  /** 進行中のコートだけ渡される、ページが持つ得点の状態。 */
  liveScore: LiveScore | null;
  /** 観戦者には ＋/− を出さない（押しても 403 になるだけなので）。 */
  canEdit: boolean;
  onIncrement: (gameNumber: number, side: 'A' | 'B') => void;
  onDecrement: (gameNumber: number, side: 'A' | 'B') => void;
};

/** チーム番号 → 背景色クラス（globals.css の @theme で定義した --color-team-1〜4）。 */
const TEAM_BG_CLASS: Record<TeamNumber, string> = {
  1: 'bg-team-1',
  2: 'bg-team-2',
  3: 'bg-team-3',
  4: 'bg-team-4',
};

/**
 * コート 1 面ぶんのカード。
 *
 * 進行中なら得点をその場で押せる形、空いていれば「呼出待ち」「予定なし」を出す。
 * 得点の状態はここでは持たない（同時に動く複数コートぶんをまとめて courts-page が持つ）。
 *
 * `max_game_count` 個ぶんゲームの枠を並べる。「ゲーム終了」ボタンは無い
 * （終了は今回はつながない。docs/specs/2026-08-30-courts-live-scores.md）。
 */
export function CourtLiveCard({ court, liveScore, canEdit, onIncrement, onDecrement }: Props) {
  if (!court.live) {
    return <IdleCourtCard court={court} />;
  }

  const { live, next } = court;
  // 得点が渡ってこなかったときも試合そのものは出す。
  // ここで「予定なし」に化けると、進行中のコートが黙って消えてしまう。
  const games = liveScore?.games ?? live.games;

  return (
    <div
      data-testid={`court-card-${court.courtNumber}`}
      className={`border-accent flex flex-col gap-[7px] rounded-[14px] border bg-white px-[14px] py-3 ${
        live.isMine ? 'ring-accent ring-2' : ''
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="text-[18px] font-black tracking-[0.04em]">コート{court.courtNumber}</span>
        {live.status === 'live' && (
          <span className="text-live ml-auto inline-flex items-center gap-1 text-[11px] font-extrabold tracking-[0.08em]">
            <span aria-hidden="true" className="bg-live animate-blink size-2 rounded-full" />
            LIVE
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <ClassChip classLabel={live.classLabel} />
        <span className="text-[11px] font-bold whitespace-nowrap text-gray-400">
          {live.roundLabel}
        </span>
        {live.isMine && <YouTag />}
      </div>

      <div className="flex flex-col gap-3">
        {games.map((game, index) => (
          <GameRow
            key={index}
            gameNumber={index + 1}
            teamA={live.teamA}
            teamB={live.teamB}
            score={game}
            canEdit={canEdit}
            onIncrement={(side) => onIncrement(index + 1, side)}
            onDecrement={(side) => onDecrement(index + 1, side)}
          />
        ))}
      </div>

      {next && <NextRow next={next} />}
    </div>
  );
}

function GameRow({
  gameNumber,
  teamA,
  teamB,
  score,
  canEdit,
  onIncrement,
  onDecrement,
}: {
  gameNumber: number;
  teamA: CourtTeam;
  teamB: CourtTeam;
  score: [number, number];
  canEdit: boolean;
  onIncrement: (side: 'A' | 'B') => void;
  onDecrement: (side: 'A' | 'B') => void;
}) {
  const [scoreA, scoreB] = score;

  return (
    <div className="flex flex-col gap-[7px]">
      <span className="text-[11px] font-bold text-gray-400">第{gameNumber}ゲーム目</span>
      <TeamRow
        team={teamA}
        score={scoreA}
        canEdit={canEdit}
        onIncrement={() => onIncrement('A')}
        onDecrement={() => onDecrement('A')}
      />
      <TeamRow
        team={teamB}
        score={scoreB}
        canEdit={canEdit}
        onIncrement={() => onIncrement('B')}
        onDecrement={() => onDecrement('B')}
      />
    </div>
  );
}

function TeamRow({
  team,
  score,
  canEdit,
  onIncrement,
  onDecrement,
}: {
  team: CourtTeam;
  score: number;
  canEdit: boolean;
  onIncrement: () => void;
  onDecrement: () => void;
}) {
  const name = team.players.join('・');

  return (
    <div className="flex items-center justify-between gap-2">
      <span className="flex min-w-0 items-center gap-1.5">
        <span
          aria-hidden="true"
          className={`size-2.5 shrink-0 rounded-[3px] ${TEAM_BG_CLASS[team.number]}`}
        />
        <span className="min-w-0 text-[14px] font-bold break-words">{name}</span>
      </span>

      {/* ＋− は指の腹より大きい 46px 角。得点は桁が増えても位置が動かないよう幅を固定する。 */}
      <span className="grid shrink-0 grid-cols-[46px_46px_auto] items-center gap-1.5">
        {canEdit ? (
          <>
            <button
              type="button"
              onClick={onDecrement}
              aria-label={`${name}の得点を1減らす`}
              className="flex size-[46px] items-center justify-center rounded-[12px] border border-gray-300 text-[20px] font-bold text-gray-400"
            >
              −
            </button>
            <button
              type="button"
              onClick={onIncrement}
              aria-label={`${name}の得点を1増やす`}
              className="text-ink flex size-[46px] items-center justify-center rounded-[12px] border border-gray-300 text-[20px] font-bold"
            >
              ＋
            </button>
          </>
        ) : (
          <span aria-hidden="true" className="col-span-2" />
        )}
        <span className="tabular text-accent min-w-[60px] text-right text-[36px] font-extrabold">
          {score}
        </span>
      </span>
    </div>
  );
}

function NextRow({ next }: { next: NextMatch }) {
  return (
    <div className="mt-1 border-t border-dashed border-gray-200 pt-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="shrink-0 rounded-[5px] bg-gray-400 px-1.5 py-0.5 text-[11px] font-extrabold whitespace-nowrap text-white">
          次
        </span>
        <ClassChip classLabel={next.classLabel} />
        <span className={`text-[13px] font-bold ${next.isMine ? 'text-accent' : ''}`}>
          {next.teamA.players.join('・')} vs {next.teamB.players.join('・')}
        </span>
      </div>
    </div>
  );
}

function IdleCourtCard({ court }: { court: Court }) {
  return (
    <div
      data-testid={`court-card-${court.courtNumber}`}
      className="flex flex-col gap-[7px] rounded-[14px] border border-gray-200 bg-white px-[14px] py-3"
    >
      <span className="text-[18px] font-black tracking-[0.04em]">コート{court.courtNumber}</span>

      <p className="py-3 text-center text-[13px] font-bold text-gray-400">
        {court.next ? '呼出待ち' : '予定なし'}
      </p>

      {court.next && <NextRow next={court.next} />}
    </div>
  );
}
