'use client';

import { Fragment, useState } from 'react';
import { canFinishMatch, leadingSide, matchOutcome, winnerOfGame } from '@/domain/match-rules';
import { hasAnyPoint, playedGameScores, type GameScore } from '@/domain/scoring';
import { ClassChip } from '@/ui/components/class-chip';
import { YouTag } from '@/ui/components/you-tag';
import { teamBgClass } from '@/domain/class-labels';
import type {
  Court,
  CourtTeam,
  LiveMatch,
  LiveScore,
  NextMatch,
  ScoreSyncStatus,
} from '@/ui/courts/types';
import { FinishConfirmSheet, type FinishConfirmGame } from '@/ui/courts/finish-confirm-sheet';
import { ReopenConfirmSheet } from '@/ui/courts/reopen-confirm-sheet';

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
  /**
   * 直し中の試合と、1 つ前の「直す」を動かすのに要るもの。今の試合ではなく、試合の id ごとに呼ぶ。
   * 渡さなければ、直し中と1つ前は見るだけ（押せるボタンは出ない）。
   */
  fix?: FixActions;
};

/** 「取り消しています」の途中か、失敗したか（`courts-page.tsx` が持つ）。 */
export type ReopenState = { pending: boolean; error: string | null };

export type FixActions = {
  /** その試合の保存の状況（点・終了）。 */
  syncStatusOf: (matchId: string) => ScoreSyncStatus | null;
  reopenStateOf: (matchId: string) => ReopenState | null;
  onIncrement: (matchId: string, gameNumber: number, side: 'A' | 'B') => void;
  onDecrement: (matchId: string, gameNumber: number, side: 'A' | 'B') => void;
  onFinishMatch: (matchId: string) => void;
  /** 確認画面の「OK」で呼ばれる。終了を取り消す入口に送るのはページ側。 */
  onReopen: (matchId: string) => void;
};

const REOPENING_MESSAGE = '取り消しています';
const FINISHING_MESSAGE = '終了を送っています';
const FINISHING_RETRYING_MESSAGE = '終了を送っています・送り直しています';

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

/** 終了の確認画面・終了後の表示に出す、勝ちペアとゲームごとの内訳。 */
function finishSummary(
  match: { teamA: CourtTeam; teamB: CourtTeam; maxGameCount: number },
  scores: GameScore[]
) {
  const teamAName = teamDisplayName(match.teamA);
  const teamBName = teamDisplayName(match.teamB);

  // 確認画面・終了後の「勝ち: ◯◯（2-0）」は、どちらもプレーされたゲームから同じ関数で求める。
  // 勝ちペアは outcome.winner ではなく leadingSide で決める。終了は人が押したときだけなので、
  // 決勝（上限3ゲーム）を 1-0 のまま終了することがあり、そのとき outcome.winner はまだ null。
  // ここで null のまま出すと、確認画面にも終了後のカードにも勝ちペアが出ない。
  const outcome = matchOutcome(scores, match.maxGameCount);
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

  return { teamAName, teamBName, matchWinnerName, matchWinnerScoreText, playedGames, confirmGames };
}

/**
 * 点の保存の案内（断られた理由 > 送り直し中）と、終了の案内を並べる。選手にだけ出す。
 * 観戦者は点も終了も送らないので、何も出さない。
 */
function syncLines(syncStatus: ScoreSyncStatus | null, canInput: boolean): string[] {
  if (!canInput) return [];
  return [
    syncStatus?.rejectedMessage ?? syncStatus?.retryingMessage ?? null,
    syncStatus?.finishRejectedMessage ?? null,
    syncStatus?.finishing
      ? syncStatus.finishRetrying
        ? FINISHING_RETRYING_MESSAGE
        : FINISHING_MESSAGE
      : null,
  ].filter((line): line is string => line !== null);
}

