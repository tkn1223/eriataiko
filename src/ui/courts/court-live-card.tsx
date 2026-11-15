'use client';

import { useState } from 'react';
import {
  canFinishMatch,
  endingOfRetiredSide,
  matchOutcome,
  matchWinner,
  retiredSideOf,
  winnerOfGame,
} from '@/domain/match-rules';
import { hasAnyPoint, playedGameScores, type GameScore } from '@/domain/scoring';
import { ClassChip } from '@/ui/components/class-chip';
import { RetiredNote } from '@/ui/components/retired-note';
import { teamBgClass, teamPanelClasses } from '@/domain/class-labels';
import { ClockIcon, CrossIcon, FlagIcon } from '@/ui/icons';
import type {
  Court,
  CourtTeam,
  LiveMatch,
  LiveScore,
  NextMatch,
  PreviousMatch,
  ScorerRejection,
  ScoreSyncStatus,
} from '@/ui/courts/types';
import { FinishConfirmSheet, type FinishConfirmGame } from '@/ui/courts/finish-confirm-sheet';
import { ReopenConfirmSheet } from '@/ui/courts/reopen-confirm-sheet';
import { previousRowAccess } from '@/ui/courts/previous-access';
import type { ScorerView } from '@/ui/courts/scorer-view';
import { defaultShownGame, earlierPlayedGames } from '@/ui/courts/shown-game';
import { TakeOverConfirmSheet } from '@/ui/courts/take-over-confirm-sheet';
import type { FinishSheetControl } from '@/ui/courts/use-finish-sheets';

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
  onFinishMatch: (retiredSide: 'A' | 'B' | null) => void;
  /**
   * 試合ごとの「終了の確認画面」の操作。開き閉じと選んだ棄権は、カードの中ではなくページが試合ごとに
   * 覚える（カードは試合の状態が変わると作り直されるので、中で覚えると確認画面が閉じてしまう。
   * また、コートに結びつけると、開いている間に試合が終わったとき次の試合の中身で開いたままになる）。
   */
  finishSheetOf: (matchId: string) => FinishSheetControl;
  /**
   * 試合ごとの入力担当の見せ方と操作（仕様 docs/specs/2026-10-14-match-scorer.md）。
   * 今の試合も、直し中の試合も、試合の id で引く。決まり（5 分・引き継ぎ）はこの外で済んでいて、
   * ここは渡された見せ方のとおりに出すだけ。
   */
  scorerOf: (matchId: string) => ScorerControl;
  /**
   * 直し中の試合と、1 つ前の「直す」を動かすのに要るもの。今の試合ではなく、試合の id ごとに呼ぶ。
   * 渡さなければ、直し中と1つ前は見るだけ（押せるボタンは出ない）。
   */
  fix?: FixActions;
};

/** 1 つの試合の入力担当の見せ方と操作。 */
export type ScorerControl = {
  /** 自分が担当か、いないか、ほかの人か。 */
  view: ScorerView;
  /**
   * 記録上の担当（`matches.scorer_participant_id`。5 分で外れた扱いになっても、終了しても残る）が自分か。
   * 1 つ前の試合の担当だった人に［訂正］を出すのに使う。記録が読めなければ false。
   */
  recordedScorerIsMe: boolean;
  /** 「入力を担当する」。担当を取る。 */
  onClaim: () => void;
  /** 「引き継ぐ」の確認で OK。ほかの人から担当を取る。 */
  onTakeOver: () => void;
  /** 「入力をやめる」。 */
  onRelease: () => void;
  /** 担当でないと断られた点の知らせの「閉じる」。 */
  onDismissRejection: () => void;
};

/** 「取り消しています」の途中か、失敗したか（`courts-page.tsx` が持つ）。 */
export type ReopenState = { pending: boolean; error: string | null };

export type FixActions = {
  /** その試合の保存の状況（点・終了）。 */
  syncStatusOf: (matchId: string) => ScoreSyncStatus | null;
  reopenStateOf: (matchId: string) => ReopenState | null;
  onIncrement: (matchId: string, gameNumber: number, side: 'A' | 'B') => void;
  onDecrement: (matchId: string, gameNumber: number, side: 'A' | 'B') => void;
  onFinishMatch: (matchId: string, retiredSide: 'A' | 'B' | null) => void;
  /** 「もう一度終了する」の確認画面の操作（ページが試合ごとに覚える）。 */
  finishSheetOf: (matchId: string) => FinishSheetControl;
  /** 確認画面の「OK」で呼ばれる。終了を取り消す入口に送るのはページ側。 */
  onReopen: (matchId: string) => void;
};

const REOPENING_MESSAGE = '取り消しています';
const FINISHING_MESSAGE = '終了を送っています';
const FINISHING_RETRYING_MESSAGE = '終了を送っています・送り直しています';
const CLAIM_RETRYING_MESSAGE = '入力の担当を取れていません・送り直しています';
const RELEASE_RETRYING_MESSAGE = '入力の担当をやめられていません・送り直しています';

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

