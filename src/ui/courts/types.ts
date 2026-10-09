/**
 * /courts（結果LIVE）の画面の形。
 *
 * 元は `sample-data.ts` に型と見本の固定値が同居していたが、DB につないだいまは
 * 「画面の型」と「テスト用の値」を分ける（`/me` と同じ形。PR #53）。型はここ、
 * 値は各テストファイルが自前で小さく組む。
 * `src/usecases/build-courts-view.ts`（DB の行 → ここの型への変換）も、
 * この型をそのまま返す。
 *
 * ゲーム 1 つぶんの得点は src/domain/scoring.ts の GameScore
 * （{ gameNumber, sideAScore, sideBScore }）をそのまま使う。「終わったゲーム」
 * 「進行中のゲーム」を分けて持たない。上限ゲーム数ぶんの枠をどれも押せる形にしたため
 * （docs/specs/2026-09-04-finish-match.md、PR #52 レビュー指摘1）。
 *
 * チームの色・部の色の対応は src/domain/class-labels.ts の 1 か所だけ。ここには持たない
 * （チーム番号はそのまま、部は「文字 + 色の番号」の `ClassLabel` で持つ）。
 */

import type { ClassLabel } from '@/domain/class-labels';
import type { GameScore } from '@/domain/scoring';

export type { ClassLabel, GameScore };

/**
 * コートのカードが 0 枚のときの理由。画面は理由ごとに別の日本語を出す
 * （真っ白だと「アプリが壊れている？」と思われる）。
 * - courts-undecided: 試合は残っているのに、コートが 1 つも決まっていない（朝）
 * - all-finished: 試合は全部終わった（夕方）
 * - no-matches: 試合がそもそも 1 つも登録されていない
 */
export type CourtsEmptyReason = 'courts-undecided' | 'all-finished' | 'no-matches';

export type CourtTeam = {
  /** `teams.team_number`。まだ決まっていなければ null（薄い色になる）。 */
  teamNumber: number | null;
  /** 決まっていれば選手名（ダブルスは2人）。まだ決まっていなければ空配列。 */
  players: string[];
  /**
   * 出場者がまだ決まっていない側の空枠ラベル（`matchups.side_x_slot_label`。例: '予選1位'）。
   * 決まっていれば null。`players` が空のときだけ意味を持つ。
   */
  slotLabel: string | null;
};

export type LiveMatch = {
  /** `matches.id`。得点を保存する入口（`POST /api/matches/[matchId]/scores`）の宛先。 */
  matchId: string;
  classLabel: ClassLabel;
  /** 例: '予選 1回戦' */
  roundLabel: string;
  teamA: CourtTeam;
  teamB: CourtTeam;
  /** 自分の試合には印を付ける。 */
  isMine: boolean;
  /**
   * 得点が入っている枠だけを持てばよい（無い枠は 0 対 0 として扱う）。
   * ページ側で持つ得点状態の初期値としても使う。
   */
  scores: GameScore[];
  /**
   * 勝つのに必要なゲーム数を決める上限。予選リーグ = 1、決勝トーナメント = 3（2 本先取）。
   * DB の `matches.max_game_count` と同じ名前・同じ意味。
   */
  maxGameCount: number;
};

/** 画面を開いている間だけの得点。ページが持ち、カードは受け取って出すだけ。 */
export type LiveScore = {
  scores: GameScore[];
  /** 試合が終わったか。終わったコートは得点を押せなくする。 */
  finished: boolean;
  /**
   * 1 点でも入ったことがあるか。呼出待ちから入力を始めたコートを、0 対 0 に戻しても
   * LIVE の見た目のままにするのに使う（入口の側も一度 LIVE にした試合は呼出待ちに戻さない）。
   * 進行中として読み込んだコートは最初から true。
   */
  started: boolean;
};

export type NextMatch = {
  /**
   * `matches.id`。呼出待ちのコートで先に枠を出すのに使う
   * （docs/specs/2026-09-19-save-score-from-courts.md の「決めたこと」1）。
   */
  matchId: string;
  classLabel: ClassLabel;
  /** 例: '予選 1回戦'。呼出待ちの枠を LIVE の見た目に切り替えたときにも使う。 */
  roundLabel: string;
  teamA: CourtTeam;
  teamB: CourtTeam;
  /** 自分の次の試合には名前を強調する。 */
  isMine: boolean;
  /** LIVE に切り替わったときに並べる枠の数。DB の `matches.max_game_count` と同じ。 */
  maxGameCount: number;
};

