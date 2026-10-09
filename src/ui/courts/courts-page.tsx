'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { hasAnyPoint, type GameScore } from '@/domain/scoring';
import { applyLiveChange, type LiveChange } from '@/ui/courts/apply-live-change';
import { CourtLiveCard } from '@/ui/courts/court-live-card';
import { deriveCourts } from '@/ui/courts/derive-courts';
import { createLiveBoard } from '@/ui/courts/live-board';
import { overlayUnsentScores } from '@/ui/courts/overlay-unsent-scores';
import { createRefreshScheduler } from '@/ui/courts/refresh-scheduler';
import {
  activeMatchId,
  type CourtMatch,
  type CourtsEmptyReason,
  type LiveScore,
} from '@/ui/courts/types';
import { useLiveUpdates } from '@/ui/courts/use-live-updates';
import { appScoreSyncStore, useScoreSync } from '@/ui/courts/use-score-sync';

type Props = {
  /**
   * 試合の一覧（読み込んだ時点の様子）。コートのカードはここから組み立てる。
   * 読み直されて新しい一覧が渡されたら、画面が持っている様子を置き換える。
   */
  board: CourtMatch[];
  /** いまの段のラベル（例: '予選リーグ' → 決勝が始まると '決勝トーナメント'）。 */
  stageLabel: string;
  completedMatches: number;
  totalMatches: number;
  /**
   * 得点を押せる人（選手として入った人）かどうか。false（観戦者・未入場）のときは
   * どのコートも「−」「＋」「試合を終了する」を出さず、得点は数字で見せるだけ
   * （docs/specs/2026-09-19-courts-real-data.md の「決めたこと」3）。
   */
  canInput: boolean;
  /** `courts` が空のときだけ入る。理由ごとに別の案内を出す。 */
  emptyReason: CourtsEmptyReason | null;
  /** 読む上限を超えて、コートや消化数が出しきれていないかもしれない。 */
  truncated: boolean;
};

/**
 * コートのカードが 0 枚のときの案内。
 * 真っ白のままだと「アプリが壊れている？」と思われるので、理由ごとに言葉を変える。
 */
function EmptyCourtsNotice({ reason }: { reason: CourtsEmptyReason }) {
  return (
    <div
      data-testid="courts-empty-notice"
      className="rounded-[14px] border border-gray-200 bg-white px-[14px] py-5 text-center"
    >
      {reason === 'courts-undecided' && (
        <>
          <p className="text-[15px] font-black">コートがまだ決まっていません</p>
          <p className="mt-2 text-[13px] text-gray-500">
            決まったら、この画面を開き直すと出てきます。
          </p>
        </>
      )}
      {reason === 'all-finished' && (
        <>
          <p className="text-[15px] font-black">全部終わりました</p>
          <p className="mt-2 text-[13px] text-gray-500">結果は対戦表で見られます。</p>
          <Link
            href="/bracket"
            className="bg-ink mt-3 flex min-h-12 w-full items-center justify-center rounded-xl text-[15px] font-extrabold text-white"
          >
            対戦表を見る
          </Link>
        </>
      )}
      {reason === 'no-matches' && (
        <>
          <p className="text-[15px] font-black">まだ試合が登録されていません</p>
          <p className="mt-2 text-[13px] text-gray-500">運営の方に確認してください。</p>
        </>
      )}
    </div>
  );
}

/** 読み直しの依頼をまとめる間隔（src/ui/courts/refresh-scheduler.ts）。 */
const REFRESH_SETTLE_MS = 300;
const REFRESH_MIN_INTERVAL_MS = 3000;

/**
 * 案内を出すかと、その理由。サーバーが読んだときの理由（`serverReason`）を、
 * いまの試合の様子に合わせて直す。
 * 試合が終わった・取り消されたなどで、読み込んだときの理由が古くなっても、画面が食い違わないように。
 */
function currentEmptyReason(
  board: CourtMatch[],
  hasCardWithMatch: boolean,
  serverReason: CourtsEmptyReason | null
): CourtsEmptyReason | null {
  if (hasCardWithMatch) return null;
  const remaining = board.some((match) => match.status !== 'done');
  if (remaining) return 'courts-undecided';
  // 残っている試合が無い。試合が 1 つも無い大会はそのまま、それ以外は「全部終わった」
  return serverReason === 'no-matches' ? 'no-matches' : 'all-finished';
}

