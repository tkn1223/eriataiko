'use client';

import { useSyncExternalStore } from 'react';
import { hasAnyPoint } from '@/domain/scoring';
import {
  rejectionKind,
  rejectionMessage,
  retryDelayMs,
  shouldRetry,
} from '@/ui/courts/save-retry-policy';
import { sendRequest } from '@/ui/courts/send-request';
import type { MatchSyncState, ScorerRejection } from '@/ui/courts/types';

/**
 * ＋−で動いた得点を `POST /api/matches/[matchId]/scores` に送る・送り直す・まとめる仕組み。
 * 画面の部品（`courts-page.tsx`）から切り離してここに置く（仕様の「つくりの方針」）。
 *
 * - 同じ試合・同じゲームは送信中は 1 本だけ。返事が来た時点で値が変わっていれば、
 *   最新の値をもう 1 回送る（`sync` を呼ぶたびに「いま送りたい値」を上書きするだけで、
 *   実際の送信本数は増えない）
 * - つながらない／5xx／429 → 間隔を空けて自動で送り直す（save-retry-policy.ts の判断）
 * - それ以外の 4xx → 送り直さず、応答の日本語の理由を残す
 * - まだ保存できていない値がある間は、ブラウザを閉じる・更新しようとしたら確認を出す（beforeunload）
 * - **試合の終了（`POST /api/matches/[matchId]/result`）も同じ預かり場所を通す。** 「試合を終了する」を
 *   押したときに送れていない点があれば、予約して、その試合の点が全部届いてから終了を送る
 *   （終了を先に送ると、サーバーにはまだ無い点を数えずに勝敗が決まってしまう）。押したあとは
 *   「終了を送っています」を出し、得点係は待たずに別の画面や別のコートへ移れる
 *   （仕様 docs/specs/2026-10-09-courts-live-and-finish.md の決めたこと 3）
 *
 * **預かる場所（`appScoreSyncStore`）はアプリ全体で 1 つ。** 結果LIVE の画面とは別に、
 * このファイルが読み込まれたときに 1 度だけ作り、ブラウザのタブを閉じる・更新するまで生き続ける。
 * 以前は画面（`useScoreSync` を呼ぶ部品）と一緒に作って捨てていたため、送れていない点があるまま
 * 下のメニューで別の画面に移ると、送り直しも点も一緒に消えていた（PR #57 レビュー）。
 * 置き場所を「`(app)` の layout に Provider を置く」ではなくモジュールにしたのは、
 * - 預かるのは画面の見た目ではなく、ただの数字と送信の予定なので React の木に載せる必要がなく、
 * - Provider だと「どの画面より外側に置く」ことを layout の作りに頼ることになり、
 *   将来 layout を組み替えたときに黙って捨てられる道が再び開くため。
 * モジュールならどの画面から呼んでも同じ 1 つで、画面の作りに左右されない。
 * **サーバー側の描画では何も預からないし、中身も読まない。** サーバーでもこのファイルは読み込まれ、
 * そこでの預かり場所はアクセスした全員で 1 つになる。もし値が入ったり、描画で中身を読んで HTML に
 * 混ぜたりすると、ある人の未送信の点が別の人の画面に出る。そこで
 * - `sync` はブラウザの外（`window` が無いところ）では何もしない
 * - 描画は `useSyncExternalStore` の 3 番目の引数（サーバー用）で常に空を見る
 * の 2 つで止めている（use-score-sync.server.test.ts と use-score-sync.test.tsx で確かめている）。
 *
 * 送るか諦めるかの判断は `save-retry-policy.ts`。画面を離れても返事は反映し、送り直しも続ける。
 *
 * **送れた点も、購読（Realtime）で戻ってくるまでは手元の値を優先する（戻り待ち）。**
 * 購読の知らせは書いた順に届くが、保存の返事より遅れることがある。5 → 6 と送り、6 の返事が
 * 先に来たあとで 5 の知らせが届くと、数字が 5 に戻って見え、そこで ＋ を押すと 6 をもう一度送って
 * 1 点数えそこねる。そこで、送った値を順に覚えておき、届いた知らせが自分の送った値と一致したら
 * そこまでを消す。自分の最後の値が戻ってくるまでに届いた別の値は、それより前に書かれた古い値なので
 * 当てない（`noteRemoteScore` と `pendingScores`）。戻ってこないまま `ECHO_WAIT_MS` たったら諦める
 * （接続が途切れていた・開いた直後でまだ購読していなかった、など）。
 *
 * **試合の状態（終了・取り消し）にも、同じ戻り待ちがある。** 終了 → すぐ「直す」と進んだあとで、
 * 最初の「終了」の知らせが遅れて届くと、画面が一瞬「1 つ前」に戻って「直し中」の枠が作り直され、
 * 開いていた確認画面が閉じていた。そこで、自分が送った状態（done か live）を順に覚え、
 * 届いた知らせが自分の送った状態と一致したらそこまでを消す。自分の最後の状態が戻るまでに届いた
 * 別の状態は、それより前に書かれた古い知らせなので当てない（`expectMatchEcho` と `noteRemoteMatch`）。
 * 見分けるのは done か live かだけで、棄権の印（終わり方）は見ない。ほかの人が先に別の終わり方で
 * 終了していたときも、届いた中身をそのまま当てて記録どおりにするため。
 * 待つ長さと、つながり直したときにやめるのは点と同じ（`ECHO_WAIT_MS`、`forgetAwaitingEchoes`）。
 * 戻らないまま待ちが終わったとき（知らせの取りこぼし・入口が何も書かずに成功を返した）は、
 * 当てなかった知らせが本物の変化だったかもしれないので、画面に 1 回読み直してもらう
 * （`subscribeMatchEchoGaveUp`）。当てなかった知らせが無ければ読み直さない（100 人の通信量）。
 * 仕様: docs/specs/2026-10-14-courts-stale-result.md
 *
 * **担当を取る・やめる操作（`POST` / `DELETE /api/matches/[matchId]/scorer`）も同じ預かり場所を通す。**
 * 電波が細くて失敗しても入力は止めない（仕様 ⑤）。点は押せて、担当を取る操作は裏で送り直す。
 * 担当がいない試合に点が届けば、入口が送ってきた人を担当にして保存するので、取る操作より先に点が届いても
 * 困らない。やめる操作は、その試合の送れていない点が全部届く（または断られる）まで送らない
 * （先にやめると、遅れて届いた点がまた担当にしてしまう）。1 つの試合に頼める操作は 1 つで、最後の頼みが勝つ。
 * 送った点が「担当でない」と断られたら、ふつうの断られ方とは別に、理由と送れなかった点を知らせとして残す
 * （`scorerRejection`。仕様 ⑧⑨）。
 *
 * **書き方について**: このアプリは React Compiler 向けの ESLint ルール
 * （`react-hooks/refs` など）を有効にしている。「描画（レンダー）の最中に ref を読み書きしない」
 * が特に強いルールなので、進行中の送信をたくさん覚えておく置き場は `useRef` ではなく、
 * React の外のただのオブジェクトにして、描画からは `useSyncExternalStore` 経由でだけ見る。
 *
 * 仕様: docs/specs/2026-09-19-save-score-from-courts.md
 */