/** 終了の確認画面・終了後の表示に出す、勝ちペアとゲームごとの内訳。 */
function finishSummary(
  match: { teamA: CourtTeam; teamB: CourtTeam; maxGameCount: number },
  scores: GameScore[],
  ending: string
) {
  const teamAName = teamDisplayName(match.teamA);
  const teamBName = teamDisplayName(match.teamB);

  // 確認画面・終了後の「勝ち: ◯◯（2-0）」は、どちらもプレーされたゲームから同じ関数で求める。
  // 勝ちペアは matchWinner 1 か所で決める（順位表・マイページと食い違わないため）。
  // 棄権なら点数に関係なく相手の勝ち。ゲーム数の表記は点数のまま。
  const outcome = matchOutcome(scores, match.maxGameCount);
  const winnerSide = matchWinner(scores, match.maxGameCount, ending);
  const retiredSide = retiredSideOf(ending);
  const retiredNames =
    retiredSide === 'A' ? match.teamA.players : retiredSide === 'B' ? match.teamB.players : [];
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

  return {
    teamAName,
    teamBName,
    matchWinnerName,
    matchWinnerScoreText,
    playedGames,
    confirmGames,
    retiredNames,
  };
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
    // 担当を取る・やめる操作が電波で届いていない間。入力は止めない（＋ − は押せる）
    syncStatus?.scorerOp?.retrying
      ? syncStatus.scorerOp.kind === 'claim'
        ? CLAIM_RETRYING_MESSAGE
        : RELEASE_RETRYING_MESSAGE
      : null,
    syncStatus?.scorerOpMessage ?? null,
  ].filter((line): line is string => line !== null);
}

/** 送れなかった点の書き方（「第1ゲーム 12-10、第2ゲーム 3-5」）。 */
function rejectedGamesText(games: GameScore[]): string {
  return games.map((g) => `第${g.gameNumber}ゲーム ${g.sideAScore}-${g.sideBScore}`).join('、');
}

/**
 * 送った点が担当でないと断られたときの知らせ（仕様 ⑧⑨）。そのコートのカードの中に、閉じるまで出す。
 * 点数が食い違っていたときに口で伝えられるよう、送れなかった点を出す。
 */
function ScorerRejectionNotice({
  rejection,
  onDismiss,
}: {
  rejection: ScorerRejection;
  onDismiss: () => void;
}) {
  return (
    <div
      role="alert"
      className="border-live flex flex-col gap-1.5 rounded-[10px] border-2 bg-red-50 px-3 py-2"
    >
      <p className="text-live text-[13px] font-extrabold break-words">{rejection.message}</p>
      <p className="tabular text-[12px] font-bold break-words">
        {`送れなかった点：${rejectedGamesText(rejection.games)}`}
      </p>
      <button
        type="button"
        onClick={onDismiss}
        className="min-h-11 w-full rounded-[10px] border border-gray-300 bg-white py-[10px] text-[14px] font-bold"
      >
        閉じる
      </button>
    </div>
  );
}

/**
 * 担当がいない試合の、赤い点線の大きなボタン［入力を担当する］（中に小さく「入力担当がまだいません」）。
 * 観戦者には何も出さない（押せないし、誰が入力しているかも見せない。仕様 2026-11-15 の「決めたこと」5）。
 * 押したときの名前（aria-label）は見えている文字と同じ「入力を担当する」にしている。
 */
function VacantScorerBanner({ canInput, onClaim }: { canInput: boolean; onClaim: () => void }) {
  if (!canInput) return null;
  return (
    <button
      type="button"
      aria-label="入力を担当する"
      onClick={onClaim}
      className="border-live text-live flex min-h-[60px] w-full flex-col items-center justify-center rounded-xl border-2 border-dashed bg-red-50 px-3 py-2"
    >
      <span className="text-[16px] font-extrabold">入力を担当する</span>
      <span className="mt-0.5 text-[11px] font-bold">入力担当がまだいません</span>
    </button>
  );
}

/**
 * ほかの人が入力している試合の、灰色の帯。担当の名前（チーム名つき）と、小さめの［引き継ぐ］。
 * 観戦者には何も出さない。確認画面の開き閉じはここで持つ（担当が変わればこの部品ごと消え、閉じる）。
 */
function OtherScorerBanner({
  name,
  canInput,
  onTakeOver,
}: {
  name: string;
  canInput: boolean;
  onTakeOver: () => void;
}) {
  const [sheetOpen, setSheetOpen] = useState(false);
  if (!canInput) return null;
  return (
    <div className="border-gold-edge bg-gold-soft flex items-center gap-2 rounded-xl border py-2 pr-2 pl-3">
      <div className="min-w-0 flex-1">
        <p className="text-[12px] leading-snug font-semibold break-words">{`${name}さん`}</p>
        <p className="text-[12px] font-semibold text-gray-500">が入力しています</p>
      </div>
      <button
        type="button"
        onClick={() => setSheetOpen(true)}
        className="border-btn-dark min-h-11 shrink-0 rounded-[9px] border bg-white px-3 text-[14px] font-bold"
      >
        入力を引き継ぐ
      </button>
      <TakeOverConfirmSheet
        open={sheetOpen}
        scorerName={name}
        onOk={() => {
          setSheetOpen(false);
          onTakeOver();
        }}
        onClose={() => setSheetOpen(false)}
      />
    </div>
  );
}

