'use client';

import { Fragment, useState } from 'react';
import { canFinishMatch, leadingSide, matchOutcome, winnerOfGame } from '@/domain/match-rules';
import { hasAnyPoint, playedGameScores, type GameScore } from '@/domain/scoring';
import { ClassChip } from '@/ui/components/class-chip';
import { YouTag } from '@/ui/components/you-tag';
import type {
  Court,
  CourtTeam,
  LiveMatch,
  LiveScore,
  NextMatch,
  ScoreSyncStatus,
  TeamNumber,
} from '@/ui/courts/types';
import { FinishConfirmSheet, type FinishConfirmGame } from '@/ui/courts/finish-confirm-sheet';

type Props = {
  court: Court;
  /** 進行中（または、あとで説明する「昇格中」）のコートだけ渡される、ページが持つ得点の状態。 */
  liveScore: LiveScore | null;
  /**
   * 得点を押せる人（選手として入った人）かどうか。false（観戦者）のときは
   * 「−」「＋」「試合を終了する」を出さず、得点は数字で見せるだけにする
   * （docs/specs/2026-09-19-courts-real-data.md の「決めたこと」3）。
   */
  canInput: boolean;
  /** 送る・送り直す仕組み（use-score-sync.ts）から見た、いまの保存状況。無ければ null。 */
  syncStatus: ScoreSyncStatus | null;
  onIncrement: (gameNumber: number, side: 'A' | 'B') => void;
  onDecrement: (gameNumber: number, side: 'A' | 'B') => void;
  /** 確認画面で「OK」が押されたときに呼ばれる。実際に試合を終了する処理はページ側が持つ。 */
  onFinishMatch: () => void;
};

/**
 * 呼出待ちの次の試合を、進行中の試合と同じ形にして扱えるようにする。
 *
 * 呼出待ちのコートにも次の試合の得点の枠を出し、最初の1点で LIVE の見た目に切り替える
 * （docs/specs/2026-09-19-save-score-from-courts.md の「決めたこと」1）。
 * 実際の得点はページ側の `liveScore` が持つので、ここでは 0 対 0（枠だけ）にしておく。
 */
function nextAsLiveMatch(next: NextMatch): LiveMatch {
  return {
    matchId: next.matchId,
    classLabel: next.classLabel,
    roundLabel: next.roundLabel,
    teamA: next.teamA,
    teamB: next.teamB,
    isMine: next.isMine,
    scores: [],
    maxGameCount: next.maxGameCount,
  };
}

/** その枠（gameNumber）の得点。無ければまだ点が入っていない 0 対 0 の枠として扱う。 */
function frameScore(scores: GameScore[], gameNumber: number): GameScore {
  return (
    scores.find((score) => score.gameNumber === gameNumber) ?? {
      gameNumber,
      sideAScore: 0,
      sideBScore: 0,
    }
  );
}

/** 「2-0」のような、勝った側を先に書く表記にする。 */
function winnerFirstScoreText(wonGames: [number, number], winner: 'A' | 'B'): string {
  return winner === 'A' ? `${wonGames[0]}-${wonGames[1]}` : `${wonGames[1]}-${wonGames[0]}`;
}

/** 決まっていれば選手名、まだなら対戦の空枠ラベル（「予選1位」など）を出す。 */
function teamDisplayName(team: CourtTeam): string {
  return team.players.length > 0 ? team.players.join('・') : (team.slotLabel ?? '');
}

/**
 * ペア名を画面に出す。1 人ぶんの名前の中では折り返さず、「・」や「vs」の区切りでだけ折り返す。
 *
 * 日本語は文字のどこでも折り返せるうえ、名簿には「小早川　日下部」「長谷川 一二三」のように
 * 空白入りの名前がある。何もしないと 375px の「次」の行で「小早川」と「日下部」が別の行に分かれ、
 * 2 人の名前に読めてしまった（e2e/courts.spec.ts で実測）。1 人の名前は 1 行に収まる長さなので、
 * 人ごとに nowrap にしてもはみ出さない。
 * 文字列としてのペア名（読み上げ用のラベル・確認画面）は teamDisplayName を使う。
 */
