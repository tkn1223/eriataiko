-- =====================================================================
-- 会場（halls）と、チーム数の上限
-- =====================================================================
--
-- 経緯: PR #56 のレビュー。
--
-- **1. 画面が「コートは常に 1〜8 面」と決め打ちしていた。**
-- 6 面しか取れなかった日は空のカードが 2 枚出て、10 面取れた日は
-- 9・10 面の試合が黙って画面から消える。「この大会は何面か」を
-- 持つ場所がどこにも無かった。
--
-- **画面に出すコートは、試合に割り当てられた番号から決める。**
-- ここで持つ面数は「上限」= 取り込みのときに「9 面目の試合が入っている」を
-- 弾くための線であって、**画面のカードの枚数には使わない**。
-- 枚数に使うと、8 面と登録した年に 6 面ぶんしか組まなかったとき、
-- 8 枚と 6 枚のどちらが正しいか決まらなくなる。
--
-- **2. 5 チーム目が作れてしまっていた。**
-- 画面のチーム色は team_number から引くが、色は 4 色しか無い。
--
-- 権限は 20260811000000_baseline.sql 冒頭の型どおり。
-- insert / update / delete のポリシーは **書かない**。
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. halls: 会場
-- ---------------------------------------------------------------------
-- **大会にぶら下げない。** 毎年同じ体育館を使うので、1 回登録して使い回す。
-- 大会にぶら下げると、年が変わるたびに同じ体育館を登録し直すことになる。
create table if not exists public.halls (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  -- その会場で使える面数。**押さえられる面数は年によって変わる**ので、
  -- 「今年は何面か」は competitions.court_count に別に持つ。
  court_count integer not null check (court_count > 0),
  created_at  timestamptz not null default now(),
  unique (name)
);

comment on table public.halls is
  '会場。毎年使い回すので大会にぶら下げない。court_count はその会場で使える面数。';


-- ---------------------------------------------------------------------
-- 2. competitions: どこで何面やるか
-- ---------------------------------------------------------------------
-- **どちらも null を許す。** すでに本番にある大会には会場が入っていない。
-- あとから埋められるようにする（null のうちは面数の検査をしないだけ）。
--
-- 会場は記録なので消さない。**使っている会場は消せないようにする**（restrict）。
-- 大会を消す側は止まらない（向きが逆なので、20260820000000 の cascade とは別の話）。
alter table public.competitions
  add column if not exists hall_id uuid references public.halls(id) on delete restrict;

alter table public.competitions
  add column if not exists court_count integer check (court_count > 0);

comment on column public.competitions.hall_id is
  'その大会をやる会場。あとから埋められるよう null を許す。';
comment on column public.competitions.court_count is
  'その大会で押さえた面数の上限。**画面のカードの枚数には使わない**（取り込みの検査用）。';


-- ---------------------------------------------------------------------
-- 3. teams: 5 チーム目を作れなくする
-- ---------------------------------------------------------------------
-- 画面のチーム色は team_number から引く（globals.css の --color-team-1..4）。
-- 4 色しか無いので 5 チーム目は色が足りない。
--
-- これまでは表のコメントに「色を足さずに 5 チーム以上にしないこと」と
-- 書いてあるだけで、**実際には入ってしまった**。入ると画面ごとに扱いが割れる
-- （入場画面は色を付けない / 結果LIVE と myページ は 1 チーム目と同じ色に折り返す）。
-- 同じ画面に同じ色の別チームが並び、見分けが付かなくなる。
--
-- **増やしたくなったら、先に globals.css へ色を足してから、ここを緩める。**
-- 順番を逆にすると、色の無いチームが画面に出る。
alter table public.teams
  add constraint teams_team_number_range
    check (team_number between 1 and 4);


-- ---------------------------------------------------------------------
-- 4. 権限（ベースラインの型どおり）
-- ---------------------------------------------------------------------

alter table public.halls enable row level security;

grant select on public.halls to anon, authenticated;
grant all    on public.halls to service_role;

drop policy if exists halls_public_read on public.halls;
create policy halls_public_read
  on public.halls
  for select
  to anon, authenticated
  using (true);

-- insert / update / delete のポリシーは意図的に作らない。
-- ポリシーが無い操作は RLS が拒否する = 書き込み API 経由でしか触れない。


-- ---------------------------------------------------------------------
-- 5. Realtime
-- ---------------------------------------------------------------------
-- 会場は当日変わらないので配信しない。