/**
 * 送る・送り直す仕組み（`use-score-sync.ts`）がコートに渡す、いまの保存状況。
 * どちらも無ければ何も出さない。
 */
export type ScoreSyncStatus = {
  /** つながらない・5xx・429 で送り直している間の案内。無ければ null。 */
  retryingMessage: string | null;
  /** 4xx で断られ、送り直さないと決めたときの日本語の理由。無ければ null。 */
  rejectedMessage: string | null;
};

/**
 * 試合 1 つぶんの、預かり場所（`use-score-sync.ts`）の中身。
 * 画面を作り直したとき（下のメニューで別の画面から戻ったとき）に、
 * サーバーから読んだ数字より「まだ送れていない数字」を優先して出すために、数字ごと渡す
 * （docs/specs/2026-09-19-save-score-from-courts.md の「2026-10-04 の書き直し」）。
 */
export type MatchSyncState = ScoreSyncStatus & {
  /**
   * この試合で一度でも 0 対 0 以外の点を押したか（あとで 0 対 0 に戻しても true）。
   * 呼出待ちから始めた試合を、別の画面から戻ったときも LIVE の見た目に保つのに使う
   * （`LiveScore.started` と同じ決まり）。
   */
  started: boolean;
  /**
   * まだサーバーに届いたと確かめられていないゲームの、いま押している点数
   * （送信中・送り直し待ち・入口に断られたまま、のどれも含む）。無ければ空。
   */
  unsentScores: GameScore[];
};

/**
 * 試合 1 つぶんの「いまの様子」。画面が持つ元データ（サーバーから読んだ行と、あとから届いた変化を
 * 当てた結果）で、コートのカード（`Court`）はここから `derive-courts.ts` が組み立てる。
 *
 * カードの形（`LiveMatch` / `NextMatch`）ではなく平らな一覧で持つのは、届いた変化が
 * 「どの試合の状態が変わったか」の形で来るため。カードの形のままだと、変化のたびに
 * 木を辿って差し替えることになり、試合がコートを移るときや、次の試合が繰り上がるときに崩れる。
 */
export type CourtMatchStatus = 'waiting' | 'live' | 'done';

export type CourtMatch = {
  matchId: string;
  status: CourtMatchStatus;
  courtNumber: number | null;
  orderInCourt: number | null;
  /** 終了した時刻（ISO 8601）。終了していなければ null。「1 つ前」を決めるのに使う。 */
  finishedAt: string | null;
  /**
   * 終了を取り消して直している試合か。この画面で取り消した、または取り消されたのを見た試合だけ true。
   * 取り消しても表には痕が残らない（live に戻り、finished_at が空になるだけ）ので、
   * 開き直した画面では分からない（ただの進行中として出る）。
   */
  reopened: boolean;
  classLabel: ClassLabel;
  roundLabel: string;
  teamA: CourtTeam;
  teamB: CourtTeam;
  isMine: boolean;
  maxGameCount: number;
  /** サーバーから届いた得点（手元で押した分も含む）。無い枠は 0 対 0。 */
  scores: GameScore[];
};

export type Court = {
  courtNumber: number;
  /** 進行中の試合。無いコートは「呼出待ち」または「予定なし」になる。 */
  live: LiveMatch | null;
  /** 次の試合。無ければコートに「次」は出さない。 */
  next: NextMatch | null;
};

/**
 * このコートにいま入力できる試合の id。進行中があればその試合、無くて
 * 呼出待ち（選手だけ）なら次の試合。どちらも無ければ null（入力できない）。
 * `use-score-sync.ts` の `sync` に渡す宛先や、`statusByMatchId` を引く鍵に使う。
 */
export function activeMatchId(court: Court, canInput: boolean): string | null {
  if (court.live) return court.live.matchId;
  if (canInput && court.next) return court.next.matchId;
  return null;
}
