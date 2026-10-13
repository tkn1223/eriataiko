import 'server-only';

import {
  findDivisions,
  findMyParticipantId,
  selectMatchRows,
  toViewMatchRow,
  withinLimit,
} from '@/db/courts';
import { createSupabaseServerClient } from '@/db/server';
import type { MatchesViewInput } from '@/usecases/build-matches-view';

/**
 * `/matches`（進行表）が読む DB の行。**読み取りだけ**（`createSupabaseServerClient()`）。
 *
 * 結果LIVE（`src/db/courts.ts`）は進行中と未実施の試合だけを読むが、進行表は
 * **終わった試合も出す画面**なので、いまの大会の全試合を読む。試合 1 行の読み方
 * （選ぶ列・埋め込みの上限・名前や点数の取り出し）は結果LIVE と同じものを使い回す。
 *
 * 開くたびの読み込みは、部・試合・自分の参加者情報の 3 回を同時に読む
 * （`findCurrentCompetitionId` と合わせて 4 回・2 段）。開いたあとは届いた変化だけを画面で当てるので、
 * 点が変わるたびには読まない（読み直すのは、購読がつながったときと、知らない試合の変化が届いたときだけ）。
 *
 * 一覧の上限（AGENTS.md の「一覧を読むクエリには .limit() を付ける」）は、`courts.ts` と同じく
 * **上限より 1 件多く読み**、超えたら `truncated` で分かるようにする（超えた 1 件は判定にだけ使い、渡さない）。
 */

/**
 * 進行表で読む試合の上限。大会の規模（100 人・1 人 5 試合で 125 試合ほど）の倍以上の余裕を持たせる。
 * 試合 1 つぶんは名前・点数つきで重いので、むやみに大きくしない。
 */
export const MAX_BOARD_MATCHES = 300;

/**
 * `/matches` が要るものをまとめて読む。
 *
 * どの大会かは呼び出し側（`page.tsx`）が決めて渡す。`playerId` は選手として入った人の `players.id`。
 * 観戦者・未入場は null を渡すと `myParticipantId` は常に null になる（isMine は常に false 扱い）。
 */
export async function findMatchesBoardData(
  competitionId: string,
  playerId: string | null
): Promise<MatchesViewInput> {
  const supabase = createSupabaseServerClient();

  const [divisions, matches, myParticipantId] = await Promise.all([
    findDivisions(supabase, competitionId),
    findAllMatches(supabase, competitionId),
    playerId ? findMyParticipantId(supabase, competitionId, playerId) : Promise.resolve(null),
  ]);

  return {
    myParticipantId,
    divisions: divisions.rows,
    matches: matches.rows,
    truncated: divisions.overflowed || matches.overflowed,
  };
}

/**
 * いまの大会の全試合（終わった・進行中・これから）。
 *
 * 上限を超えたとき**どの行が欠けるかが決まっている**よう、コート番号・順番で並べる
 * （欠けるのはコートが未定の試合と、番号の大きいコートのほう）。
 */
async function findAllMatches(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  competitionId: string
) {
  const { data, error } = await selectMatchRows(supabase, competitionId)
    .order('court_number', { ascending: true })
    .order('order_in_court', { ascending: true })
    .limit(MAX_BOARD_MATCHES + 1);
  if (error) throw error;

  const { rows, overflowed } = withinLimit(data ?? [], MAX_BOARD_MATCHES);
  return { rows: rows.map(toViewMatchRow), overflowed };
}