export type ScoreSyncInput = {
  matchId: string;
  gameNumber: number;
  sideAScore: number;
  sideBScore: number;
};

export type UseScoreSyncResult = {
  /** そのゲームの「いまの点数」を送る。呼ぶたびに送りたい値を最新にする。 */
  sync: (input: ScoreSyncInput) => void;
  /**
   * 試合の終了を送る。その試合の点が全部届いてから送り、失敗したら送り直す。
   * 送っている途中にもう一度呼んでも、送るのは 1 本だけ。
   * `retiredSide` は確認画面で選んだ棄権の側（無ければ普通の終了）。点が届くのを待つ間も、
   * 送り直す間も預かって、終了の本文に載せる。
   */
  finish: (matchId: string, retiredSide?: 'A' | 'B' | null) => void;
  /** 担当を取る。`takeOver` は「引き継ぐ」と明示したか。失敗しても送り直す。 */
  claimScorer: (matchId: string, takeOver: boolean) => void;
  /** 担当をやめる。その試合の送れていない点が全部届いてから送る。 */
  releaseScorer: (matchId: string) => void;
  /** 担当でないと断られた点の知らせ（「閉じる」）を捨てる。 */
  dismissScorerRejection: (matchId: string) => void;
  /**
   * 試合 id ごとの案内と、まだ送れていない数字。表示するコートが `statusByMatchId[matchId]` を見る。
   * 一度でも送った試合だけが入る（送っていない試合は無い）。
   */
  statusByMatchId: Record<string, MatchSyncState>;
};

const RETRYING_MESSAGE = '保存できていません・送り直しています';
/**
 * 送れた点が購読で戻ってくるのを待つ長さ。購読の知らせは混んでいると数秒遅れることがあるので長めに取る。
 * 長すぎても困るのは、同じゲームを別の人も入れていて、かつ自分の知らせが失われたときに、
 * 相手の点が映るのがこの長さだけ遅れることだけ（担当の表示が入るまでは 2 人で入れない運用）。
 */
export const ECHO_WAIT_MS = 10_000;
/** 点が入口に断られているので、終了は送らなかった。点の側の理由は別に出ている。 */
const FINISH_BLOCKED_MESSAGE = '点が保存できていないため、試合の終了は送っていません。';

type Score = { sideAScore: number; sideBScore: number };

type GameSyncState = {
  matchId: string;
  gameNumber: number;
  /** いま保存したい値（＋−を押すたびに上書きする）。 */
  desired: Score;
  /** 最後に保存できた値。まだ 1 度も保存できていなければ null。 */
  savedAsOf: Score | null;
  inFlight: boolean;
  /** 送り直しの間隔を決めるための、連続失敗回数。 */
  attempt: number;
  retryingMessage: string | null;
  rejectedMessage: string | null;
  retryTimer: ReturnType<typeof setTimeout> | null;
  /**
   * 断られた理由が「担当でない」だったか（`rejectedMessage` がある間だけ意味を持つ）。
   * そうなら、理由と送れなかった点を知らせ（`scorerRejection`）として出し、ふつうの断られ方の
   * 案内（`rejectedMessage`）には出さない。
   */
  rejectedAsNotScorer: boolean;
  /**
   * 送ったが、購読でまだ戻ってきていない値（送った順）。送れなかった値は取り除く。
   * ファイル先頭の「戻り待ち」を参照。
   */
  awaitingEcho: Score[];
  /** 戻り待ちを諦めるタイマー（最後に保存できてから `ECHO_WAIT_MS`）。 */
  echoTimer: ReturnType<typeof setTimeout> | null;
  /**
   * 一度でも 0 対 0 以外の点を押したか。あとで 0 対 0 に戻しても true のまま。
   * 呼出待ちから始めた試合を、別の画面から戻ったときも LIVE の見た目に保つのに使う
   * （画面の `LiveScore.started` と同じ決まり。0 対 0 に戻した値が送れていないまま戻ると、
   * 数字だけでは「始まった試合」と分からず呼出待ちに見えてしまうため）。
   */
  pointPressed: boolean;
};

