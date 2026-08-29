-- =====================================================================
-- 表と列の名前を、中身に合う名前に直す
-- =====================================================================
--
-- 経緯と「なぜそう決めたか」は docs/specs/2026-08-29-naming-review.md。
--
-- **中身は 1 つも変えない。** 名前を付け替えるだけ。
-- 例外は entries.can_input で、これだけは列ごと消す（理由は仕様書）。
--
-- 名前を変えるだけでもマイグレーションを分けているのは、あとで
-- 「どこで名前が変わったか」を 1 ファイル見れば分かるようにするため。
--
-- **索引・制約・ポリシーの名前は自動では変わらない。**
-- 表や列の名前を変えても、`entries_pkey` のような古い名前がそのまま残る。
-- 残すと、エラーメッセージに存在しない表の名前が出て人が混乱するので、
-- ここで全部そろえる。
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. 表の名前
-- ---------------------------------------------------------------------
-- entries      → participants  「申し込み」ではなく「その大会でのその人」だから
-- team_matches → matchups      matches と似すぎていて親子に見えないから
-- games        → game_scores   1 行が持つのは 1 ゲームぶんの「得点」だから

alter table public.entries      rename to participants;
alter table public.team_matches rename to matchups;
alter table public.games        rename to game_scores;

-- Realtime の配信対象は表そのものを指しているので、名前を変えても外れない
-- （supabase_realtime には matches と game_scores が入ったまま）。


-- ---------------------------------------------------------------------
-- 2. 列の名前
-- ---------------------------------------------------------------------

-- 並び順の名前は役割で書き分ける。
--   画面に出すだけの順      → sort_order
--   大会の中身に関わる順    → order_in_**
-- order という列名にしたかったが、order は SQL の予約語なので使えない。

alter table public.divisions rename column display_order to sort_order;

alter table public.teams rename column number        to team_number;
alter table public.teams rename column display_order to sort_order;

alter table public.players rename column number to player_number;

alter table public.stages rename column kind          to format;
alter table public.stages rename column display_order to sort_order;

-- A・B が「何の A・B」か名前から分からなかったので side を頭に付ける。
-- A が誰かの定義はこの表の side_a_team_id ただ 1 か所。
-- **コートの左右とも画面の左右とも関係ない**（1 ゲームごとに入れ替わるため）。
alter table public.matchups rename column label         to round_name;
alter table public.matchups rename column team_a_id     to side_a_team_id;
alter table public.matchups rename column team_b_id     to side_b_team_id;
alter table public.matchups rename column slot_a_label  to side_a_slot_label;
alter table public.matchups rename column slot_b_label  to side_b_slot_label;
alter table public.matchups rename column display_order to sort_order;

alter table public.matches rename column team_match_id       to matchup_id;
alter table public.matches rename column order_in_team_match to order_in_matchup;
-- outcome（結果）に勝敗は入っていない。入っているのは終わり方だけ。
alter table public.matches rename column outcome to ending;

alter table public.match_players rename column entry_id     to participant_id;
alter table public.match_players rename column player_order to order_in_pair;

alter table public.game_scores rename column score_a to side_a_score;
alter table public.game_scores rename column score_b to side_b_score;

alter table public.write_logs rename column detail to action_detail;


-- ---------------------------------------------------------------------
-- 3. participants.can_input を消す
-- ---------------------------------------------------------------------
-- 得点を入力できないのは観戦者だけで、観戦者は participants に行を持たない
-- （入場の Cookie の role が viewer。src/app/api/session/route.ts）。
-- 参加者は can_input に関係なく全員が合言葉を聞かれる。
-- そのうえ can_input は**どこからも判定に使われていなかった**。
--
-- これからは「今回の大会の参加者 = 得点を入れられる人」。
--
-- 引き換えに、当日「この人には触らせたくない」という絞り込みはできなくなる。
-- 誰が書いたかは write_logs に残るので、あとから追える。承知のうえで消す。

alter table public.participants drop column if exists can_input;


-- ---------------------------------------------------------------------
-- 4. matches.ending の値
-- ---------------------------------------------------------------------
-- A・B の書き方を side_a / side_b にそろえる。

alter table public.matches drop constraint matches_outcome_check;

update public.matches set ending = 'retired_side_a'  where ending = 'retired_a';
update public.matches set ending = 'retired_side_b'  where ending = 'retired_b';
update public.matches set ending = 'walkover_side_a' where ending = 'walkover_a';
update public.matches set ending = 'walkover_side_b' where ending = 'walkover_b';

alter table public.matches add constraint matches_ending_check
  check (ending in ('normal',
                    'retired_side_a',  'retired_side_b',
                    'walkover_side_a', 'walkover_side_b'));


-- ---------------------------------------------------------------------
-- 5. 索引の名前
-- ---------------------------------------------------------------------