function PairName({ team }: { team: CourtTeam }) {
  if (team.players.length === 0) return <>{team.slotLabel ?? ''}</>;
  return team.players.map((name, index) => (
    <Fragment key={index}>
      {index > 0 && '・'}
      <span className="whitespace-nowrap">{name}</span>
    </Fragment>
  ));
}

/** チーム番号 → 背景色クラス（globals.css の @theme で定義した --color-team-1〜4）。 */
const TEAM_BG_CLASS: Record<TeamNumber, string> = {
  1: 'bg-team-1',
  2: 'bg-team-2',
  3: 'bg-team-3',
  4: 'bg-team-4',
};

/** チームがまだ決まっていない側は灰色にする（崩れないよう色は必ず何か置く）。 */
function teamBgClass(team: CourtTeam): string {
  return team.teamNumber ? TEAM_BG_CLASS[team.teamNumber] : 'bg-gray-300';
}

/**
 * コート 1 面ぶんのカード。
 *
 * 上限ゲーム数ぶんの枠を最初から並べ、どの枠も押せる形にする
 * （docs/specs/2026-09-04-finish-match.md、PR #52 レビュー指摘1）。
 * 表に「そのゲームが終わった印」を持たない方針なので、「終わったゲーム」
 * 「進行中のゲーム」を分けず、0 対 0 かどうかだけで見分ける。
 *
 * 得点の状態はここでは持たない（同時に動く複数コートぶんをまとめて courts-page が持つ）。
 */