type FinishState = {
  matchId: string;
  /** 確認画面で選んだ棄権の側。無ければ普通の終了。 */
  retiredSide: 'A' | 'B' | null;
  /**
   * - waiting: その試合の点が全部届くのを待っている（まだ何も送っていない）
   * - sending: 終了を送っている
   * - retrying: 送れなかったので、間隔を空けて送り直すのを待っている
   * - rejected: 送らない（入口に断られた・点が断られている）。もう一度押せば最初からやり直す
   */
  phase: 'waiting' | 'sending' | 'retrying' | 'rejected';
  attempt: number;
  retryTimer: ReturnType<typeof setTimeout> | null;
  rejectedMessage: string | null;
};

/**
 * 担当を取る・やめる操作 1 つ。
 * - waiting: やめる操作が、その試合の送れていない点が全部届くのを待っている（まだ何も送っていない）
 * - sending: 送っている
 * - retrying: 送れなかったので、間隔を空けて送り直すのを待っている
 */
type ScorerOpPhase = 'waiting' | 'sending' | 'retrying';

type ScorerOp = {
  matchId: string;
  kind: 'claim' | 'release';
  /** 「引き継ぐ」と明示した取り方か（取る操作だけ）。 */
  takeOver: boolean;
  phase: ScorerOpPhase;
  attempt: number;
  retryTimer: ReturnType<typeof setTimeout> | null;
};

/** `subscribeScorerOp` が受け取る、担当を取る・やめる操作の終わり方。 */
export type ScorerOpEvent = {
  matchId: string;
  kind: 'claim' | 'release';
  /** accepted: 入口に受け付けられた。rejected: 入口に断られた（もう送らない）。 */
  result: 'accepted' | 'rejected';
};

/** 試合の状態（終了・取り消し）の戻り待ちで覚える、自分が送った状態。終了なら done、取り消しなら live。 */
export type OwnMatchStatus = 'done' | 'live';

/** `expectMatchEcho` が返す、送った結果の知らせ方。 */
export type MatchEchoTicket = {
  /** 入口に受け付けられた。ここから、戻るのを待つ長さ（`ECHO_WAIT_MS`）を数える。 */
  accepted: () => void;
  /** 受け付けられなかった。戻ってこないので待たない。 */
  failed: () => void;
};

type MatchEchoEntry = { status: OwnMatchStatus; accepted: boolean };

type MatchEchoWait = {
  /** 送った順。 */
  awaiting: MatchEchoEntry[];
  /** 戻り待ちを諦めるタイマー（最後に受け付けられてから `ECHO_WAIT_MS`）。 */
  timer: ReturnType<typeof setTimeout> | null;
  /**
   * 待っている間に、自分の送った状態のどれとも違う知らせを当てずに捨てた。自分の状態が戻れば
   * それより古い知らせと分かるが、戻らないまま待ちが終わると本物の変化だったかもしれない。
   */
  droppedChange: boolean;
};

/**
 * 購読で戻ってきた値が、待っている列のどれかと一致したら、そこまでを消した残りを返す。
 * 一致しなければ null。点の戻り待ちと試合の状態の戻り待ちで、この判断を共有する。
 * 同じ値を 2 回送っていることがある（5 → 4 → 5）ので、古いほうの戻りから順に消す。
 */
function dropThroughEcho<T>(awaiting: T[], isEcho: (waited: T) => boolean): T[] | null {
  const echoed = awaiting.findIndex(isEcho);
  return echoed < 0 ? null : awaiting.slice(echoed + 1);
}

function keyOf(matchId: string, gameNumber: number): string {
  return `${matchId}:${gameNumber}`;
}

function sameScore(a: Score | null, b: Score): boolean {
  return a !== null && a.sideAScore === b.sideAScore && a.sideBScore === b.sideBScore;
}

type Listener = () => void;

/**
 * まだサーバーに届いたと確かめられていないか（送信中・送り直し待ち）。
 *
 * 入口に断られたまま（rejectedMessage がある）は数えない。もう送らない点なので、数えると
 * 戻ったときにサーバーの正しい点より断られた古い点が優先して出て（initial-live-scores.ts）、
 * 閉じる・更新するたびの確認もタブを閉じるまで出続ける。理由はコートに出すので点を押し直せる。
 */
function isUnsent(game: GameSyncState): boolean {
  if (game.rejectedMessage !== null) return false;
  return game.inFlight || !sameScore(game.savedAsOf, game.desired);
}

/** 届いた点より手元の値を優先する間か（送れていない、または送れたが購読でまだ戻ってきていない）。 */
function isPending(game: GameSyncState): boolean {
  return isUnsent(game) || game.awaitingEcho.length > 0;
}

function clearEchoTimer(game: GameSyncState) {
  if (game.echoTimer) clearTimeout(game.echoTimer);
  game.echoTimer = null;
}

/**
 * 進行中の送信をぜんぶ覚えておく置き場。**React の外**（ref でも state でもない、
 * ただの JavaScript のオブジェクト）に持つ。描画からは `useSyncExternalStore` 経由でだけ見る。
 */