alter index public.entries_competition_idx rename to participants_competition_idx;
alter index public.entries_player_idx      rename to participants_player_idx;

alter index public.players_number_idx rename to players_player_number_idx;

alter index public.team_matches_stage_idx rename to matchups_stage_idx;

alter index public.matches_team_match_idx rename to matches_matchup_idx;

alter index public.match_players_entry_idx rename to match_players_participant_idx;

alter index public.games_match_idx rename to game_scores_match_idx;


-- ---------------------------------------------------------------------
-- 6. 制約の名前
-- ---------------------------------------------------------------------
-- 一意制約は名前を変えると、その裏の索引の名前も一緒に変わる。

alter table public.participants rename constraint entries_pkey
  to participants_pkey;
alter table public.participants rename constraint entries_competition_id_player_id_key
  to participants_competition_id_player_id_key;
alter table public.participants rename constraint entries_competition_id_fkey
  to participants_competition_id_fkey;
alter table public.participants rename constraint entries_player_id_fkey
  to participants_player_id_fkey;
alter table public.participants rename constraint entries_team_id_fkey
  to participants_team_id_fkey;
alter table public.participants rename constraint entries_division_id_fkey
  to participants_division_id_fkey;

alter table public.players rename constraint players_number_key
  to players_player_number_key;

alter table public.teams rename constraint teams_competition_id_number_key
  to teams_competition_id_team_number_key;

alter table public.stages rename constraint stages_kind_check
  to stages_format_check;

alter table public.matchups rename constraint team_matches_pkey
  to matchups_pkey;
alter table public.matchups rename constraint team_matches_side_a_known
  to matchups_side_a_known;
alter table public.matchups rename constraint team_matches_side_b_known
  to matchups_side_b_known;
alter table public.matchups rename constraint team_matches_stage_id_fkey
  to matchups_stage_id_fkey;
alter table public.matchups rename constraint team_matches_team_a_id_fkey
  to matchups_side_a_team_id_fkey;
alter table public.matchups rename constraint team_matches_team_b_id_fkey
  to matchups_side_b_team_id_fkey;

alter table public.matches rename constraint matches_team_match_id_fkey
  to matches_matchup_id_fkey;
alter table public.matches rename constraint matches_team_match_id_order_in_team_match_key
  to matches_matchup_id_order_in_matchup_key;

alter table public.match_players rename constraint match_players_entry_id_fkey
  to match_players_participant_id_fkey;
alter table public.match_players rename constraint match_players_match_id_entry_id_key
  to match_players_match_id_participant_id_key;
alter table public.match_players rename constraint match_players_match_id_side_player_order_key
  to match_players_match_id_side_order_in_pair_key;
alter table public.match_players rename constraint match_players_player_order_check
  to match_players_order_in_pair_check;

alter table public.game_scores rename constraint games_pkey
  to game_scores_pkey;
alter table public.game_scores rename constraint games_match_id_fkey
  to game_scores_match_id_fkey;
alter table public.game_scores rename constraint games_match_id_game_number_key
  to game_scores_match_id_game_number_key;
alter table public.game_scores rename constraint games_game_number_check
  to game_scores_game_number_check;
alter table public.game_scores rename constraint games_score_a_check
  to game_scores_side_a_score_check;
alter table public.game_scores rename constraint games_score_b_check
  to game_scores_side_b_score_check;


-- ---------------------------------------------------------------------
-- 7. ポリシーの名前
-- ---------------------------------------------------------------------
-- 中身（誰が読めるか）は変えない。名前だけそろえる。

alter policy entries_public_read      on public.participants rename to participants_public_read;
alter policy team_matches_public_read on public.matchups     rename to matchups_public_read;
alter policy games_public_read        on public.game_scores  rename to game_scores_public_read;


-- ---------------------------------------------------------------------
-- 8. 説明文
-- ---------------------------------------------------------------------

comment on table public.participants is
  '参加。人 × 大会。入場画面の一覧はこの表で「今回の参加者」に絞る。'
  '**この表に行がある人 = 得点を入れられる人**（観戦者はここに行を持たない）。';

comment on table public.matchups is
  '対戦（チーム対チーム）。決勝は「予選1位」の空枠として先に作れる。'
  'side_a / side_b の A・B はここの side_a_team_id で決まる。'
  '**コートの左右とも画面の左右とも関係ない**（1 ゲームごとに入れ替わるため）。';

comment on table public.game_scores is
  'ゲームごとの得点。「＋1」を押すたびに更新される。';

comment on table public.matches is
  '試合。勝敗は得点の多いほうで決まる（勝者の列は持たない）。'
  'ending は勝敗ではなく「普通に終わったか・棄権か・不戦勝か」。';

comment on table public.stages is
  '大会の予選リーグ / 決勝トーナメント。format は league か knockout。';
