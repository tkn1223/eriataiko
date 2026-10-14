import { ApiError } from '@/server/route-helpers';
import {
  SCORER_ERROR_CODE,
  scorerStanding,
  type ScorerSlot,
  type ScorerStanding,
} from '@/domain/scorer';

/**
 * 得点の保存・試合の終了・担当を取る／やめるが共通で使う、試合の入力担当まわりの部品。
 * 決まりそのもの（5 分・引き継ぎ）は `src/domain/scorer.ts`。ここは入口の usecase が
 * 同じ断り方・同じ書き方をそろえるための置き場。
 *
 * 仕様: docs/specs/2026-10-14-match-scorer.md
 */

/** いまの担当。`findMatch` が読んで渡す。 */
export type MatchScorer = {
  /** `matches.scorer_participant_id`。 */
  participantId: string;
  /** その参加者の `players.id`。入場している人（セッション）と比べるのに使う。 */
  playerId: string;
  /** 断る理由に載せる名前（「愛知南のたろう」。「さん」は付けない）。 */
  label: string;
  /**
   * 担当が最後に点を入れた時刻。`matches.scorer_claimed_at`（担当になった時刻）と、その試合の
   * `game_scores.updated_at` の一番新しいものの遅いほう（`lastScoredAtOf`）。
   */
  lastScoredAt: Date;
};

/** 担当の書き込みで DB に求める操作の約束。実装は `src/db/matches.ts`。 */
export type ScorerWriteRepository = {
  /**
   * その試合の大会での、その人の `participants.id`。参加者として登録されていなければ null。
   * 担当になれるのは参加者だけ（`matches.scorer_participant_id` が参加者を指すため）。
   */
  findParticipantOfPlayer(input: { matchId: string; playerId: string }): Promise<string | null>;
  /**
   * 担当を `participantId` にし、担当になった時刻（`matches.scorer_claimed_at`）を `now` にする。
   * **いまの担当が `expectedHolderParticipantId`（空なら「担当なし」）のままのときだけ**書く。
   * 読んでから書くまでの間に別の人が取っていたら書かずに false を返す（同時に取った 2 人の後勝ちで、
   * 先に取った人の点が黙って断られるのを防ぐ）。
   */
  setScorer(input: {
    matchId: string;
    participantId: string;
    expectedHolderParticipantId: string | null;
    now: Date;
  }): Promise<boolean>;
  /** 担当を空にする。いまの担当が `expectedHolderParticipantId` のままのときだけ。書けたら true。 */
  clearScorer(input: { matchId: string; expectedHolderParticipantId: string }): Promise<boolean>;
};

export function scorerSlotOf(scorer: MatchScorer | null): ScorerSlot {
  return { holderId: scorer?.playerId ?? null, lastScoredAt: scorer?.lastScoredAt ?? null };
}

/** 入場している人（`playerId`）から見た、その試合の担当の立場。 */
export function standingOfPlayer(
  scorer: MatchScorer | null,
  playerId: string,
  now: Date
): ScorerStanding {
  return scorerStanding(scorerSlotOf(scorer), playerId, now);
}

/** ほかの人が担当中（5 分以内）。いまの担当の名前を添えて断る。 */
export function otherIsScoringError(scorer: MatchScorer, ending: string): ApiError {
  return new ApiError(
    409,
    `${scorer.label}さんが担当しています。${ending}`,
    SCORER_ERROR_CODE.notScorer
  );
}

/** 読んでから書くまでの間に、担当がほかの人に移った。 */
export function scorerChangedError(): ApiError {
  return new ApiError(
    409,
    '担当がほかの人に移りました。画面を更新して、もう一度確かめてください。',
    SCORER_ERROR_CODE.notScorer
  );
}

/** 参加者として登録されていない人（別の大会の入場のままなど）。 */
export function notParticipantError(): ApiError {
  return new ApiError(
    403,
    'この大会の参加者として登録されていないため、入力の担当になれません。運営の方に知らせてください。'
  );
}

/**
 * 点を保存してよい状態にする。担当の欄を整えてから、呼び出し側が点を書く。
 *
 * - 自分が担当: そのまま通す。担当の欄は書かない（「最後に点を入れた時刻」は、このあと点を書くときに
 *   新しくなる `game_scores.updated_at` で表す。matches も書くと全員への知らせが 1 点あたり 2 通になる）
 * - 担当がいない（外れた）: 送ってきた人を担当にする。担当を取る操作が電波で失敗していても、
 *   点は止めない（仕様 ⑤）ための道
 * - ほかの人が担当中: 断る（いまの担当の点を上書きしない。仕様 ⑧）
 *
 * @returns 新しく担当になったか（記録 `scorer.claim` を残すかの判断に使う）
 */
export async function secureScorerForScoring(
  deps: Pick<ScorerWriteRepository, 'findParticipantOfPlayer' | 'setScorer'>,
  input: { matchId: string; scorer: MatchScorer | null; playerId: string; now: Date }
): Promise<{ claimed: boolean }> {
  const standing = standingOfPlayer(input.scorer, input.playerId, input.now);

  if (standing === 'other') {
    // 画面はこの理由に「送れなかった点」を添えて出す（理由は名前だけにしておく。仕様 ⑧）
    throw otherIsScoringError(input.scorer!, '');
  }

  // 読んでから点を書くまでの数十ミリ秒に引き継がれると、その 1 点は通る（担当の欄を書かないので
  // 確かめようがない）。前は担当の欄を書き直して確かめていたが、それでも「書き直してから点を書くまで」の
  // すき間は残っていた。1 点のために知らせを 2 通にするほどの差は無いので、確かめない
  if (standing === 'mine') return { claimed: false };

  const participantId = await deps.findParticipantOfPlayer({
    matchId: input.matchId,
    playerId: input.playerId,
  });
  if (!participantId) throw notParticipantError();

  const claimed = await deps.setScorer({
    matchId: input.matchId,
    participantId,
    expectedHolderParticipantId: input.scorer?.participantId ?? null,
    now: input.now,
  });
  if (!claimed) throw scorerChangedError();
  return { claimed: true };
}
