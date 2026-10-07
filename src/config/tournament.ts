/**
 * ヘッダーに出す大会名の**控え**。
 *
 * ふだんは `competitions.name`（`src/db/competition.ts`）から読む。
 * ここを使うのは、大会がまだ登録されていないときと、DB につながらないとき。
 * 外枠まで倒れると全画面が真っ白になるので、必ず何か出せるようにしておく。
 */
export const TOURNAMENT_NAME = 'バドミントン大会 進行管理';