/**
 * 結果LIVE画面（トップ）。
 *
 * 表示だけを担当する。データの出どころ（DB かダミーか）は知らない。
 * 渡す props は `page.tsx` が DB から組み立てる（`src/usecases/build-courts-view.ts`）。
 *
 * 得点は複数のコートで同時に動く。進行表（1 件だけ選んで開く作り）と違い、
 * 試合の id をキーにした一覧（`CourtMatch[]`）をここで持ち、コートのカードはそこから組み立てる。
 *
 * 押した点の保存は `use-score-sync.ts` に任せる（送る・送り直す・まとめる仕組みを
 * 画面の部品から切り離す。docs/specs/2026-09-19-save-score-from-courts.md の「つくりの方針」）。
 * 送れていない点はこの画面ではなくアプリ全体で預かるので、下のメニューで別の画面に移っても
 * 送り直しは続き、戻ってきたらその数字のまま出る。
 *
 * 他の人の点や試合の変化は `use-live-updates.ts` が受け取り、届いた行だけを `applyLiveChange` で
 * 一覧に当てる（画面全体は読み直さない）。手元に無い試合の変化と、途切れたあとのつながり直しのときだけ、
 * 1 回にまとめて読み直す（docs/specs/2026-10-09-courts-live-and-finish.md）。
 */