export function CourtLiveCard({
  court,
  liveScore,
  canInput,
  syncStatus,
  onIncrement,
  onDecrement,
  onFinishMatch,
}: Props) {
  // 「試合を終了する」を押したときの確認画面。誤タップの歯止めがこれ 1 つしか無いので、
  // ここで開く・閉じるを持つ。
  const [sheetOpen, setSheetOpen] = useState(false);
  // 0対0・同点で押したときの案内。押し直す（得点を動かす）まで出したままにする。
  const [notice, setNotice] = useState<string | null>(null);

  // 進行中が無く、選手（canInput）で次の試合があれば、そこにも点の枠を出す
  // （docs/specs/2026-09-19-save-score-from-courts.md の「決めたこと」1）。
  // 「次の次」は無いので、ここで昇格させた試合の下にはもう「次」を出さない。
  const promotedFromNext = !court.live && canInput ? court.next : null;
  const resolvedLive = court.live ?? (promotedFromNext ? nextAsLiveMatch(promotedFromNext) : null);
  const next = court.live ? court.next : null;

  if (!resolvedLive) {
    return <IdleCourtCard court={court} />;
  }
  // ここから先は必ず値がある（handleFinishClick などの入れ子の関数からも null を疑わなくてよい）。
  const live = resolvedLive;

  // 得点が渡ってこなかったときも試合そのものは出す。
  // ここで「予定なし」に化けると、進行中のコートが黙って消えてしまう。
  const { scores, finished } = liveScore ?? { scores: live.scores, finished: false };
  // 呼出待ちから昇格した試合は、まだ 1 点も入っていない間は「呼出待ち」の見た目のまま。
  // 最初の 1 点で LIVE に切り替わる（同じ判定を入口側も使う。src/usecases/save-score.ts）。
  const isPromotedWaiting = !court.live && !hasAnyPoint(scores);

  const teamAName = teamDisplayName(live.teamA);
  const teamBName = teamDisplayName(live.teamB);

  const frames = Array.from({ length: live.maxGameCount }, (_, index) =>
    frameScore(scores, index + 1)
  );

  // 確認画面・終了後の「勝ち: ◯◯（2-0）」は、どちらもプレーされたゲームから同じ関数で求める。
  // 勝ちペアは outcome.winner ではなく leadingSide で決める。終了は人が押したときだけなので、
  // 決勝（上限3ゲーム）を 1-0 のまま終了することがあり、そのとき outcome.winner はまだ null。
  // ここで null のまま出すと、確認画面にも終了後のカードにも勝ちペアが出ない。
  const outcome = matchOutcome(scores, live.maxGameCount);
  const winnerSide = leadingSide(outcome.wonGames);
  const matchWinnerName = winnerSide === 'A' ? teamAName : winnerSide === 'B' ? teamBName : null;
  const matchWinnerScoreText = winnerSide
    ? winnerFirstScoreText(outcome.wonGames, winnerSide)
    : null;

  // 確認画面にも終了後のチップにも「実際にプレーされたゲーム」だけを出す（0 対 0 の枠は出さない）。
  const playedGames = playedGameScores(scores);

  const confirmGames: FinishConfirmGame[] = playedGames.map((score) => {
    const winner = winnerOfGame(score);
    return {
      gameNumber: score.gameNumber,
      sideAScore: score.sideAScore,
      sideBScore: score.sideBScore,
      winnerLabel: winner === 'A' ? teamAName : winner === 'B' ? teamBName : '引き分け',
    };
  });

  function handleFinishClick() {
    if (!hasAnyPoint(scores)) {
      setNotice('まだ点が入っていません');
      return;
    }
    const result = canFinishMatch(scores, live.maxGameCount);
    if (!result.ok) {
      setNotice(result.reason);
      return;
    }
    setNotice(null);
    setSheetOpen(true);
  }

  function handleOk() {
    setSheetOpen(false);
    onFinishMatch();
  }

  function handleIncrement(gameNumber: number, side: 'A' | 'B') {
    setNotice(null);
    onIncrement(gameNumber, side);
  }

  function handleDecrement(gameNumber: number, side: 'A' | 'B') {
    setNotice(null);
    onDecrement(gameNumber, side);
  }

  return (
    <div
      data-testid={`court-card-${court.courtNumber}`}
      className={`flex flex-col gap-[7px] rounded-[14px] border bg-white px-[14px] py-3 ${
        finished ? 'border-gray-200' : 'border-accent'
      } ${live.isMine ? 'ring-accent ring-2' : ''}`}
    >
      <div className="flex items-center gap-2">
        <span className="text-[18px] font-black tracking-[0.04em]">コート{court.courtNumber}</span>
        {finished ? (
          <span className="ml-auto text-[11px] font-extrabold tracking-[0.08em] text-gray-400">
            終了
          </span>
        ) : isPromotedWaiting ? (
          <span className="ml-auto text-[11px] font-extrabold tracking-[0.08em] text-gray-400">
            呼出待ち
          </span>
        ) : (
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

      <TeamNameLine team={live.teamA} />
      <TeamNameLine team={live.teamB} />

      {finished ? (
        playedGames.length > 0 && (
          <ul className="flex flex-wrap gap-1.5">
            {playedGames.map((score) => (
              <li
                key={score.gameNumber}
                className="tabular rounded-[6px] bg-gray-100 px-2 py-0.5 text-[11px] font-extrabold text-gray-500"
              >
                {`第${score.gameNumber}ゲーム ${score.sideAScore}-${score.sideBScore}`}
              </li>
            ))}
          </ul>
        )
      ) : (
        <div className="flex flex-col gap-2">
          {frames.map((frame) => (
            <GameFrameRow
              key={frame.gameNumber}
              gameNumber={frame.gameNumber}
              teamA={live.teamA}
              teamB={live.teamB}
              score={frame}
              canInput={canInput}
              onIncrement={(side) => handleIncrement(frame.gameNumber, side)}
              onDecrement={(side) => handleDecrement(frame.gameNumber, side)}
            />
          ))}
        </div>
      )}

      {finished && matchWinnerName && (
        <p className="text-[13px] font-black break-words">
          勝ち: <span className="whitespace-nowrap">{matchWinnerName}</span>
          <span className="tabular whitespace-nowrap">{`（${matchWinnerScoreText}）`}</span>
        </p>
      )}

      {!finished && canInput && (
        <>
          {syncStatus?.rejectedMessage ? (
            <p role="status" className="text-live text-[13px] font-bold">
              {syncStatus.rejectedMessage}
            </p>
          ) : (
            syncStatus?.retryingMessage && (
              <p role="status" className="text-live text-[13px] font-bold">
                {syncStatus.retryingMessage}
              </p>
            )
          )}

          {notice && (
            <p role="status" className="text-live text-[13px] font-bold">
              {notice}
            </p>
          )}

          <button
            type="button"
            onClick={handleFinishClick}
            className="bg-ink min-h-11 w-full rounded-[10px] py-[10px] text-[14px] font-bold text-white"
          >
            試合を終了する
          </button>

          <FinishConfirmSheet
            open={sheetOpen}
            games={confirmGames}
            matchWinnerName={matchWinnerName}
            matchWinnerScoreText={matchWinnerScoreText}
            onOk={handleOk}
            onClose={() => setSheetOpen(false)}
          />
        </>
      )}

      {next && <NextRow next={next} />}
    </div>
  );
}

/** ペア名だけ出す行。得点は各ゲームの枠側に出すので、ここには持たない。 */
function TeamNameLine({ team }: { team: CourtTeam }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span aria-hidden="true" className={`size-2.5 shrink-0 rounded-[3px] ${teamBgClass(team)}`} />
      <span className="min-w-0 text-[14px] font-bold break-words">
        <PairName team={team} />
      </span>
    </span>
  );
}

/** 「第Nゲーム」の枠 1 つぶん。両ペアの得点を横に並べる。押せるのは canInput のときだけ。 */
function GameFrameRow({
  gameNumber,
  teamA,
  teamB,
  score,
  canInput,
  onIncrement,
  onDecrement,
}: {
  gameNumber: number;
  teamA: CourtTeam;
  teamB: CourtTeam;
  score: GameScore;
  canInput: boolean;
  onIncrement: (side: 'A' | 'B') => void;
  onDecrement: (side: 'A' | 'B') => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[12px] font-bold text-gray-400">{`第${gameNumber}ゲーム`}</span>
      <div className="flex items-center gap-3">
        <FrameScoreValue
          team={teamA}
          gameNumber={gameNumber}
          value={score.sideAScore}
          canInput={canInput}
          onIncrement={() => onIncrement('A')}
          onDecrement={() => onDecrement('A')}
        />
        <FrameScoreValue
          team={teamB}
          gameNumber={gameNumber}
          value={score.sideBScore}
          canInput={canInput}
          onIncrement={() => onIncrement('B')}
          onDecrement={() => onDecrement('B')}
        />
      </div>
    </div>
  );
}

/**
 * 1 枠・1 チームぶんの得点。
 *
 * `canInput` が true（選手）のときだけ「−」「＋」を出す。観戦者は数字を見るだけ
 * （docs/specs/2026-09-19-courts-real-data.md の「決めたこと」3）。
 * 44px 角のタップ領域を確保するのは押せるときだけでよい。
 */
function FrameScoreValue({
  team,
  gameNumber,
  value,
  canInput,
  onIncrement,
  onDecrement,
}: {
  team: CourtTeam;
  gameNumber: number;
  value: number;
  canInput: boolean;
  onIncrement: () => void;
  onDecrement: () => void;
}) {
  if (!canInput) {
    return (
      <span className="flex shrink-0 items-center gap-1">
        <span aria-hidden="true" className={`size-2 shrink-0 rounded-[2px] ${teamBgClass(team)}`} />
        <span className="tabular text-accent w-7 text-center text-[18px] font-extrabold">
          {value}
        </span>
      </span>
    );
  }

  const name = teamDisplayName(team);

  return (
    <span className="flex shrink-0 items-center gap-1">
      <span aria-hidden="true" className={`size-2 shrink-0 rounded-[2px] ${teamBgClass(team)}`} />
      <button
        type="button"
        onClick={onDecrement}
        aria-label={`${name}の第${gameNumber}ゲームの得点を1減らす`}
        className="flex size-11 items-center justify-center rounded-[10px] border border-gray-300 text-[16px] font-bold text-gray-400"
      >
        −
      </button>
      {/* w-7（28px）は 2 桁の得点（実測 26.7px）が収まる幅。w-6 だと数字が枠からはみ出し、
          両どなりの「−」「＋」に寄って読みにくくなる（375px で実測した）。 */}
      <span className="tabular text-accent w-7 text-center text-[18px] font-extrabold">
        {value}
      </span>
      <button
        type="button"
        onClick={onIncrement}
        aria-label={`${name}の第${gameNumber}ゲームの得点を1増やす`}
        className="text-ink flex size-11 items-center justify-center rounded-[10px] border border-gray-300 text-[16px] font-bold"
      >
        ＋
      </button>
    </span>
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
          <PairName team={next.teamA} /> vs <PairName team={next.teamB} />
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
