import { canFinishMatch, retiredSideOf } from '@/domain/match-rules';
import { hasAnyPoint, type GameScore } from '@/domain/scoring';
import type { BoardMatch } from '@/ui/matches/types';

/**
 * 2b 直す画面の「手元の値」。［−］［＋］・タブ・棄権の 3 択は**ここだけを変える**
 * （試合速報と違って 1 点ずつ送らない。［この内容で訂正する］で全部まとめて送る）。
 * 元の値（`BoardMatch`）と比べて、「元は ◯」と「変えるところ」を作る。DB も画面も触らない。
 *
 * 仕様: docs/specs/2026-11-22-matches-redesign.md
 */

export type CorrectionDraft = {
  /** 1 〜 上限ゲーム数の全ゲーム。点の無いゲームは 0 対 0。 */
  scores: GameScore[];
  retiredSide: 'A' | 'B' | null;
};

export type ChangedGame = {
  gameNumber: number;
  before: [number, number];
  after: [number, number];
};

/** 元の点と棄権をそのまま手元の値にする。 */
export function draftOf(match: BoardMatch): CorrectionDraft {
  return {
    scores: Array.from({ length: match.maxGameCount }, (_, index) => {
      const gameNumber = index + 1;
      const original = match.scores.find((score) => score.gameNumber === gameNumber);
      return {
        gameNumber,
        sideAScore: original?.sideAScore ?? 0,
        sideBScore: original?.sideBScore ?? 0,
      };
    }),
    retiredSide: retiredSideOf(match.ending),
  };
}

/** 指定のゲームの片側の点を変えた新しい値を返す（0 未満・小数は 0 以上の整数に丸める）。 */
export function setScore(
  draft: CorrectionDraft,
  gameNumber: number,
  side: 'A' | 'B',
  value: number
): CorrectionDraft {
  const safe = Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));
  return {
    ...draft,
    scores: draft.scores.map((score) =>
      score.gameNumber !== gameNumber
        ? score
        : side === 'A'
          ? { ...score, sideAScore: safe }
          : { ...score, sideBScore: safe }
    ),
  };
}

function originalScoreOf(match: BoardMatch, gameNumber: number): [number, number] {
  const original = match.scores.find((score) => score.gameNumber === gameNumber);
  return [original?.sideAScore ?? 0, original?.sideBScore ?? 0];
}

/** 元と違うゲーム（番号順）。 */
export function changedGamesOf(match: BoardMatch, draft: CorrectionDraft): ChangedGame[] {
  return draft.scores.flatMap((score) => {
    const before = originalScoreOf(match, score.gameNumber);
    const after: [number, number] = [score.sideAScore, score.sideBScore];
    return before[0] === after[0] && before[1] === after[1]
      ? []
      : [{ gameNumber: score.gameNumber, before, after }];
  });
}

function pairName(team: BoardMatch['teamA']): string {
  return team.players.length > 0 ? team.players.join('・') : (team.slotLabel ?? '未定');
}

/** 「変えるところ」の文。点の変更を番号順に、続けて棄権の付け外し。 */
export function describeChanges(match: BoardMatch, draft: CorrectionDraft): string[] {
  const lines = changedGamesOf(match, draft).map(
    ({ gameNumber, before, after }) =>
      `第${gameNumber}ゲーム ${before[0]}-${before[1]} → ${after[0]}-${after[1]}`
  );

  const before = retiredSideOf(match.ending);
  if (before !== draft.retiredSide) {
    const nameOf = (side: 'A' | 'B') => pairName(side === 'A' ? match.teamA : match.teamB);
    if (draft.retiredSide === null) lines.push('棄権を外す');
    else if (before === null) lines.push(`棄権を付ける（${nameOf(draft.retiredSide)}）`);
    else lines.push(`棄権を ${nameOf(draft.retiredSide)} に変える`);
  }
  return lines;
}

/**
 * 保存してよいか。入口と同じ決まり（1 点も無い・同点は断る）を、送る前にも見せる。
 * 変えていなければ送る意味が無いので、それも理由にする。
 */
export function checkDraft(
  match: BoardMatch,
  draft: CorrectionDraft
): { ok: true } | { ok: false; reason: string } {
  if (describeChanges(match, draft).length === 0) {
    return { ok: false, reason: '変えたところがありません。' };
  }
  if (!hasAnyPoint(draft.scores)) {
    return { ok: false, reason: '1 点も入っていません。点を入れてから訂正してください。' };
  }
  return canFinishMatch(draft.scores, match.maxGameCount);
}

/** `PUT /api/matches/[matchId]/correction` の本文。 */
export function toRequestBody(draft: CorrectionDraft) {
  return {
    scores: draft.scores.map(({ gameNumber, sideAScore, sideBScore }) => ({
      gameNumber,
      sideAScore,
      sideBScore,
    })),
    retiredSide: draft.retiredSide,
  };
}
