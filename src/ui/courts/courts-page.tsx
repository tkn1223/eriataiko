'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useEffectEvent, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { endingOfRetiredSide } from '@/domain/match-rules';
import { hasAnyPoint, type GameScore } from '@/domain/scoring';
import { LiveDownNotice } from '@/ui/components/live-down-notice';
import { applyLiveChange, carryOverReopened, type LiveChange } from '@/ui/courts/apply-live-change';
import { createClock } from '@/ui/courts/clock';
import {
  CourtLiveCard,
  type FixActions,
  type ReopenState,
  type ScorerControl,
} from '@/ui/courts/court-live-card';
import { deriveCourts } from '@/ui/courts/derive-courts';
import { createLiveBoard } from '@/ui/courts/live-board';
import { overlayPendingScores } from '@/ui/courts/overlay-pending-scores';
import {
  createRefreshScheduler,
  REFRESH_MIN_INTERVAL_MS,
  REFRESH_SETTLE_MS,
} from '@/ui/courts/refresh-scheduler';
import { shouldRetry } from '@/ui/courts/save-retry-policy';
import { scorerViewOf } from '@/ui/courts/scorer-view';
import { sendRequest } from '@/ui/courts/send-request';
import {
  activeMatchId,
  type CourtMatch,
  type CourtsEmptyReason,
  type LiveScore,
} from '@/ui/courts/types';
import { useFinishSheets } from '@/ui/courts/use-finish-sheets';
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
  /**
   * 選手として入った人の participants.id。担当が自分かの判断に使う。観戦者・未入場は null。
   * （試合の担当は参加者の id で届くので、入場している人の id ではなくこちらで比べる）
   */
  myParticipantId: string | null;
  /** 参加者の id → 担当として出す名前（「愛知南のたろう」）。担当の変化は id だけで届くので、名前はここから引く。 */
  scorerLabels: Record<string, string>;
};

/**
 * 他の人が担当の試合がある間、時計を進める間隔。5 分で外れる担当を、開いたままの画面で
 * 「入力する人がいません」に切り替えるのに使う。細かくしても見た目の差は無い（外れる判断は 5 分刻みでなく、
 * 見る側が気づければよい）ので、通信も描き直しも少ない 10 秒にする。
 */
const SCORER_CLOCK_TICK_MS = 10_000;

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

/** 終了の取り消しがつながらない・サーバーの一時的な失敗で届かなかったとき。自動では送り直さない。 */
const REOPEN_RETRY_MESSAGE = '取り消せませんでした。電波を確かめて、もう一度押してください。';
const REOPEN_REJECTED_FALLBACK = '取り消せませんでした。画面を更新してから確認してください。';

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
 * 終了していた試合が進行中に戻った（「直す」で取り消された）ら、その試合の「断られた」の印を捨てる。
 * 断られた理由（終了済み）はもう当てはまらないのに、残すと「点が保存できていない」として
 * 「もう一度終了する」を止め続ける（use-score-sync.ts の forgetRejected）。
 */