/** 案内は 1 つの status にまとめる（行ごとに別の status にすると、読み上げが重なる）。 */
function StatusLines({ lines }: { lines: string[] }) {
  if (lines.length === 0) return null;
  return (
    <div role="status" className="flex flex-col gap-0.5">
      {lines.map((line) => (
        <p key={line} className="text-live text-[13px] font-bold">
          {line}
        </p>
      ))}
    </div>
  );
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
  fix,
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
    return <IdleCourtCard court={court} canInput={canInput} fix={fix} />;
  }
  // ここから先は必ず値がある（handleFinishClick などの入れ子の関数からも null を疑わなくてよい）。
  const live = resolvedLive;

  // 得点が渡ってこなかったときも試合そのものは出す。
  // ここで「予定なし」に化けると、進行中のコートが黙って消えてしまう。
  const { scores, finished, started } = liveScore ?? {
    scores: live.scores,
    finished: false,
    started: court.live !== null,
  };
  // 呼出待ちから昇格した試合は、まだ 1 点も入っていない間は「呼出待ち」の見た目のまま。
  // 最初の 1 点で LIVE に切り替わり、そのあと 0 対 0 に戻しても LIVE のまま
  // （入口側も同じ。src/usecases/save-score.ts）。
  const isPromotedWaiting = !court.live && !started;

  const frames = Array.from({ length: live.maxGameCount }, (_, index) =>
    frameScore(scores, index + 1)
  );

  const { matchWinnerName, matchWinnerScoreText, playedGames, confirmGames } = finishSummary(
    live,
    scores
  );

  // 選手にだけ出す案内。点の保存の案内（断られた理由 > 送り直し中）と、終了の案内を並べる。
  const statusLines = syncLines(syncStatus, canInput);

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

      {/* 送れていない点の案内は、試合を終了したあとも残す（仕様 2026-10-04 の決めたこと 4）。
          「終了を送っています」は終了の記録がサーバーに受け付けられるまで出す。
          ここで消すと、送れていない点があるのに「保存できた」ように見える。 */}
      <StatusLines lines={statusLines} />

      {!finished && canInput && (
        <>
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

      <FixingPanels court={court} canInput={canInput} fix={fix} />
      {next && <NextRow next={next} />}
      <PreviousRow court={court} canInput={canInput} fix={fix} />
    </div>
  );
}

/** ペア名だけ出す行。得点は各ゲームの枠側に出すので、ここには持たない。 */
function TeamNameLine({ team }: { team: CourtTeam }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span
        aria-hidden="true"
        className={`size-2.5 shrink-0 rounded-[3px] ${teamBgClass(team.teamNumber)}`}
      />
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
        <span
          aria-hidden="true"
          className={`size-2 shrink-0 rounded-[2px] ${teamBgClass(team.teamNumber)}`}
        />
        <span className="tabular text-accent w-7 text-center text-[18px] font-extrabold">
          {value}
        </span>
      </span>
    );
  }

  const name = teamDisplayName(team);

  return (
    <span className="flex shrink-0 items-center gap-1">
      <span
        aria-hidden="true"
        className={`size-2 shrink-0 rounded-[2px] ${teamBgClass(team.teamNumber)}`}
      />
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

function IdleCourtCard({
  court,
  canInput,
  fix,
}: {
  court: Court;
  canInput: boolean;
  fix: FixActions | undefined;
}) {
  return (
    <div
      data-testid={`court-card-${court.courtNumber}`}
      className="flex flex-col gap-[7px] rounded-[14px] border border-gray-200 bg-white px-[14px] py-3"
    >
      <span className="text-[18px] font-black tracking-[0.04em]">コート{court.courtNumber}</span>

      {/* 直し中の試合があるコートを「予定なし」と言わない（試合はあるので） */}
      {court.fixing.length === 0 && (
        <p className="py-3 text-center text-[13px] font-bold text-gray-400">
          {court.next ? '呼出待ち' : '予定なし'}
        </p>
      )}

      <FixingPanels court={court} canInput={canInput} fix={fix} />
      {court.next && <NextRow next={court.next} />}
      <PreviousRow court={court} canInput={canInput} fix={fix} />
    </div>
  );
}

function FixingPanels({
  court,
  canInput,
  fix,
}: {
  court: Court;
  canInput: boolean;
  fix: FixActions | undefined;
}) {
  return court.fixing.map((match) => (
    <FixingPanel
      key={match.matchId}
      courtNumber={court.courtNumber}
      match={match}
      canInput={canInput}
      fix={fix}
    />
  ));
}

/**
 * 直し中の試合（終了を取り消して、点を直している試合）。得点の枠付きで出す。
 * 今の試合とは別の枠にして、どちらの点を押しているか間違えないようにする。
 * 直したら「もう一度終了する」（確認 → 終了を送る。流れは今の試合の「試合を終了する」と同じ）。
 */
function FixingPanel({
  courtNumber,
  match,
  canInput,
  fix,
}: {
  courtNumber: number;
  match: LiveMatch;
  canInput: boolean;
  fix: FixActions | undefined;
}) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const syncStatus = fix?.syncStatusOf(match.matchId) ?? null;
  // 終了を送っている間は、今の試合と同じく終わった見た目にする（記録されたら 1 つ前に移る）
  const finishing = syncStatus?.finishing ?? false;

  const frames = Array.from({ length: match.maxGameCount }, (_, index) =>
    frameScore(match.scores, index + 1)
  );
  const { matchWinnerName, matchWinnerScoreText, playedGames, confirmGames } = finishSummary(
    match,
    match.scores
  );

  function handleFinishClick() {
    if (!hasAnyPoint(match.scores)) {
      setNotice('まだ点が入っていません');
      return;
    }
    const result = canFinishMatch(match.scores, match.maxGameCount);
    if (!result.ok) {
      setNotice(result.reason);
      return;
    }
    setNotice(null);
    setSheetOpen(true);
  }

  return (
    <section
      data-testid={`fixing-match-${courtNumber}`}
      aria-label="直し中の試合"
      className="border-accent flex flex-col gap-[7px] rounded-[10px] border-2 border-dashed px-[10px] py-2"
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="bg-accent shrink-0 rounded-[5px] px-1.5 py-0.5 text-[11px] font-extrabold whitespace-nowrap text-white">
          直し中
        </span>
        <ClassChip classLabel={match.classLabel} />
        <span className="text-[11px] font-bold whitespace-nowrap text-gray-400">
          {match.roundLabel}
        </span>
      </div>

      <TeamNameLine team={match.teamA} />
      <TeamNameLine team={match.teamB} />

      {finishing ? (
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
              teamA={match.teamA}
              teamB={match.teamB}
              score={frame}
              canInput={canInput && fix !== undefined}
              onIncrement={(side) => {
                setNotice(null);
                fix?.onIncrement(match.matchId, frame.gameNumber, side);
              }}
              onDecrement={(side) => {
                setNotice(null);
                fix?.onDecrement(match.matchId, frame.gameNumber, side);
              }}
            />
          ))}
        </div>
      )}

      <StatusLines lines={syncLines(syncStatus, canInput)} />

      {canInput && fix && !finishing && (
        <>
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
            もう一度終了する
          </button>

          <FinishConfirmSheet
            open={sheetOpen}
            games={confirmGames}
            matchWinnerName={matchWinnerName}
            matchWinnerScoreText={matchWinnerScoreText}
            onOk={() => {
              setSheetOpen(false);
              fix.onFinishMatch(match.matchId);
            }}
            onClose={() => setSheetOpen(false)}
          />
        </>
      )}
    </section>
  );
}

