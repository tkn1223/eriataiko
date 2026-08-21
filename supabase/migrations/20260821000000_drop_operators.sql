-- =====================================================================
-- operators を消して、名簿を players / entries に一本化する
-- =====================================================================
--
-- 経緯は docs/specs/2026-08-21-drop-operators.md。
--
-- 名簿が 2 つあった。operators（旧）と players / entries（新）。
-- 同じ人が二重に載るうえ、operators には**同名を見分ける手段が無い**
-- （ニックネームなので「たろう」が複数いる）。
--
-- **いま消すのが一番安い。** operators も write_logs も、手元・本番とも 0 件。
-- 実際の運営者名を登録したあとだと、人が手で突き合わせる作業が発生する。
-- =====================================================================


-- ---------------------------------------------------------------------
-- write_logs の参照先を players に付け替える
-- ---------------------------------------------------------------------
-- 「誰が書いたか」の出どころが operators から players に変わる。
-- 名前を別に持っているのは今までと同じ理由で、**人の行が消えても
-- 「誰だったか」を残したい**ため（外部キーは set null になる）。

alter table public.write_logs
  add column if not exists player_id uuid references public.players(id) on delete set null;

alter table public.write_logs
  add column if not exists player_name text;

-- 既存データの移し替えは不要（0 件であることを確認済み）。
-- 念のため、万一行があれば名前だけは引き継ぐ。
update public.write_logs set player_name = operator_name where player_name is null;

alter table public.write_logs alter column player_name set not null;

alter table public.write_logs drop column if exists operator_id;
alter table public.write_logs drop column if exists operator_name;

comment on table public.write_logs is
  '書き込み監査ログ。anon からは読めない（select ポリシーなし）。';


-- ---------------------------------------------------------------------
-- operators を消す
-- ---------------------------------------------------------------------
-- 上で write_logs の外部キーを外したので、もう誰も参照していない。
drop table if exists public.operators;