export type ScoreSyncStore = {
  sync: (input: ScoreSyncInput) => void;
  finish: (matchId: string, retiredSide?: 'A' | 'B' | null) => void;
  claimScorer: (matchId: string, takeOver: boolean) => void;
  releaseScorer: (matchId: string) => void;
  dismissScorerRejection: (matchId: string) => void;
  /**
   * 担当を取る・やめる操作が終わったとき（受け付けられた・断られた）に受け取る。画面は、受け付けられたら
   * 結果を手元の一覧に当て、断られたら読み直して担当の表示を最新にする。送り直している間は呼ばれない。
   */
  subscribeScorerOp: (listener: (event: ScorerOpEvent) => void) => () => void;
  /**
   * 試合の終了が入口に受け付けられたとき、その試合の id と棄権の側（無ければ null）を受け取る。画面が「終わった」を
   * 表に反映するのに使う（Realtime が止まっていても、押した本人の画面はすぐ変わる）。
   * 画面を離れていて受け取る人がいなくても、送り直しは続く。
   */
  subscribeFinished: (
    listener: (matchId: string, retiredSide: 'A' | 'B' | null) => void
  ) => () => void;
  /**
   * 点が入口に断られたとき、その試合の id を受け取る。画面はそのゲームを押した点のまま持っているので、
   * 読み直してサーバーの点に戻すのに使う（戻さないと、次に押した点を断られた点から数えて送る）。
   */
  subscribeScoreRejected: (listener: (matchId: string) => void) => () => void;
  /**
   * その試合の「断られた」の印（点・終了の両方）を捨てる。終了していた試合が取り消されて
   * 進行中に戻ったときに呼ぶ。断られた理由（終了済み）はもう当てはまらないのに、残すと
   * 「点が保存できていない」として終了を止め続ける。
   */
  forgetRejected: (matchId: string) => void;
  /**
   * 購読で届いた点を知らせる。自分が送った値の戻りなら、そこまでの戻り待ちを消す。
   * 画面に当ててよいかは、このあとの `pendingScores` で決まる（まだ手元が優先なら当てない）。
   */
  noteRemoteScore: (input: ScoreSyncInput) => void;
  /**
   * 戻り待ちをすべて諦める。購読がつながった（つながり直した）とき、それより前に送った値の戻りは
   * もう届かないので呼ぶ（待ち続けると、そのゲームの他の人の点を `ECHO_WAIT_MS` のあいだ当てそこねる）。
   */
  forgetAwaitingEchoes: () => void;
  /**
   * 試合の終了・取り消しを送る前に呼び、送った状態を戻り待ちに入れる。返事が来たら `accepted()`、
   * 受け付けられなかったら `failed()` を呼ぶ。送る前に入れるのは、返事より先に知らせが届いたとき
   * （その知らせで待ちを終える）に取りこぼさないため。点と同じ（`attemptSend`）。
   * 試合の終了（`finish`）はこの中で自分で呼ぶ。取り消しは画面（courts-page.tsx）が呼ぶ。
   */
  expectMatchEcho: (matchId: string, status: OwnMatchStatus) => MatchEchoTicket;
  /**
   * 購読で届いた試合の状態の変化を知らせ、画面にこのまま当ててよいかを返す。
   * 自分が送った状態の戻りなら、そこまでの戻り待ちを消す。自分の最後の状態が戻るまでは、
   * 届いたものは古い（またはそれより前に書かれた）知らせなので、false を返す。
   */
  noteRemoteMatch: (change: { matchId: string; status: string }) => boolean;
  /**
   * 試合の状態の戻りを待つのを、戻らないままやめたとき（10 秒たった・送れなかった）、待っている間に
   * 当てなかった知らせがあれば、その試合の id を受け取る。画面はこれで 1 回読み直す。
   * 当てなかった知らせは、自分の送った状態が戻らないと「古いもの」と言い切れない（ほかの人の終了・
   * 取り消しだったかもしれない）。読み直さないと、その試合の次の変化まで画面が記録と食い違う。
   * つながり直したときは、画面がもともと読み直すので呼ばない。
   */
  subscribeMatchEchoGaveUp: (listener: (matchId: string) => void) => () => void;
  /** `useSyncExternalStore` に渡す。呼ぶたびに同じ中身なら同じ参照を返す。 */
  getSnapshot: () => Record<string, MatchSyncState>;
  subscribe: (listener: Listener) => () => void;
  /**
   * 預かっている点・待っている送り直し・beforeunload の見張りをぜんぶ捨てる。
   * アプリの中では呼ばない（アプリごと閉じれば全部消えるため）。テストが 1 つごとに空にするための後片付け。
   */
  dispose: () => void;
};