/**
 * 1 つ前の試合（そのコートで、終了の時刻が一番新しい終わった試合）と、「直す」。
 * 「直す」→ 確認 → 終了の取り消し。取り消されると、その試合は「直し中」として戻ってくる。
 * 観戦者には「直す」を出さない（今までどおり、見るだけ）。
 */
function PreviousRow({
  court,
  canInput,
  fix,
}: {
  court: Court;
  canInput: boolean;
  fix: FixActions | undefined;
}) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const previous = court.previous;
  if (!previous) return null;

  const reopenState = fix?.reopenStateOf(previous.matchId) ?? null;
  const syncStatus = fix?.syncStatusOf(previous.matchId) ?? null;
  const summary = finishSummary(previous, previous.scores);

  // 「取り消しています」「取り消せませんでした」と、この試合に送れていない点の案内。
  // 他の人が先に終了させた試合に点を入れていたときは、点が断られたことがここに残る
  // （この試合は直し中の枠から外れて 1 つ前に移っているので、ここで見えないと黙って消える）。
  const lines = [
    ...(reopenState?.pending ? [REOPENING_MESSAGE] : []),
    ...(reopenState?.error ? [reopenState.error] : []),
    ...syncLines(syncStatus, canInput),
  ];

  return (
    <div
      data-testid={`previous-match-${court.courtNumber}`}
      className="mt-1 flex flex-col gap-1.5 border-t border-dashed border-gray-200 pt-2"
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="shrink-0 rounded-[5px] bg-gray-400 px-1.5 py-0.5 text-[11px] font-extrabold whitespace-nowrap text-white">
          1つ前
        </span>
        <ClassChip classLabel={previous.classLabel} />
        <span className="text-[13px] font-bold">
          <PairName team={previous.teamA} /> vs <PairName team={previous.teamB} />
        </span>
      </div>

      {summary.playedGames.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {summary.playedGames.map((score) => (
            <li
              key={score.gameNumber}
              className="tabular rounded-[6px] bg-gray-100 px-2 py-0.5 text-[11px] font-extrabold text-gray-500"
            >
              {`${score.sideAScore}-${score.sideBScore}`}
            </li>
          ))}
        </ul>
      )}

      <StatusLines lines={lines} />

      {canInput && fix && (
        <>
          <button
            type="button"
            disabled={reopenState?.pending ?? false}
            onClick={() => setSheetOpen(true)}
            className="min-h-11 w-full rounded-[10px] border border-gray-300 py-[10px] text-[14px] font-bold disabled:text-gray-400"
          >
            直す
          </button>

          <ReopenConfirmSheet
            open={sheetOpen}
            games={summary.confirmGames}
            teamAName={summary.teamAName}
            teamBName={summary.teamBName}
            onOk={() => {
              setSheetOpen(false);
              fix.onReopen(previous.matchId);
            }}
            onClose={() => setSheetOpen(false)}
          />
        </>
      )}
    </div>
  );
}