function forgetRejectionsOfReopened(before: CourtMatch[], after: CourtMatch[]) {
  const doneBefore = new Set(
    before.filter((match) => match.status === 'done').map((match) => match.matchId)
  );
  for (const match of after) {
    if (match.status === 'live' && doneBefore.has(match.matchId)) {
      appScoreSyncStore.forgetRejected(match.matchId);
    }
  }
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
 * 一覧に当てる（点が変わるたびに画面全体を読み直さない）。読み直すのは、購読がつながったとき
 * （開いて最初と、途切れたあと）と、手元に無い試合の変化が届いたときだけで、
 * 1 回にまとめる（docs/specs/2026-10-09-courts-live-and-finish.md）。
 */
export function CourtsPage({
  board: serverBoard,
  stageLabel,
  completedMatches,
  totalMatches,
  canInput,
  emptyReason,
  truncated,
  myParticipantId,
  scorerLabels,
}: Props) {
  const router = useRouter();
  const { sync, finish, claimScorer, releaseScorer, dismissScorerRejection, statusByMatchId } =
    useScoreSync();
  // 5 分で外れる担当を見分けるための「いま」。描画の最中に Date.now() を読まないよう、外部ストアにして
  // 一定の間隔と、知らせが届いたときに進める（clock.ts）
  const [clock] = useState(createClock);
  const now = useSyncExternalStore(clock.subscribe, clock.get, clock.get);

  // 開いたときの様子は、サーバーから読んだ試合に、アプリの中で預かっている「手元の点」を
  // 重ねたもの（別の画面から戻ったとき、押した点が消えて見えないように。overlay-pending-scores.ts）。
  const [liveBoard] = useState(() =>
    createLiveBoard(overlayPendingScores(serverBoard, canInput, appScoreSyncStore.getSnapshot()))
  );
  const board = useSyncExternalStore(liveBoard.subscribe, liveBoard.get, liveBoard.get);
  // 終了の確認画面は試合ごとにここで覚える。開いている試合が終わったら閉じる
  const { finishSheetOf } = useFinishSheets(board);

  // 点を押した人を預かり場所に覚えさせる。送れていない点が残ったまま別の人として入り直したとき、
  // 前の人の点を入り直した人の名前で送らないため（use-score-sync.ts の「押した人と送る人」、仕様 ⑪）
  useEffect(() => appScoreSyncStore.setEntrant(myParticipantId), [myParticipantId]);

  // 担当を取る・やめる操作を始めたときの、その試合の担当（参加者の id）。操作が受け付けられたとき、
  // その間に別の人が取っていたら（その知らせが先に届いていたら）、古い結果で上書きしないための目印
  const [scorerAtOpStart] = useState(() => new Map<string, string | null>());

  /** 試合の担当を、この画面の人から見てどう見せるか（scorer-view.ts）。 */
  function scorerViewOfMatch(match: CourtMatch | undefined) {
    return scorerViewOf({
      scorerParticipantId: match?.scorerParticipantId ?? null,
      scorerClaimedAt: match?.scorerClaimedAt ?? null,
      scoreSavedAtByGame: match?.scoreSavedAtByGame ?? {},
      myParticipantId,
      labels: scorerLabels,
      now,
      scorerOp: match ? statusByMatchId[match.matchId]?.scorerOp : null,
    });
  }

  // 終わっていない試合に、いま「ほかの人が入力中」と見せている担当がある間だけ、時計を進める
  // （5 分で外れた担当を、開いたままの画面で切り替える）。終わった試合にも担当の欄は残るので、
  // 欄だけで決めると 1 日じゅう 10 秒ごとに描き直すことになる。外れたあとは、次の知らせまで変わらない
  const hasActiveOtherScorer = board.some(
    (match) => match.status !== 'done' && scorerViewOfMatch(match).kind === 'other'
  );
  useEffect(() => {
    if (!hasActiveOtherScorer) return;
    const timer = setInterval(() => clock.tick(), SCORER_CLOCK_TICK_MS);
    return () => clearInterval(timer);
  }, [hasActiveOtherScorer, clock]);

  // 読み直しは、依頼をまとめて連続しないようにする。読み直しの間に届いた変化も覚えておく。
  const [refreshScheduler] = useState(() =>
    createRefreshScheduler<LiveChange>({
      refresh: () => router.refresh(),
      settleMs: REFRESH_SETTLE_MS,
      minIntervalMs: REFRESH_MIN_INTERVAL_MS,
    })
  );
  useEffect(() => () => refreshScheduler.cancel(), [refreshScheduler]);

  // 読み直されて新しい一覧が渡されたら置き換える。
  const renderedServerBoard = useRef(serverBoard);
  useEffect(() => {
    if (renderedServerBoard.current === serverBoard) return;
    renderedServerBoard.current = serverBoard;
    // 取り消して直している試合の印（表には痕が残らない）を引き継ぐ
    let reloaded = carryOverReopened(serverBoard, liveBoard.get());
    // 読み直しの間に届いて当てていた変化を、届いた順に当て直す（refresh-scheduler.ts の「当て直す」）。
    // 当てる先の無い変化は、届いたときにもう読み直しを頼んであるので、ここでは頼まない。
    for (const change of refreshScheduler.takeChangesSinceRefresh()) {
      reloaded = applyLiveChange(reloaded, change, appScoreSyncStore.getSnapshot()).board;
    }
    forgetRejectionsOfReopened(liveBoard.get(), reloaded);
    // 手元の点は、重ね直して残す
    liveBoard.set(overlayPendingScores(reloaded, canInput, appScoreSyncStore.getSnapshot()));
  }, [serverBoard, canInput, liveBoard, refreshScheduler]);

  // 点が断られたら読み直して、そのゲームをサーバーの点に戻す。画面は押した点のまま持っているので、
  // 戻さないと次に押した点を断られた点から数えて送ってしまう（終了を取り消されたあとに 2 点ずれる）。
  useEffect(
    () => appScoreSyncStore.subscribeScoreRejected(() => refreshScheduler.request()),
    [refreshScheduler]
  );

  // 自分の終了・取り消しが戻らないまま待ちが終わり、その間に当てなかった知らせがあったら読み直す。
  // 当てなかったのがほかの人の終了・取り消しだったら、読み直さないと次の変化まで記録と食い違う
  useEffect(
    () => appScoreSyncStore.subscribeMatchEchoGaveUp(() => refreshScheduler.request()),
    [refreshScheduler]
  );

  /** 変化を一覧に当てる。読み直しの最中なら、読み直した一覧に当て直すために覚えておく。 */
  function applyChange(change: LiveChange): boolean {
    refreshScheduler.record(change);
    const before = liveBoard.get();
    const result = applyLiveChange(before, change, appScoreSyncStore.getSnapshot());
    forgetRejectionsOfReopened(before, result.board);
    liveBoard.set(result.board);
    return result.needsRefresh;
  }

  function handleLiveChange(change: LiveChange) {
    // 自分が送った点の戻りなら、戻り待ちを消す（そのあとの当てる判断に効く。use-score-sync.ts）
    if (change.kind === 'score') {
      appScoreSyncStore.noteRemoteScore(change);
      // 点が保存された時刻（担当が 5 分で外れるかの元）が届いた。見比べる「いま」も新しくする
      clock.tick();
    } else {
      // 自分が送った終了・取り消しより古い知らせは当てない。当てると画面が一瞬前の状態に戻り、
      // 枠が作り直されて開いていた確認画面が閉じる。当てなかった知らせは読み直しの当て直しにも
      // 入れない（applyChange に渡さない）。
      if (!appScoreSyncStore.noteRemoteMatch(change)) return;
      forgetReopenFailure(change.matchId);
      // 担当の変化が届いた。5 分で外れるかを見る「いま」を新しくしてから当てる
      clock.tick();
    }
    let needsRefresh = applyChange(change);
    // 画面を読み込んだあとに入った参加者が担当になった。名前の表に無いので、読み直して名前を引く
    if (
      change.kind === 'match' &&
      change.scorerParticipantId !== null &&
      !(change.scorerParticipantId in scorerLabels)
    ) {
      needsRefresh = true;
    }
    if (needsRefresh) refreshScheduler.request();
  }

  /**
   * この画面で送った終了・取り消しが受け付けられたら、購読の知らせを待たずに当てる
   * （Realtime が止まっていても、押した本人の画面は変わる）。届いた変化と同じ道を通すのは、
   * 読み直しの最中に受け付けられたときに、読み直した一覧で消されないようにするため。
   * 終了の時刻は画面の時計で仮に入れ、あとから本当の時刻が届けば置き換わる。
   * 棄権の印（ending）は、終了なら選んだ側、取り消しなら普通に戻す（サーバー側と同じ）。
   */
  function applyOwnResult(
    matchId: string,
    status: 'done' | 'live',
    retiredSide: 'A' | 'B' | null = null
  ) {
    const target = liveBoard.get().find((match) => match.matchId === matchId);
    if (!target) return;
    // 先に他の人の終了が届いて done になっていたら当てない。入口は「もう終わっている」試合には
    // 何も書かずに成功を返すので、こちらで選んだ棄権の印は記録されていない。当てると
    // 記録と違う勝ちが自分の画面にだけ出て、知らせはもう来ないので直らない
    if (status === 'done' && target.status === 'done') return;
    applyChange({
      kind: 'match',
      matchId,
      status,
      courtNumber: target.courtNumber,
      orderInCourt: target.orderInCourt,
      finishedAt: status === 'done' ? new Date().toISOString() : null,
      maxGameCount: target.maxGameCount,
      ending: endingOfRetiredSide(status === 'done' ? retiredSide : null),
      // 終了の取り消し（直す）は、押した人がその試合の担当になる。終了では担当は変わらない
      ...(status === 'live' && myParticipantId
        ? { scorerParticipantId: myParticipantId, scorerClaimedAt: new Date().toISOString() }
        : {
            scorerParticipantId: target.scorerParticipantId,
            scorerClaimedAt: target.scorerClaimedAt,
          }),
    });
  }

  /**
   * 担当を取る・やめる操作が受け付けられたら、その結果を手元の一覧に当てる（購読が止まっていても、
   * 押した本人の画面は変わる）。断られたら読み直して、本当の担当を出す。
   * 操作を送っている間に別の人が取っていたら（その知らせが先に届いていたら）、古い結果では上書きしない。
   */
  function applyOwnScorerResult(event: {
    matchId: string;
    kind: 'claim' | 'release';
    result: string;
  }) {
    const startedFrom = scorerAtOpStart.get(event.matchId);
    scorerAtOpStart.delete(event.matchId);
    // 受け付けられなかった／この画面が知らない操作（別の画面から始めて戻ってきた）は、読み直して本当の担当を出す
    if (event.result !== 'accepted' || startedFrom === undefined) {
      refreshScheduler.request();
      return;
    }
    const target = liveBoard.get().find((match) => match.matchId === event.matchId);
    if (!target || target.scorerParticipantId !== startedFrom) return;
    applyChange({
      kind: 'match',
      matchId: target.matchId,
      status: target.status,
      courtNumber: target.courtNumber,
      orderInCourt: target.orderInCourt,
      finishedAt: target.finishedAt,
      maxGameCount: target.maxGameCount,
      ending: target.ending,
      scorerParticipantId: event.kind === 'claim' ? myParticipantId : null,
      scorerClaimedAt: event.kind === 'claim' ? new Date().toISOString() : null,
    });
  }

  const connection = useLiveUpdates({
    onChange: handleLiveChange,
    // つながった（開いて最初に・途切れてから）ら、つながる前の変化を取り戻すために 1 回だけ読み直す。
    // つながる前に送った点の戻りはもう届かないので、待つのをやめる（use-score-sync.ts の「戻り待ち」）
    onConnected: () => {
      appScoreSyncStore.forgetAwaitingEchoes();
      refreshScheduler.request();
    },
  });

  const handleOwnFinish = useEffectEvent((matchId: string, retiredSide: 'A' | 'B' | null) =>
    applyOwnResult(matchId, 'done', retiredSide)
  );
  useEffect(
    () =>
      appScoreSyncStore.subscribeFinished((matchId, retiredSide) =>
        handleOwnFinish(matchId, retiredSide)
      ),
    []
  );

  const handleScorerOp = useEffectEvent(applyOwnScorerResult);
  useEffect(() => appScoreSyncStore.subscribeScorerOp((event) => handleScorerOp(event)), []);

  const courts = useMemo(() => deriveCourts(board), [board]);

  /** 試合の入力担当の見せ方と操作。今の試合も、直し中の試合も、試合の id で引く。 */
  function scorerControlOf(matchId: string): ScorerControl {
    return {
      view: scorerViewOfMatch(board.find((m) => m.matchId === matchId)),
      onClaim: () => startScorerOp(matchId, () => claimScorer(matchId, false)),
      onTakeOver: () => startScorerOp(matchId, () => claimScorer(matchId, true)),
      onRelease: () => startScorerOp(matchId, () => releaseScorer(matchId)),
      onDismissRejection: () => dismissScorerRejection(matchId),
    };
  }

  /** 操作を始める。そのときの担当を覚えておいて、受け付けられたときの上書きの判断に使う。 */
  function startScorerOp(matchId: string, start: () => void) {
    const target = liveBoard.get().find((match) => match.matchId === matchId);
    scorerAtOpStart.set(matchId, target?.scorerParticipantId ?? null);
    start();
  }

  /** 1 つの試合の 1 ゲームの得点を 1 点だけ動かし、その点数を保存の入口に送る。 */
  function changeScoreOfMatch(matchId: string, gameNumber: number, side: 'A' | 'B', delta: 1 | -1) {
    // 点を入れられるのは担当（自分）だけ。担当でない画面は ＋ − を出さないが、古い画面から届いた押下でも送らない
    if (scorerControlOf(matchId).view.kind !== 'mine') return;
    const latestBoard = liveBoard.get();
    const target = latestBoard.find((match) => match.matchId === matchId);
    if (!target) return;

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

  /** そのコートで、いま点を入れられる試合（今の試合、無ければ呼出待ちの次の試合）の id。 */
  function activeMatchIdOfCourt(courtNumber: number): string | null {
    const court = deriveCourts(liveBoard.get()).find((c) => c.courtNumber === courtNumber);
    return court ? activeMatchId(court, canInput) : null;
  }

  function changeScore(courtNumber: number, gameNumber: number, side: 'A' | 'B', delta: 1 | -1) {
    const matchId = activeMatchIdOfCourt(courtNumber);
    if (matchId) changeScoreOfMatch(matchId, gameNumber, side, delta);
  }

  // 終了の取り消し（「直す」）。点や終了と違って、自動では送り直さない（取り消しは押した人が
  // 結果を見て決める操作で、勝手に繰り返すと、あとから別の人が終了したのを取り消してしまうため）。
  // 失敗したら理由を出して、もう一度押してもらう。
  const [reopenStates, setReopenStates] = useState<Record<string, ReopenState>>({});

  async function reopenMatch(matchId: string) {
    if (reopenStates[matchId]?.pending) return;
    setReopenStates((previous) => ({ ...previous, [matchId]: { pending: true, error: null } }));

    // 取り消しが購読で戻ってくるまで、それより古い「終了」の知らせは当てない（use-score-sync.ts）
    const echo = appScoreSyncStore.expectMatchEcho(matchId, 'live');
    const result = await sendRequest({ url: `/api/matches/${matchId}/result`, method: 'DELETE' });

    if (result.ok) {
      echo.accepted();
      setReopenStates((previous) => {
        const rest = { ...previous };
        delete rest[matchId];
        return rest;
      });
      // 取り消されたら、その場で「直し中」にする（終わった試合が live に戻るので、直し中の印が付く）
      applyOwnResult(matchId, 'live');
      return;
    }

    echo.failed();
    const error = shouldRetry(result)
      ? REOPEN_RETRY_MESSAGE
      : result.kind === 'http'
        ? (result.message ?? REOPEN_REJECTED_FALLBACK)
        : REOPEN_RETRY_MESSAGE;
    setReopenStates((previous) => ({ ...previous, [matchId]: { pending: false, error } }));
  }

  /**
   * 試合の様子が変わったら、その試合の「取り消せませんでした」を消す。
   * 別の人が取り消して直し、もう一度終了して 1 つ前に戻ってきたときに、古い失敗の案内が残らないように。
   */
  function forgetReopenFailure(matchId: string) {
    setReopenStates((previous) => {
      if (!previous[matchId]?.error) return previous;
      const rest = { ...previous };
      delete rest[matchId];
      return rest;
    });
  }

  /** 直し中の試合と 1 つ前に渡す操作。今の試合と違い、試合の id ごとに呼ぶ。 */
  const fixActions: FixActions = {
    syncStatusOf: (matchId) => statusByMatchId[matchId] ?? null,
    reopenStateOf: (matchId) => reopenStates[matchId] ?? null,
    onIncrement: (matchId, gameNumber, side) => changeScoreOfMatch(matchId, gameNumber, side, 1),
    onDecrement: (matchId, gameNumber, side) => changeScoreOfMatch(matchId, gameNumber, side, -1),
    onFinishMatch: (matchId, retiredSide) => finish(matchId, retiredSide),
    finishSheetOf,
    onReopen: (matchId) => void reopenMatch(matchId),
  };

  const hasCardWithMatch = courts.some(
    (court) => court.live !== null || court.next !== null || court.fixing.length > 0
  );
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

      {connection === 'down' && <LiveDownNotice />}

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
          // 確認画面の「OK」は、このカードの試合（確認画面を開いた試合）を終了する。
          // 押した瞬間のコートから引き直すと、開いている間に入れ替わった次の試合を終了してしまう
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
              onFinishMatch={(retiredSide) => matchId && finish(matchId, retiredSide)}
              finishSheetOf={finishSheetOf}
              scorerOf={scorerControlOf}
              fix={fixActions}
            />
          );
        })}
      </div>
    </div>
  );
}