export function createScoreSyncStore(): ScoreSyncStore {
  const games = new Map<string, GameSyncState>();
  const finishes = new Map<string, FinishState>();
  const matchEchoes = new Map<string, MatchEchoWait>();
  /** 試合ごとに頼める操作は 1 つ（最後の頼みが勝つ）。 */
  const scorerOps = new Map<string, ScorerOp>();
  /** 担当を取る・やめる操作が（担当が移ったこと以外の理由で）断られたときの日本語の理由。 */
  const scorerOpMessages = new Map<string, string>();
  const listeners = new Set<Listener>();
  const finishedListeners = new Set<(matchId: string, retiredSide: 'A' | 'B' | null) => void>();
  const scoreRejectedListeners = new Set<(matchId: string) => void>();
  const matchEchoGaveUpListeners = new Set<(matchId: string) => void>();
  const scorerOpListeners = new Set<(event: ScorerOpEvent) => void>();
  let snapshot: Record<string, MatchSyncState> = {};
  let unloadGuardInstalled = false;

  /**
   * ブラウザを閉じる・更新しようとしたときの確認（beforeunload）。
   * **画面ではなくここ（預かり場所）が持つ。** 画面を離れても、点を預かっている間は確認が要るため。
   * 預かっている点が無いときは外しておく（何も無いのに確認を出さない・リスナーを残さない）。
   */
  function handleBeforeUnload(event: BeforeUnloadEvent) {
    event.preventDefault();
    // Chrome は returnValue を見て確認画面を出す（値そのものは新しいブラウザでは使われない）。
    event.returnValue = '';
  }

  function syncUnloadGuard() {
    if (typeof window === 'undefined') return;
    const needed =
      [...games.values()].some(isUnsent) ||
      [...finishes.values()].some((finish) => finish.phase !== 'rejected');
    if (needed && !unloadGuardInstalled) {
      window.addEventListener('beforeunload', handleBeforeUnload);
      unloadGuardInstalled = true;
    } else if (!needed && unloadGuardInstalled) {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      unloadGuardInstalled = false;
    }
  }

  function recomputeSnapshot() {
    const next: Record<string, MatchSyncState> = {};
    /** その試合の欄。まだ無ければ、何も案内の無い空の欄を作る。 */
    const entryOf = (matchId: string): MatchSyncState =>
      (next[matchId] ??= {
        retryingMessage: null,
        rejectedMessage: null,
        finishing: false,
        finishRetrying: false,
        finishRejectedMessage: null,
        scorerOp: null,
        scorerOpMessage: null,
        scorerRejection: null,
        started: false,
        pendingScores: [],
      });

    for (const game of games.values()) {
      const entry = entryOf(game.matchId);
      entry.retryingMessage = entry.retryingMessage ?? game.retryingMessage;
      // 「担当でない」と断られた点は、ふつうの断られ方の案内ではなく、知らせ（scorerRejection）に出す
      if (!game.rejectedAsNotScorer) {
        entry.rejectedMessage = entry.rejectedMessage ?? game.rejectedMessage;
      } else if (game.rejectedMessage !== null) {
        const rejection: ScorerRejection = entry.scorerRejection ?? {
          message: game.rejectedMessage,
          games: [],
        };
        rejection.games = [
          ...rejection.games,
          { gameNumber: game.gameNumber, ...game.desired },
        ].sort((a, b) => a.gameNumber - b.gameNumber);
        entry.scorerRejection = rejection;
      }
      entry.started = entry.started || game.pointPressed;
      if (isPending(game)) {
        entry.pendingScores = [
          ...entry.pendingScores,
          { gameNumber: game.gameNumber, ...game.desired },
        ];
      }
    }
    // 終了だけを送っている試合（点は押していない）もここで入る
    for (const finish of finishes.values()) {
      const entry = entryOf(finish.matchId);
      entry.finishing = finish.phase !== 'rejected';
      entry.finishRetrying = finish.phase === 'retrying';
      if (finish.retiredSide) entry.finishRetiredSide = finish.retiredSide;
      entry.finishRejectedMessage = finish.phase === 'rejected' ? finish.rejectedMessage : null;
    }
    // 担当を取る・やめる操作だけを送っている試合（点は押していない）もここで入る
    for (const op of scorerOps.values()) {
      entryOf(op.matchId).scorerOp = { kind: op.kind, retrying: op.phase === 'retrying' };
    }
    for (const [matchId, message] of scorerOpMessages) {
      entryOf(matchId).scorerOpMessage = message;
    }
    snapshot = next;
  }

  function notify() {
    recomputeSnapshot();
    syncUnloadGuard();
    for (const listener of listeners) listener();
  }

  function dropMatchEchoWait(matchId: string, wait: MatchEchoWait) {
    if (wait.timer) clearTimeout(wait.timer);
    wait.timer = null;
    if (matchEchoes.get(matchId) === wait) matchEchoes.delete(matchId);
  }

  /** 戻らないまま待ちが空になったとき。当てなかった知らせがあれば、画面に読み直してもらう。 */
  function giveUpMatchEchoWait(matchId: string, wait: MatchEchoWait) {
    dropMatchEchoWait(matchId, wait);
    if (!wait.droppedChange) return;
    for (const listener of matchEchoGaveUpListeners) listener(matchId);
  }

  function expectMatchEcho(matchId: string, status: OwnMatchStatus): MatchEchoTicket {
    const wait = matchEchoes.get(matchId) ?? { awaiting: [], timer: null, droppedChange: false };
    matchEchoes.set(matchId, wait);
    const entry: MatchEchoEntry = { status, accepted: false };
    wait.awaiting.push(entry);

    // 待ちが片づいた（知らせが戻った・諦めた・テストの後片付け）あとの返事は、もう関係ない
    const isCurrent = () => matchEchoes.get(matchId) === wait && wait.awaiting.includes(entry);

    return {
      accepted() {
        if (!isCurrent()) return;
        entry.accepted = true;
        if (wait.timer) clearTimeout(wait.timer);
        wait.timer = setTimeout(() => {
          wait.timer = null;
          // 受け付け済みの分だけ諦める。送っている最中の分は、自分の返事のあとに数え直す
          wait.awaiting = wait.awaiting.filter((waited) => !waited.accepted);
          if (wait.awaiting.length === 0) giveUpMatchEchoWait(matchId, wait);
        }, ECHO_WAIT_MS);
      },
      failed() {
        if (!isCurrent()) return;
        wait.awaiting = wait.awaiting.filter((waited) => waited !== entry);
        if (wait.awaiting.length === 0) giveUpMatchEchoWait(matchId, wait);
      },
    };
  }

  function attemptSend(key: string) {
    const game = games.get(key);
    if (!game) return;

    game.inFlight = true;
    game.retryTimer = null;
    const sending = game.desired;
    game.awaitingEcho.push(sending);

    sendRequest({
      url: `/api/matches/${game.matchId}/scores`,
      method: 'POST',
      body: {
        gameNumber: game.gameNumber,
        sideAScore: sending.sideAScore,
        sideBScore: sending.sideBScore,
      },
    }).then((result) => {
      // 返事を待っている間に dispose された（テストの後片付け）ときは何もしない
      const current = games.get(key);
      if (current !== game) return;
      current.inFlight = false;
      // 届かなかった値は戻ってこない（届いていたとしても、戻りは他の人の点と同じ扱いで構わない）
      if (!result.ok) current.awaitingEcho = current.awaitingEcho.filter((s) => s !== sending);

      // 画面を離れていても返事は反映する。返事を捨てると、保存できたのに「まだ保存できていない」と
      // 覚えたままになる（仕様 2026-10-04 の決めたこと 3）。

      if (result.ok) {
        current.attempt = 0;
        current.retryingMessage = null;
        current.rejectedMessage = null;
        current.savedAsOf = sending;
        clearEchoTimer(current);
        current.echoTimer = setTimeout(() => {
          current.echoTimer = null;
          current.awaitingEcho = [];
          notify();
        }, ECHO_WAIT_MS);
        // 送っている間にさらに値が変わっていれば、最新の値をもう 1 回送る
        if (!sameScore(current.savedAsOf, current.desired)) attemptSend(key);
        // この試合の点が全部届いたなら、待たせていた終了・やめる操作を送る
        startFinishIfReady(current.matchId);
        startScorerOpIfReady(current.matchId);
        notify();
        return;
      }

      if (shouldRetry(result)) {
        current.attempt += 1;
        current.retryingMessage = RETRYING_MESSAGE;
        current.rejectedMessage = null;
        current.retryTimer = setTimeout(() => attemptSend(key), retryDelayMs(current.attempt));
        notify();
        return;
      }

      // shouldRetry が false を返すのは 'http'（4xx）のときだけ（'network' は必ず送り直す）。
      if (result.kind === 'http') {
        current.retryingMessage = null;
        current.rejectedMessage = rejectionMessage(result);
        current.rejectedAsNotScorer = rejectionKind(result) === 'not-scorer';
        // 点が断られたままでは、終了を待たせ続けても送れない。理由を出して待つのをやめる
        startFinishIfReady(current.matchId);
        startScorerOpIfReady(current.matchId);
        notify();
        for (const listener of scoreRejectedListeners) listener(current.matchId);
      }
    });
  }

  /**
   * 終了を待たせている試合の点が全部届いていれば、終了を送る。
   * 点が入口に断られたままなら、送らずに理由を出す（終了を先に送ると、サーバーに無い点を
   * 数えずに勝敗が決まってしまうため）。まだ送っている・送り直し待ちの点があれば、何もしない。
   */
  function startFinishIfReady(matchId: string) {
    const finish = finishes.get(matchId);
    if (!finish || finish.phase !== 'waiting') return;

    const matchGames = [...games.values()].filter((game) => game.matchId === matchId);
    if (matchGames.some((game) => game.rejectedMessage !== null)) {
      finish.phase = 'rejected';
      finish.rejectedMessage = FINISH_BLOCKED_MESSAGE;
      return;
    }
    if (matchGames.some(isUnsent)) return;

    attemptFinish(matchId);
  }

  function attemptFinish(matchId: string) {
    const finish = finishes.get(matchId);
    if (!finish) return;

    finish.phase = 'sending';
    finish.retryTimer = null;
    notify();

    // 送った「終了」が購読で戻ってくるまで、それより古い状態の知らせは画面に当てない
    const echo = expectMatchEcho(matchId, 'done');

    sendRequest({
      url: `/api/matches/${matchId}/result`,
      method: 'POST',
      // 棄権が無い終了は本文なしのまま送る
      ...(finish.retiredSide ? { body: { retiredSide: finish.retiredSide } } : {}),
    }).then((result) => {
      // 返事を待っている間に dispose された（テストの後片付け）ときは何もしない
      if (finishes.get(matchId) !== finish) return;

      if (result.ok) {
        echo.accepted();
        finishes.delete(matchId);
        notify();
        for (const listener of finishedListeners) listener(matchId, finish.retiredSide);
        return;
      }

      // 届かなかった状態は戻ってこない（送り直すときに、また入れる）
      echo.failed();

      if (shouldRetry(result)) {
        finish.attempt += 1;
        finish.phase = 'retrying';
        finish.retryTimer = setTimeout(() => attemptFinish(matchId), retryDelayMs(finish.attempt));
        notify();
        return;
      }

      if (result.kind === 'http') {
        finish.phase = 'rejected';
        finish.rejectedMessage = rejectionMessage(result);
        notify();
      }
    });
  }

  /**
   * 担当をやめる操作を待たせている試合の点が全部届いた（または断られた）なら、送る。
   * 送れていない点（送信中・送り直し待ち）があるうちは何もしない。
   */
  function startScorerOpIfReady(matchId: string) {
    const op = scorerOps.get(matchId);
    if (!op || op.phase !== 'waiting') return;
    if ([...games.values()].some((game) => game.matchId === matchId && isUnsent(game))) return;
    attemptScorerOp(op);
  }

  function attemptScorerOp(op: ScorerOp) {
    op.phase = 'sending';
    op.retryTimer = null;
    notify();

    sendRequest({
      url: `/api/matches/${op.matchId}/scorer`,
      method: op.kind === 'claim' ? 'POST' : 'DELETE',
      // 引き継がない取り方は本文なしのまま送る
      ...(op.kind === 'claim' && op.takeOver ? { body: { takeOver: true } } : {}),
    }).then((result) => {
      // 返事を待っている間に、別の操作に替わった・後片付けされたときは、古い返事なので何もしない
      if (scorerOps.get(op.matchId) !== op) return;

      if (result.ok) {
        scorerOps.delete(op.matchId);
        notify();
        emitScorerOp(op, 'accepted');
        return;
      }

      if (shouldRetry(result)) {
        op.attempt += 1;
        op.phase = 'retrying';
        op.retryTimer = setTimeout(() => attemptScorerOp(op), retryDelayMs(op.attempt));
        notify();
        return;
      }

      if (result.kind === 'http') {
        scorerOps.delete(op.matchId);
        // 担当が移ったのが理由なら、画面の担当の表示がそのまま理由になる。それ以外は理由を出す
        if (rejectionKind(result) === 'other') {
          scorerOpMessages.set(op.matchId, rejectionMessage(result));
        }
        notify();
        emitScorerOp(op, 'rejected');
      }
    });
  }

  function emitScorerOp(op: ScorerOp, result: ScorerOpEvent['result']) {
    for (const listener of scorerOpListeners) {
      listener({ matchId: op.matchId, kind: op.kind, result });
    }
  }

  /** 新しい操作を頼む。それまでの操作（と送り直し待ち）はやめる。 */
  function startScorerOp(matchId: string, kind: ScorerOp['kind'], takeOver: boolean) {
    const previous = scorerOps.get(matchId);
    if (previous?.retryTimer) clearTimeout(previous.retryTimer);
    scorerOpMessages.delete(matchId);

    const op: ScorerOp = {
      matchId,
      kind,
      takeOver,
      phase: 'waiting',
      attempt: 0,
      retryTimer: null,
    };
    scorerOps.set(matchId, op);
    if (kind === 'claim') attemptScorerOp(op);
    else startScorerOpIfReady(matchId);
    notify();
  }

  return {
    sync(input) {
      // サーバー側の描画では何も預からない。このモジュールの預かり場所はサーバーのプロセスでは
      // 全員で 1 つになるので、ここに値が入ると、ある人の点が別の人の画面（HTML）に混ざる。
      // 今は押したとき（ブラウザ）にしか呼ばれないが、将来うっかり描画中に呼んでも入らないように止める。
      if (typeof window === 'undefined') return;

      const key = keyOf(input.matchId, input.gameNumber);
      let game = games.get(key);

      if (!game) {
        game = {
          matchId: input.matchId,
          gameNumber: input.gameNumber,
          desired: { sideAScore: input.sideAScore, sideBScore: input.sideBScore },
          savedAsOf: null,
          inFlight: false,
          attempt: 0,
          retryingMessage: null,
          rejectedMessage: null,
          retryTimer: null,
          rejectedAsNotScorer: false,
          awaitingEcho: [],
          echoTimer: null,
          pointPressed: false,
        };
        games.set(key, game);
      } else {
        game.desired = { sideAScore: input.sideAScore, sideBScore: input.sideBScore };
      }
      if (hasAnyPoint([{ gameNumber: game.gameNumber, ...game.desired }])) game.pointPressed = true;

      // 新しい操作が来たら、それまでの送り直し待ちはやめて、いますぐ試す。
      // 「送り直しています」は保存できるまで消さない（押しただけで消すと、まだ届いていないのに
      // 保存できたように見える）。断られた理由は、今回の値で送り直して改めて判断する。
      if (game.retryTimer) {
        clearTimeout(game.retryTimer);
        game.retryTimer = null;
      }
      game.rejectedMessage = null;
      game.rejectedAsNotScorer = false;

      if (!game.inFlight) attemptSend(key);
      notify();
    },

    finish(matchId, retiredSide = null) {
      // サーバー側の描画では何も預からない（sync と同じ理由）
      if (typeof window === 'undefined') return;

      // 送っている途中の二重押しは、1 本にまとめる（断られたあとの押し直しだけ最初からやり直す）
      const existing = finishes.get(matchId);
      if (existing && existing.phase !== 'rejected') return;

      finishes.set(matchId, {
        matchId,
        retiredSide,
        phase: 'waiting',
        attempt: 0,
        retryTimer: null,
        rejectedMessage: null,
      });
      startFinishIfReady(matchId);
      notify();
    },

    claimScorer(matchId, takeOver) {
      // サーバー側の描画では何も預からない（sync と同じ理由）
      if (typeof window === 'undefined') return;
      startScorerOp(matchId, 'claim', takeOver);
    },

    releaseScorer(matchId) {
      if (typeof window === 'undefined') return;
      startScorerOp(matchId, 'release', false);
    },

    dismissScorerRejection(matchId) {
      let changed = false;
      for (const [key, game] of games) {
        if (
          game.matchId !== matchId ||
          !game.rejectedAsNotScorer ||
          game.rejectedMessage === null
        ) {
          continue;
        }
        // 断られた点はもう送らないので、ゲームごと手放す（押し直せば最初から預かり直す）
        if (game.retryTimer) clearTimeout(game.retryTimer);
        clearEchoTimer(game);
        games.delete(key);
        changed = true;
      }
      if (changed) notify();
    },

    subscribeScorerOp(listener) {
      scorerOpListeners.add(listener);
      return () => {
        scorerOpListeners.delete(listener);
      };
    },

    noteRemoteScore(input) {
      const game = games.get(keyOf(input.matchId, input.gameNumber));
      if (!game || game.awaitingEcho.length === 0) return;

      const remaining = dropThroughEcho(game.awaitingEcho, (score) => sameScore(score, input));
      if (remaining === null) return;
      game.awaitingEcho = remaining;
      if (game.awaitingEcho.length === 0) clearEchoTimer(game);
      notify();
    },

    expectMatchEcho,

    noteRemoteMatch(change) {
      const wait = matchEchoes.get(change.matchId);
      if (!wait) return true;

      const remaining = dropThroughEcho(wait.awaiting, (waited) => waited.status === change.status);
      // 自分が送った状態のどれとも違う。自分の最後の状態が戻るまでは、古い知らせとして当てない
      if (remaining === null) {
        wait.droppedChange = true;
        return false;
      }

      wait.awaiting = remaining;
      if (remaining.length === 0) dropMatchEchoWait(change.matchId, wait);
      // 自分の最後の状態が戻ったときだけ当てる（途中の状態の戻りは、当てると一瞬戻って見える）
      return remaining.length === 0;
    },

    forgetAwaitingEchoes() {
      let changed = false;
      for (const game of games.values()) {
        if (game.awaitingEcho.length === 0) continue;
        // 送信中の値（送るたびに末尾に足すので、いちばん後ろ）は、つながったあとに書かれて
        // 戻ってくることがあるので残す
        const keep = game.inFlight ? game.awaitingEcho.slice(-1) : [];
        if (keep.length === game.awaitingEcho.length) continue;
        game.awaitingEcho = keep;
        if (keep.length === 0) clearEchoTimer(game);
        changed = true;
      }
      for (const [matchId, wait] of matchEchoes) {
        // 送っている最中の状態は、つながったあとに書かれて戻ってくることがあるので残す
        wait.awaiting = wait.awaiting.filter((waited) => !waited.accepted);
        // それまでに当てなかった知らせは、つながったときの読み直しで取り戻すので、もう数えない
        wait.droppedChange = false;
        if (wait.awaiting.length === 0) dropMatchEchoWait(matchId, wait);
      }
      if (changed) notify();
    },

    subscribeFinished(listener) {
      finishedListeners.add(listener);
      return () => {
        finishedListeners.delete(listener);
      };
    },

    subscribeMatchEchoGaveUp(listener) {
      matchEchoGaveUpListeners.add(listener);
      return () => {
        matchEchoGaveUpListeners.delete(listener);
      };
    },

    subscribeScoreRejected(listener) {
      scoreRejectedListeners.add(listener);
      return () => {
        scoreRejectedListeners.delete(listener);
      };
    },

    forgetRejected(matchId) {
      let changed = false;
      for (const [key, game] of games) {
        if (game.matchId !== matchId || game.rejectedMessage === null) continue;
        // 断られた点はもう送らないので、ゲームごと手放す（押し直せば最初から預かり直す）
        if (game.retryTimer) clearTimeout(game.retryTimer);
        clearEchoTimer(game);
        games.delete(key);
        changed = true;
      }
      const finish = finishes.get(matchId);
      if (finish?.phase === 'rejected') {
        finishes.delete(matchId);
        changed = true;
      }
      if (scorerOpMessages.delete(matchId)) changed = true;
      if (changed) notify();
    },

    getSnapshot() {
      return snapshot;
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    dispose() {
      for (const game of games.values()) {
        if (game.retryTimer) clearTimeout(game.retryTimer);
        clearEchoTimer(game);
      }
      for (const finish of finishes.values()) {
        if (finish.retryTimer) clearTimeout(finish.retryTimer);
      }
      for (const op of scorerOps.values()) {
        if (op.retryTimer) clearTimeout(op.retryTimer);
      }
      for (const [matchId, wait] of [...matchEchoes]) dropMatchEchoWait(matchId, wait);
      games.clear();
      finishes.clear();
      scorerOps.clear();
      scorerOpMessages.clear();
      notify();
    },
  };
}

/**
 * アプリ全体で 1 つの預かり場所。どの画面から `useScoreSync` を呼んでも、これを見る。
 * （このファイルの先頭の説明を参照。）
 */
export const appScoreSyncStore: ScoreSyncStore = createScoreSyncStore();

/**
 * サーバー側の描画（Next.js の SSR）では、まだ何も送っていない。
 * `useSyncExternalStore` はサーバーとクライアントの最初の見た目をそろえるための
 * 3 番目の引数（getServerSnapshot）を求めるので、常に空を返す。
 */
const EMPTY_STATUS_BY_MATCH_ID: Record<string, MatchSyncState> = {};

export function useScoreSync(): UseScoreSyncResult {
  const statusByMatchId = useSyncExternalStore(
    appScoreSyncStore.subscribe,
    appScoreSyncStore.getSnapshot,
    () => EMPTY_STATUS_BY_MATCH_ID
  );

  return {
    sync: appScoreSyncStore.sync,
    finish: appScoreSyncStore.finish,
    claimScorer: appScoreSyncStore.claimScorer,
    releaseScorer: appScoreSyncStore.releaseScorer,
    dismissScorerRejection: appScoreSyncStore.dismissScorerRejection,
    statusByMatchId,
  };
}