/**
 * 試合の入力担当まわりの表示。
 * - 担当でないと断られた点の知らせ（あれば。試合が終わっても閉じるまで残す）
 * - `showStatus` のとき、担当の状況: いなければ［入力を担当する］、ほかの人なら帯と［入力を引き継ぐ］
 *   （自分が担当のときは何も出さない。＋ − と「入力をやめる」は呼び出し側が並べる）
 */
function ScorerSection({
  scorer,
  canInput,
  rejection,
  showStatus,
}: {
  scorer: ScorerControl;
  canInput: boolean;
  rejection: ScorerRejection | null;
  showStatus: boolean;
}) {
  return (
    <>
      {canInput && rejection && (
        <ScorerRejectionNotice rejection={rejection} onDismiss={scorer.onDismissRejection} />
      )}
      {showStatus && scorer.view.kind === 'vacant' && (
        <VacantScorerBanner canInput={canInput} onClaim={scorer.onClaim} />
      )}
      {showStatus && scorer.view.kind === 'other' && (
        <OtherScorerBanner
          name={scorer.view.name}
          canInput={canInput}
          onTakeOver={scorer.onTakeOver}
        />
      )}
    </>
  );
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

/** チームを一言で。チーム名があればそれ、無ければ（古い形の値・名簿だけの試合）選手名。 */
function teamLabel(team: CourtTeam): string {
  return team.teamName ?? teamDisplayName(team);
}

type StatusTone = 'live' | 'waiting' | 'fixing' | 'finished';

/** 札の枠・地・文字・点の色。試合中＝緑・呼出待ち＝黄・直し中＝金・終了＝灰で、互いに見分けがつく。 */
const STATUS_TONE_CLASSES: Record<StatusTone, { pill: string; dot: string }> = {
  live: { pill: 'bg-status-live text-green-800', dot: 'bg-green-600' },
  waiting: { pill: 'bg-status-wait text-yellow-800', dot: 'bg-yellow-500' },
  fixing: { pill: 'bg-gold-soft text-ink', dot: 'bg-gold' },
  finished: { pill: 'bg-gray-100 text-gray-500', dot: 'bg-gray-400' },
};

/** カードの右上の状態の札。「● 試合中」のように、点つきの枠囲み。 */
function StatusPill({ tone, label, testId }: { tone: StatusTone; label: string; testId?: string }) {
  const classes = STATUS_TONE_CLASSES[tone];
  return (
    <span
      data-testid={testId}
      className={`ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-bold whitespace-nowrap ${classes.pill}`}
    >
      <span aria-hidden="true" className={`size-2 rounded-full ${classes.dot}`} />
      {label}
    </span>
  );
}

/** 1 行目。「コートN」を大きく太く、部の札、右端に状態の札。 */
function CourtHeader({
  courtNumber,
  classLabel,
  status,
}: {
  courtNumber: number;
  classLabel: LiveMatch['classLabel'] | null;
  status: { tone: StatusTone; label: string; testId?: string };
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[23px] font-extrabold tracking-[0.02em]">コート{courtNumber}</span>
      {classLabel && <ClassChip classLabel={classLabel} outlined />}
      <StatusPill {...status} />
    </div>
  );
}

/** 終わったゲームの札（「第1ゲーム 21-15 愛知南の勝ち」）。ゲームごとに 1 つ。 */
function EarlierGameChips({ games }: { games: GameScore[] }) {
  if (games.length === 0) return null;
  return (
    <ul className="flex flex-wrap justify-center gap-1.5">
      {games.map((score) => (
        <li
          key={score.gameNumber}
          className="tabular border-beige-chip-line bg-beige-chip rounded-lg border px-3.5 py-0.5 text-[12px] font-semibold text-gray-800"
        >
          {/* 数字は左の枠（A 側）- 右の枠（B 側）の順。勝ったチーム名は出さない（短さを優先） */}
          {`第${score.gameNumber}G：${score.sideAScore}-${score.sideBScore}`}
        </li>
      ))}
    </ul>
  );
}

/** 得点板の枠 1 枚。上からチーム名（チームの色の文字）・選手名（1 人 1 行）・大きな点数。 */
function TeamPanel({
  testId,
  team,
  score,
  emphasized,
}: {
  testId: string;
  team: CourtTeam;
  score: number;
  /** 自分の試合は点数を大きく（48px）、ほかは 38px。 */
  emphasized: boolean;
}) {
  const colors = teamPanelClasses(team.teamNumber);
  return (
    <div
      data-testid={testId}
      className={`min-w-0 overflow-hidden rounded-xl border text-center ${colors.border} ${colors.tint}`}
    >
      {team.teamName && (
        <p className={`px-1 pt-1.5 pb-0.5 text-[12px] font-bold break-words ${colors.text}`}>
          {team.teamName}
        </p>
      )}
      <div className="px-1 text-[14px] leading-[1.3] font-bold">
        {team.players.length > 0 ? (
          team.players.map((name, index) => (
            <p key={index} className="break-words">
              {name}
            </p>
          ))
        ) : (
          <p className="break-words">{team.slotLabel ?? ''}</p>
        )}
      </div>
      <p
        className={`tabular pt-0.5 pb-2 leading-[1.05] font-extrabold tracking-[-0.02em] ${
          emphasized ? 'text-[48px]' : 'text-[38px]'
        }`}
      >
        {score}
      </p>
    </div>
  );
}

/**
 * ［−］［＋］。**同じ大きさ**（高さ 48px）で、色だけ分ける（＋は黒地に白、−は白地）。
 * 押したときの名前（aria-label）は昔のまま（画面テストが使っている）。
 */
const SCORE_BUTTON_CLASSES =
  'flex h-11 min-w-0 flex-1 items-center justify-center rounded-[9px] border text-[27px] leading-none font-bold';

function ScoreButtons({
  team,
  gameNumber,
  onIncrement,
  onDecrement,
}: {
  team: CourtTeam;
  gameNumber: number;
  onIncrement: () => void;
  onDecrement: () => void;
}) {
  const name = teamDisplayName(team);
  return (
    <div className="flex gap-1.5">
      <button
        type="button"
        onClick={onDecrement}
        aria-label={`${name}の第${gameNumber}ゲームの得点を1減らす`}
        className={`${SCORE_BUTTON_CLASSES} border-line bg-white`}
      >
        −
      </button>
      <button
        type="button"
        onClick={onIncrement}
        aria-label={`${name}の第${gameNumber}ゲームの得点を1増やす`}
        className={`${SCORE_BUTTON_CLASSES} border-btn-dark bg-btn-dark text-white`}
      >
        ＋
      </button>
    </div>
  );
}

/**
 * 「第Nゲーム」を真ん中に小さく。点を入れる人（複数ゲーム制）には、その下にゲームのタブ
 * ［第1］［第2］［第3］を並べる。見ているゲームは黒地に白文字、ほかは白地。
 * どのタブも高さ 44px 以上で、ゲーム数ぶんを等分するので 375px でもはみ出さない。
 */
function GameLabelRow({
  shownGame,
  maxGameCount,
  onChange,
}: {
  shownGame: number;
  maxGameCount: number;
  /** 渡されたときだけ（点を入れる人で、複数ゲーム制）タブを出す。 */
  onChange?: (gameNumber: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-center text-[12px] font-bold">{`第${shownGame}ゲーム`}</p>
      {onChange && (
        <div role="tablist" aria-label="ゲームの切り替え" className="flex gap-2">
          {Array.from({ length: maxGameCount }, (_, index) => index + 1).map((gameNumber) => {
            const selected = gameNumber === shownGame;
            return (
              <button
                key={gameNumber}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => onChange(gameNumber)}
                className={`min-h-11 min-w-0 flex-1 rounded-[9px] border text-[14px] font-bold ${
                  selected
                    ? 'bg-btn-dark border-btn-dark text-white'
                    : 'border-line bg-white text-gray-700'
                }`}
              >
                {`第${gameNumber}`}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * 得点板。「第Nゲーム」・終わったゲームの札・左右 2 枚の枠・（点を入れる人だけ）各枠の真下の［−］［＋］。
 * カードの本体と直し中の枠で同じ形を使う。押せるのは canScore のときだけ。
 */
function ScoreBoard({
  teamA,
  teamB,
  scores,
  maxGameCount,
  shownGame,
  onShownGameChange,
  canScore,
  emphasized,
  onIncrement,
  onDecrement,
}: {
  teamA: CourtTeam;
  teamB: CourtTeam;
  scores: GameScore[];
  maxGameCount: number;
  shownGame: number;
  onShownGameChange: (gameNumber: number) => void;
  canScore: boolean;
  /** 自分の試合か（点数を大きく出す）。 */
  emphasized: boolean;
  onIncrement: (gameNumber: number, side: 'A' | 'B') => void;
  onDecrement: (gameNumber: number, side: 'A' | 'B') => void;
}) {
  const shown = frameScore(scores, shownGame);
  return (
    <div className="flex flex-col gap-2">
      <GameLabelRow
        shownGame={shownGame}
        maxGameCount={maxGameCount}
        onChange={canScore && maxGameCount > 1 ? onShownGameChange : undefined}
      />
      <EarlierGameChips games={earlierPlayedGames(scores, shownGame)} />
      <div className="grid grid-cols-2 gap-2">
        <TeamPanel
          testId="team-panel-A"
          team={teamA}
          score={shown.sideAScore}
          emphasized={emphasized}
        />
        <TeamPanel
          testId="team-panel-B"
          team={teamB}
          score={shown.sideBScore}
          emphasized={emphasized}
        />
        {canScore && (
          <>
            <ScoreButtons
              team={teamA}
              gameNumber={shownGame}
              onIncrement={() => onIncrement(shownGame, 'A')}
              onDecrement={() => onDecrement(shownGame, 'A')}
            />
            <ScoreButtons
              team={teamB}
              gameNumber={shownGame}
              onIncrement={() => onIncrement(shownGame, 'B')}
              onDecrement={() => onDecrement(shownGame, 'B')}
            />
          </>
        )}
      </div>
    </div>
  );
}

/**
 * 点を入れる人が選んだ「いま入れているゲーム」を、試合ごとに覚える。
 * 選んでいなければ、点が入っている一番後ろのゲーム（`defaultShownGame`）。
 * 別の試合になったときは選び直しになるよう、試合の id といっしょに覚える。
 */
function useShownGame(matchId: string, scores: GameScore[], maxGameCount: number) {
  const [chosen, setChosen] = useState<{ matchId: string; gameNumber: number } | null>(null);
  const shownGame =
    chosen?.matchId === matchId
      ? Math.min(Math.max(chosen.gameNumber, 1), maxGameCount)
      : defaultShownGame(scores, maxGameCount);
  return {
    shownGame,
    chooseGame: (gameNumber: number) => setChosen({ matchId, gameNumber }),
  };
}

/** カードの枠。自分の試合は太い金の枠、ほかは細い薄い金の枠（色は globals.css の @theme）。 */
function cardBorderClasses(isMine: boolean): string {
  return isMine ? 'border-[1.5px] border-gold' : 'border border-line';
}

/** 1 つ前の試合について、カードに出す保存の知らせ（取り消し中・取り消せなかった・送れていない点）。 */
function previousNoticeLines(
  previous: PreviousMatch,
  fix: FixActions | undefined,
  canInput: boolean
): string[] {
  const reopenState = fix?.reopenStateOf(previous.matchId) ?? null;
  const syncStatus = fix?.syncStatusOf(previous.matchId) ?? null;
  // 他の人が先に終了させた試合に点を入れていたときは、点が断られたことがここに残る
  // （この試合は直し中の枠から外れて 1 つ前に移っているので、ここで見えないと黙って消える）。
  return [
    ...(reopenState?.pending ? [REOPENING_MESSAGE] : []),
    ...(reopenState?.error ? [reopenState.error] : []),
    ...syncLines(syncStatus, canInput),
  ];
}

/** 1 つ前の行を、いまの人に出すか・［直す］を出すか（`previous-access.ts`）。 */
function previousAccessOf(
  court: Court,
  canInput: boolean,
  fix: FixActions | undefined,
  scorerOf: (matchId: string) => ScorerControl
) {
  const previous = court.previous;
  if (!previous) return null;
  // いまそのコートの試合 = 進行中、無ければ次（呼出待ち）。担当が自分かどうかを見る
  const current = court.live ?? court.next;
  return {
    previous,
    lines: previousNoticeLines(previous, fix, canInput),
    ...previousRowAccess({
      canInput,
      playedInPrevious: previous.isMine,
      wasScorerOfPrevious: scorerOf(previous.matchId).recordedScorerIsMe,
      scorerOfCurrent: current ? scorerOf(current.matchId).view.kind : null,
      hasNoticeAboutPrevious: previousNoticeLines(previous, fix, canInput).length > 0,
    }),
  };
}

/**
 * コート 1 面ぶんのカード。
 *
 * 上限ゲーム数ぶんの枠を最初から並べるのはやめ、いま入れている 1 ゲームだけを大きく出す
 * （docs/specs/2026-11-15-courts-redesign.md）。終わったゲームは上に小さな札で出す。
 * 点を入れる人は、前後のゲームに動いて、どのゲームの点も押せる（docs/specs/2026-09-04-finish-match.md）。
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
  finishSheetOf,
  scorerOf,
  fix,
}: Props) {
  // 0対0・同点で押したときの案内。押し直す（得点を動かす）まで出したままにする。
  const [notice, setNotice] = useState<string | null>(null);

  // 進行中が無く次の試合があれば、そこにも点の枠を出す（0 対 0・札は「呼出待ち」）。観戦者にも同じ形で見せる
  // （docs/specs/2026-09-19-save-score-from-courts.md の「決めたこと」1。押せるのは選手の担当だけ）。
  const resolvedLive = court.live ?? (court.next ? nextAsLiveMatch(court.next) : null);
  const { shownGame, chooseGame } = useShownGame(
    resolvedLive?.matchId ?? '',
    liveScore?.scores ?? resolvedLive?.scores ?? [],
    resolvedLive?.maxGameCount ?? 1
  );

  if (!resolvedLive) {
    return <IdleCourtCard court={court} canInput={canInput} fix={fix} scorerOf={scorerOf} />;
  }
  // ここから先は必ず値がある（handleFinishClick などの入れ子の関数からも null を疑わなくてよい）。
  const live = resolvedLive;
  // 「試合を終了する」の確認画面。誤タップの歯止めがこれ 1 つしか無い。試合ごとにページが覚える
  const finishSheet = finishSheetOf(live.matchId);
  const retiredSide = finishSheet.retiredSide;
  // 点を入れられるのは、担当（自分）のときだけ。担当でなければ、点は数字で見せるだけ
  const scorer = scorerOf(live.matchId);
  const canScore = canInput && scorer.view.kind === 'mine';

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

  // 終了を送っている間は、預かり場所が持っている棄権の側で出す（確認画面の選択は閉じたあと使わない）
  const shownRetiredSide = finished ? (syncStatus?.finishRetiredSide ?? null) : retiredSide;
  const {
    teamAName,
    teamBName,
    matchWinnerName,
    matchWinnerScoreText,
    confirmGames,
    retiredNames,
  } = finishSummary(live, scores, endingOfRetiredSide(shownRetiredSide));

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
    finishSheet.onOpen();
  }

  function handleOk() {
    finishSheet.onClose();
    onFinishMatch(retiredSide);
  }

  const previousAccess = previousAccessOf(court, canInput, fix, scorerOf);

  const status: { tone: StatusTone; label: string } = finished
    ? { tone: 'finished', label: '終了' }
    : isPromotedWaiting
      ? { tone: 'waiting', label: '呼出待ち' }
      : { tone: 'live', label: '試合中' };

  return (
    <div
      data-testid={`court-card-${court.courtNumber}`}
      // 自分の試合は太い金の枠、ほかは細い金の枠
      className={`flex flex-col gap-2 rounded-[18px] bg-white p-3 ${cardBorderClasses(live.isMine)}`}
    >
      <CourtHeader
        courtNumber={court.courtNumber}
        classLabel={live.classLabel}
        status={{ ...status, testId: 'court-status' }}
      />

      <ScoreBoard
        teamA={live.teamA}
        teamB={live.teamB}
        scores={scores}
        maxGameCount={live.maxGameCount}
        shownGame={finished ? defaultShownGame(scores, live.maxGameCount) : shownGame}
        onShownGameChange={chooseGame}
        canScore={canScore && !finished}
        emphasized={live.isMine}
        onIncrement={(gameNumber, side) => {
          setNotice(null);
          onIncrement(gameNumber, side);
        }}
        onDecrement={(gameNumber, side) => {
          setNotice(null);
          onDecrement(gameNumber, side);
        }}
      />

      {finished && matchWinnerName && (
        <p className="text-center text-[13px] font-black break-words">
          勝ち: <span className="whitespace-nowrap">{matchWinnerName}</span>
          <span className="tabular whitespace-nowrap">{`（${matchWinnerScoreText}）`}</span>
        </p>
      )}
      {finished && (
        <p className="text-center">
          <RetiredNote names={retiredNames} />
        </p>
      )}

      {/* 送れていない点の案内は、試合を終了したあとも残す（仕様 2026-10-04 の決めたこと 4）。
          「終了を送っています」は終了の記録がサーバーに受け付けられるまで出す。
          ここで消すと、送れていない点があるのに「保存できた」ように見える。 */}
      <ScorerSection
        scorer={scorer}
        canInput={canInput}
        rejection={syncStatus?.scorerRejection ?? null}
        showStatus={!finished}
      />

      <StatusLines lines={statusLines} />

      {!finished && canScore && (
        <>
          {notice && (
            <p role="status" className="text-live text-[13px] font-bold">
              {notice}
            </p>
          )}

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleFinishClick}
              className="bg-btn-dark border-gold flex min-h-11 items-center justify-center gap-2 rounded-[9px] border-[1.5px] text-[14px] font-bold text-white"
            >
              <FlagIcon className="text-gold size-5" />
              試合終了
            </button>
            <button
              type="button"
              onClick={scorer.onRelease}
              className="border-line flex min-h-11 items-center justify-center gap-2 rounded-[9px] border bg-white text-[14px] font-bold"
            >
              <CrossIcon className="size-5" />
              担当をやめる
            </button>
          </div>

          <FinishConfirmSheet
            open={finishSheet.open}
            games={confirmGames}
            matchWinnerName={matchWinnerName}
            matchWinnerScoreText={matchWinnerScoreText}
            teamAName={teamAName}
            teamBName={teamBName}
            retiredSide={retiredSide}
            onRetiredSideChange={finishSheet.onRetiredSideChange}
            onOk={handleOk}
            onClose={finishSheet.onClose}
          />
        </>
      )}

      <FixingPanels court={court} canInput={canInput} fix={fix} scorerOf={scorerOf} />
      {previousAccess?.showRow && (
        <PreviousRow
          courtNumber={court.courtNumber}
          previous={previousAccess.previous}
          lines={previousAccess.lines}
          canInput={canInput}
          showFixButton={previousAccess.showFixButton}
          fix={fix}
        />
      )}
    </div>
  );
}

/**
 * 進行中も次も無いコート。直し中の試合があればそれを出し、1 つ前を出せる人には 1 つ前の行を出す。
 * それ以外の人には「このコートの試合は終わりました」と短く出す（真っ白にしない）。
 */
function IdleCourtCard({
  court,
  canInput,
  fix,
  scorerOf,
}: {
  court: Court;
  canInput: boolean;
  fix: FixActions | undefined;
  scorerOf: (matchId: string) => ScorerControl;
}) {
  const previousAccess = previousAccessOf(court, canInput, fix, scorerOf);
  const hasFixing = court.fixing.length > 0;

  return (
    <div
      data-testid={`court-card-${court.courtNumber}`}
      className={`flex flex-col gap-2 rounded-[18px] bg-white p-3 ${cardBorderClasses(false)}`}
    >
      <CourtHeader
        courtNumber={court.courtNumber}
        classLabel={null}
        status={{ tone: 'finished', label: '終了', testId: 'court-status' }}
      />

      {/* 直し中の試合があるコートを「終わりました」と言わない（試合はあるので） */}
      {!hasFixing && !previousAccess?.showRow && (
        <p className="py-3 text-center text-[13px] font-bold text-gray-500">
          {court.previous ? 'このコートの試合は終わりました' : '予定なし'}
        </p>
      )}

      <FixingPanels court={court} canInput={canInput} fix={fix} scorerOf={scorerOf} />
      {previousAccess?.showRow && (
        <PreviousRow
          courtNumber={court.courtNumber}
          previous={previousAccess.previous}
          lines={previousAccess.lines}
          canInput={canInput}
          showFixButton={previousAccess.showFixButton}
          fix={fix}
        />
      )}
    </div>
  );
}

function FixingPanels({
  court,
  canInput,
  fix,
  scorerOf,
}: {
  court: Court;
  canInput: boolean;
  fix: FixActions | undefined;
  scorerOf: (matchId: string) => ScorerControl;
}) {
  return court.fixing.map((match) => (
    <FixingPanel
      key={match.matchId}
      courtNumber={court.courtNumber}
      match={match}
      canInput={canInput}
      fix={fix}
      scorer={scorerOf(match.matchId)}
    />
  ));
}

/**
 * 直し中の試合（終了を取り消して、点を直している試合）。今の試合と同じ得点板で出す。
 * 今の試合とは別の枠（オレンジの点線）にして、どちらの点を押しているか間違えないようにする。
 * 直したら「もう一度終了する」（確認 → 終了を送る。流れは今の試合の「試合を終了する」と同じ）。
 */
function FixingPanel({
  courtNumber,
  match,
  canInput,
  fix,
  scorer,
}: {
  courtNumber: number;
  match: LiveMatch;
  canInput: boolean;
  fix: FixActions | undefined;
  scorer: ScorerControl;
}) {
  const [notice, setNotice] = useState<string | null>(null);
  const { shownGame, chooseGame } = useShownGame(match.matchId, match.scores, match.maxGameCount);
  // 確認画面の開き閉じと選んだ棄権はページが試合ごとに覚える（この枠が作り直されても閉じない）
  const finishSheet = fix?.finishSheetOf(match.matchId);
  const retiredSide = finishSheet?.retiredSide ?? null;

  const syncStatus = fix?.syncStatusOf(match.matchId) ?? null;
  // 終了を送っている間は、今の試合と同じく終わった見た目にする（記録されたら 1 つ前に移る）
  const finishing = syncStatus?.finishing ?? false;
  // 直す人が担当になる（仕様 ⑩）。担当でなければ、直し中の枠も点は数字で見せるだけ
  const canScore = canInput && fix !== undefined && scorer.view.kind === 'mine';

  const shownRetiredSide = finishing ? (syncStatus?.finishRetiredSide ?? null) : retiredSide;
  const {
    teamAName,
    teamBName,
    matchWinnerName,
    matchWinnerScoreText,
    confirmGames,
    retiredNames,
  } = finishSummary(match, match.scores, endingOfRetiredSide(shownRetiredSide));

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
    finishSheet?.onOpen();
  }

  return (
    <section
      data-testid={`fixing-match-${courtNumber}`}
      aria-label="直し中の試合"
      className="border-gold flex flex-col gap-2 rounded-[14px] border-2 border-dashed p-2.5"
    >
      <div className="flex items-center gap-2">
        <ClassChip classLabel={match.classLabel} />
        <StatusPill tone="fixing" label="直し中" />
      </div>

      <ScoreBoard
        teamA={match.teamA}
        teamB={match.teamB}
        scores={match.scores}
        maxGameCount={match.maxGameCount}
        shownGame={finishing ? defaultShownGame(match.scores, match.maxGameCount) : shownGame}
        onShownGameChange={chooseGame}
        canScore={canScore && !finishing}
        emphasized={match.isMine}
        onIncrement={(gameNumber, side) => {
          setNotice(null);
          fix?.onIncrement(match.matchId, gameNumber, side);
        }}
        onDecrement={(gameNumber, side) => {
          setNotice(null);
          fix?.onDecrement(match.matchId, gameNumber, side);
        }}
      />

      {finishing && (
        <p className="text-center">
          <RetiredNote names={retiredNames} />
        </p>
      )}

      <ScorerSection
        scorer={scorer}
        canInput={canInput && fix !== undefined}
        rejection={syncStatus?.scorerRejection ?? null}
        showStatus={!finishing}
      />

      <StatusLines lines={syncLines(syncStatus, canInput)} />

      {canScore && !finishing && fix && (
        <>
          {notice && (
            <p role="status" className="text-live text-[13px] font-bold">
              {notice}
            </p>
          )}

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleFinishClick}
              className="bg-btn-dark border-gold flex min-h-11 items-center justify-center gap-2 rounded-[9px] border-[1.5px] text-[14px] font-bold text-white"
            >
              <FlagIcon className="text-gold size-5" />
              もう一度終了する
            </button>
            <button
              type="button"
              onClick={scorer.onRelease}
              className="border-line flex min-h-11 items-center justify-center gap-2 rounded-[9px] border bg-white text-[14px] font-bold"
            >
              <CrossIcon className="size-5" />
              担当をやめる
            </button>
          </div>

          <FinishConfirmSheet
            open={finishSheet?.open ?? false}
            games={confirmGames}
            matchWinnerName={matchWinnerName}
            matchWinnerScoreText={matchWinnerScoreText}
            teamAName={teamAName}
            teamBName={teamBName}
            retiredSide={retiredSide}
            onRetiredSideChange={(side) => finishSheet?.onRetiredSideChange(side)}
            onOk={() => {
              finishSheet?.onClose();
              fix.onFinishMatch(match.matchId, retiredSide);
            }}
            onClose={() => finishSheet?.onClose()}
          />
        </>
      )}
    </section>
  );
}

/** チームの色の小さな四角（1 つ前の行の、チーム名の前）。 */
function TeamDot({ team }: { team: CourtTeam }) {
  return (
    <span
      aria-hidden="true"
      className={`mr-0.5 inline-block size-2 rounded-[2px] ${teamBgClass(team.teamNumber)}`}
    />
  );
}

/**
 * 1 つ前の試合（そのコートで、終了の時刻が一番新しい終わった試合）を 1 行で。「1つ前　愛知北 2-1 愛知西　［直す］」。
 * 1 ゲーム制なら点数、複数ゲーム制なら取ったゲーム数。棄権なら、勝ちと理由を下に添える。
 * 「直す」→ 確認 → 終了の取り消し。取り消されると、その試合は「直し中」として戻ってくる。
 * 出すか・［直す］を出すかは、呼び出し側が決めて渡す（`previous-access.ts`）。
 */
function PreviousRow({
  courtNumber,
  previous,
  lines,
  canInput,
  showFixButton,
  fix,
}: {
  courtNumber: number;
  previous: PreviousMatch;
  lines: string[];
  canInput: boolean;
  showFixButton: boolean;
  fix: FixActions | undefined;
}) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const reopenState = fix?.reopenStateOf(previous.matchId) ?? null;
  const summary = finishSummary(previous, previous.scores, previous.ending);

  const outcome = matchOutcome(previous.scores, previous.maxGameCount);
  const scoreText =
    previous.maxGameCount === 1
      ? (() => {
          const only = playedGameScores(previous.scores)[0];
          return only ? `${only.sideAScore}-${only.sideBScore}` : '0-0';
        })()
      : `${outcome.wonGames[0]}-${outcome.wonGames[1]}`;

  return (
    <div
      data-testid={`previous-match-${courtNumber}`}
      className="border-line mt-1 flex flex-col gap-1 rounded-xl border px-2.5 py-2"
    >
      <div className="flex items-center gap-1.5">
        <ClockIcon className="text-gold size-4 shrink-0" />
        <span className="text-[13px] font-extrabold">1つ前の試合</span>
        {showFixButton && canInput && fix && (
          <button
            type="button"
            disabled={reopenState?.pending ?? false}
            onClick={() => setSheetOpen(true)}
            className="border-line ml-auto min-h-11 min-w-14 shrink-0 rounded-[9px] border bg-white px-3 text-[14px] font-bold disabled:text-gray-400"
          >
            訂正
          </button>
        )}
      </div>
      <p className="tabular bg-gold-soft border-gold-edge mt-0.5 truncate rounded-lg border px-2.5 py-1 text-center text-[12px] font-bold text-gray-800">
        <TeamDot team={previous.teamA} />
        {teamLabel(previous.teamA)} <b className="mx-3 font-extrabold">{scoreText}</b>{' '}
        <TeamDot team={previous.teamB} />
        {teamLabel(previous.teamB)}
      </p>

      {/* 棄権は点数と勝ちが逆になりうるので、勝ちと理由を添える（普通の試合には出さない） */}
      {summary.retiredNames.length > 0 && summary.matchWinnerName && (
        <p className="text-[12px] font-black break-words">
          勝ち: <span className="whitespace-nowrap">{summary.matchWinnerName}</span>{' '}
          <RetiredNote names={summary.retiredNames} />
        </p>
      )}

      <StatusLines lines={lines} />

      {showFixButton && canInput && fix && (
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
      )}
    </div>
  );
}