export function CourtsPage({
  board: serverBoard,
  stageLabel,
  completedMatches,
  totalMatches,
  canInput,
  emptyReason,
  truncated,
}: Props) {
  const router = useRouter();
  const { sync, finish, statusByMatchId } = useScoreSync();

  // 開いたときの様子は、サーバーから読んだ試合に、アプリの中で預かっている「まだ送れていない点」を
  // 重ねたもの（別の画面から戻ったとき、押した点が消えて見えないように。overlay-unsent-scores.ts）。
  const [liveBoard] = useState(() =>
    createLiveBoard(overlayUnsentScores(serverBoard, canInput, appScoreSyncStore.getSnapshot()))
  );
  const board = useSyncExternalStore(liveBoard.subscribe, liveBoard.get, liveBoard.get);

  // 読み直されて新しい一覧が渡されたら置き換える。送れていない点は、重ね直して残す。
  const renderedServerBoard = useRef(serverBoard);
  useEffect(() => {
    if (renderedServerBoard.current === serverBoard) return;
    renderedServerBoard.current = serverBoard;
    liveBoard.set(overlayUnsentScores(serverBoard, canInput, appScoreSyncStore.getSnapshot()));
  }, [serverBoard, canInput, liveBoard]);

  // 読み直しは、依頼をまとめて連続しないようにする。
  const [refreshScheduler] = useState(() =>
    createRefreshScheduler({
      refresh: () => router.refresh(),
      settleMs: REFRESH_SETTLE_MS,
      minIntervalMs: REFRESH_MIN_INTERVAL_MS,
    })
  );
  useEffect(() => () => refreshScheduler.cancel(), [refreshScheduler]);

  function handleLiveChange(change: LiveChange) {
    const result = applyLiveChange(liveBoard.get(), change, appScoreSyncStore.getSnapshot());
    liveBoard.set(result.board);
    if (result.needsRefresh) refreshScheduler.request();
  }

  const connection = useLiveUpdates({
    onChange: handleLiveChange,
    // つながり直したら、途切れている間の変化を取り戻すために 1 回だけ読み直す
    onRecovered: () => refreshScheduler.request(),
  });

  // 終了が受け付けられたら、すぐ表に反映する（Realtime が止まっていても、押した本人の画面は変わる）。
  // あとから本当の終了の時刻が届けば、それに置き換わる。
  useEffect(
    () =>
      appScoreSyncStore.subscribeFinished((matchId) => {
        liveBoard.set(
          liveBoard.get().map((match) =>
            match.matchId === matchId
              ? {
                  ...match,
                  status: 'done',
                  finishedAt: new Date().toISOString(),
                  reopened: false,
                }
              : match
          )
        );
      }),
    [liveBoard]
  );

  const courts = useMemo(() => deriveCourts(board), [board]);

  /** 1 コート・1 ゲームの枠の得点を 1 点だけ動かし、その点数を保存の入口に送る。 */
  function changeScore(courtNumber: number, gameNumber: number, side: 'A' | 'B', delta: 1 | -1) {
    const latestBoard = liveBoard.get();
    const court = deriveCourts(latestBoard).find((c) => c.courtNumber === courtNumber);
    const matchId = court ? activeMatchId(court, canInput) : null;
    const target = latestBoard.find((match) => match.matchId === matchId);
    if (!matchId || !target) return;

    const index = target.scores.findIndex((score) => score.gameNumber === gameNumber);
    const existing = target.scores[index] ?? { gameNumber, sideAScore: 0, sideBScore: 0 };
    // 押し間違いでマイナスの点にならないよう 0 で止める
    const updated: GameScore =
      side === 'A'
        ? { ...existing, sideAScore: Math.max(0, existing.sideAScore + delta) }
        : { ...existing, sideBScore: Math.max(0, existing.sideBScore + delta) };
    const scores =
      index >= 0
        ? target.scores.map((score, i) => (i === index ? updated : score))
        : [...target.scores, updated];

    // 押した点はその場で画面に出し（描画を待たず、最新の一覧から計算する）、同じ値を保存にも渡す。
    liveBoard.set(latestBoard.map((match) => (match === target ? { ...match, scores } : match)));

    sync({
      matchId,
      gameNumber,
      sideAScore: updated.sideAScore,
      sideBScore: updated.sideBScore,
    });
  }

  /**
   * 確認画面の「OK」で呼ばれる。終了を預かり場所に載せる（点が届いてから送られる）。
   * 画面は「終了を送っています」を出し、記録されたら次の試合に切り替わる。
   */
  function finishMatch(courtNumber: number) {
    const court = deriveCourts(liveBoard.get()).find((c) => c.courtNumber === courtNumber);
    const matchId = court ? activeMatchId(court, canInput) : null;
    if (!matchId) return;
    finish(matchId);
  }

  const hasCardWithMatch = courts.some((court) => court.live !== null || court.next !== null);
  const shownEmptyReason = currentEmptyReason(board, hasCardWithMatch, emptyReason);

  return (
    <div className="mx-auto max-w-md px-4 py-4">
      <h1 className="mb-[14px] text-[18px] font-black">結果LIVE</h1>

      <div className="mb-[14px] flex flex-wrap items-center gap-2">
        <span className="bg-ink inline-flex items-center rounded-full px-3 py-1 text-[13px] font-extrabold text-white">
          {stageLabel}
        </span>
        <span className="tabular text-[13px] font-bold text-gray-400">
          {completedMatches}/{totalMatches} 試合消化
        </span>
      </div>

      {connection === 'down' && (
        <p
          role="status"
          data-testid="live-down-notice"
          className="text-live mb-[14px] rounded-[10px] bg-red-100 px-3 py-2 text-[12px] font-extrabold"
        >
          自動更新が止まっています。電波が戻ると自動でつながります。
        </p>
      )}

      {truncated && (
        <p
          role="alert"
          className="text-live mb-[14px] rounded-[10px] bg-red-100 px-3 py-2 text-[12px] font-extrabold"
        >
          試合の数が多すぎて、出しきれていないコートや試合数があるかもしれません。運営の方に知らせてください。
        </p>
      )}

      <h2 className="mb-[10px] text-[15px] font-black">コートの状況</h2>

      {shownEmptyReason && <EmptyCourtsNotice reason={shownEmptyReason} />}

      <div className="flex flex-col gap-[10px]">
        {courts.map((court) => {
          const matchId = activeMatchId(court, canInput);
          const activeMatch = board.find((match) => match.matchId === matchId);
          const syncStatus = matchId ? (statusByMatchId[matchId] ?? null) : null;
          const liveScore: LiveScore | null =
            matchId && activeMatch
              ? {
                  scores: activeMatch.scores,
                  // 終了を送っている間は、終わった見た目にする（記録されたら次の試合に切り替わる）
                  finished: syncStatus?.finishing ?? false,
                  // 進行中の試合は最初から LIVE。呼出待ちの次の試合は、1 点でも入った（自分が押した・
                  // 他の人が入れた）時点で LIVE の見た目になり、0 対 0 に戻しても LIVE のまま。
                  started:
                    court.live !== null ||
                    (syncStatus?.started ?? false) ||
                    hasAnyPoint(activeMatch.scores),
                }
              : null;
          return (
            <CourtLiveCard
              key={court.courtNumber}
              court={court}
              liveScore={liveScore}
              canInput={canInput}
              syncStatus={syncStatus}
              onIncrement={(gameNumber, side) =>
                changeScore(court.courtNumber, gameNumber, side, 1)
              }
              onDecrement={(gameNumber, side) =>
                changeScore(court.courtNumber, gameNumber, side, -1)
              }
              onFinishMatch={() => finishMatch(court.courtNumber)}
            />
          );
        })}
      </div>
    </div>
  );
}
