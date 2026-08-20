-- =====================================================================
-- 大会データの表（段1）
-- =====================================================================
--
-- 経緯と「なぜそう決めたか」は docs/specs/2026-08-20-competition-tables.md。
-- 表の関係の読み方は docs/database.md。
--
-- 権限は 20260811000000_baseline.sql の冒頭に書いた型どおり:
--   1. alter table ... enable row level security;
--   2. grant select on ... to anon, authenticated;
--   3. grant all    on ... to service_role;
--   4. create policy ... for select
--   ※ insert / update / delete のポリシーは **書かない**
--      （ポリシーが無い操作は RLS が拒否する = 書き込み API 経由でしか触れない）
--
-- 全体の形:
--
--   competitions  大会 ──┬── divisions   部
--                        ├── teams       チーム
--                        ├── entries     参加（players × competitions）
--                        └── stages      予選リーグ / 決勝トーナメント
--                              └── team_matches  対戦（チームA 対 チームB）
--                                    └── matches      試合
--                                          ├── match_players  出場者
--                                          └── games          ゲームごとの得点
--
--   players  人（大会をまたぐ）── entries から参照
--
-- **勝者の列はどこにも無い。** 得点と matches.outcome から計算して出す。
-- 保存すると必ず食い違う（順位表を保存しないのと同じ理由）。
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. competitions: 大会
-- ---------------------------------------------------------------------
create table if not exists public.competitions (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  held_on    date not null,
  -- アプリが「いまどの大会を出すか」を決める印。true は同時に 1 件だけ。
  is_current boolean not null default false,
  created_at timestamptz not null default now()
);

comment on table public.competitions is
  '大会。毎年ためていく。is_current が true の 1 件が「いまの大会」。';

-- true の行だけを対象にした一意制約。false は何件あってもよい。
create unique index if not exists competitions_one_current_idx
  on public.competitions (is_current) where is_current;

create index if not exists competitions_held_on_idx
  on public.competitions (held_on desc);


-- ---------------------------------------------------------------------
-- 2. divisions: 部（1部 / 2部 / 3部）
-- ---------------------------------------------------------------------
-- **点数の列はここに持たない。** 「何点先取」は同じ部でも予選と決勝で変わるため、
-- 試合そのもの（matches）に焼き付ける。
create table if not exists public.divisions (
  id             uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  name           text not null,
  display_order  integer not null default 0,
  created_at     timestamptz not null default now(),
  unique (competition_id, name)
);

comment on table public.divisions is
  '部。名前と並び順だけを持つ。何点先取かは matches に持たせる。';


-- ---------------------------------------------------------------------
-- 3. teams: チーム
-- ---------------------------------------------------------------------
create table if not exists public.teams (
  id             uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  -- 画面のチーム色はこの番号から引く（globals.css の --color-team-1..4）。
  -- **5 チーム以上にすると色が足りない。** そのときは色を足すこと。
  number         integer not null,
  name           text not null,
  display_order  integer not null default 0,
  created_at     timestamptz not null default now(),
  unique (competition_id, number)
);

comment on table public.teams is
  'チーム。number から画面の色を引くので、色を足さずに 5 チーム以上にしないこと。';


-- ---------------------------------------------------------------------
-- 4. players: 人
-- ---------------------------------------------------------------------
-- 大会をまたいで 1 人 1 行。「去年の自分」と「今年の自分」がつながる。
--
-- **名前はニックネームなので重複する。** 同じ「たろう」が複数いるため、
-- 人を特定できる唯一の手がかりが number（運営がふる通し番号）。
--
-- **試合に出ない入力係もここに入る。** 選手兼運営が二重に載るのを避けるため、
-- 名簿は 1 本にすると決めた。名前と中身が少しずれるのは承知のうえ。
create table if not exists public.players (
  id         uuid primary key default gen_random_uuid(),
  number     integer not null unique,
  name       text not null,
  created_at timestamptz not null default now()
);

comment on table public.players is
  '人。番号で見分ける（ニックネームは重複する）。試合に出ない入力係も入る。';

create index if not exists players_number_idx on public.players (number);


-- ---------------------------------------------------------------------
-- 5. entries: 参加（人 × 大会）
-- ---------------------------------------------------------------------
-- 人と大会をつなぐだけでなく、「その大会でのチーム・部・入力してよいか」を持つ。
-- 入力だけの人は試合に出ないので team_id / division_id は空でよい。
create table if not exists public.entries (
  id             uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  player_id      uuid not null references public.players(id) on delete cascade,
  team_id        uuid references public.teams(id) on delete set null,
  division_id    uuid references public.divisions(id) on delete set null,
  -- 入場のとき、この人を選ぶと合言葉を聞かれる。得点を入れられるのはこの人だけ。
  can_input      boolean not null default false,
  created_at     timestamptz not null default now(),
  unique (competition_id, player_id)
);

comment on table public.entries is
  '参加。人 × 大会。入場画面の一覧はこの表で「今回の参加者」に絞る。';

create index if not exists entries_competition_idx on public.entries (competition_id);
create index if not exists entries_player_idx      on public.entries (player_id);


-- ---------------------------------------------------------------------
-- 6. stages: 予選リーグ / 決勝トーナメント
-- ---------------------------------------------------------------------
-- 進め方そのものが大会ごとに変わりうるので、埋め込まずに表にする。
-- ただし凝った作りにはしない（kind は 2 種類だけ）。
create table if not exists public.stages (
  id             uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  name           text not null,
  kind           text not null check (kind in ('league', 'knockout')),
  display_order  integer not null default 0,
  created_at     timestamptz not null default now(),
  unique (competition_id, name)
);

comment on table public.stages is
  '大会の段（予選リーグ / 決勝トーナメント）。kind は league か knockout。';


-- ---------------------------------------------------------------------
-- 7. team_matches: 対戦（チームA 対 チームB）
-- ---------------------------------------------------------------------
-- 星取表の 1 マス、決勝トーナメントの 1 戦にあたる。
--
-- **なぜこの表が要るか。** 予選だけなら要らない（出場者をたどればチームが分かる）。
-- 決勝トーナメントも**事前に**作ると決めたから要る。準決勝を作る時点では
-- 出場者が 1 人も決まっておらず、逆算できない。
-- さらに docs/specs/2026-08-17-bracket.md が「予選中も『予選1位』の薄字で
-- 決勝の形を出す」と決めており、その文字の置き場所がここ。
create table if not exists public.team_matches (
  id            uuid primary key default gen_random_uuid(),
  stage_id      uuid not null references public.stages(id) on delete cascade,
  -- 「予選 1回戦」「準決勝1」「決勝」「3位決定戦」など
  label         text not null,
  -- 決まっていれば team_x_id、まだなら slot_x_label（「予選1位」「準決勝1 勝者」）
  -- **set null にしてはいけない。** チームを消すと team_x_id が空になり、
  -- 下の「チームも空枠ラベルも両方空は禁止」に自分で違反して削除ごと失敗する（実測）。
  -- チームが消えた対戦は意味を持たないので、一緒に消す。
  team_a_id     uuid references public.teams(id) on delete cascade,
  team_b_id     uuid references public.teams(id) on delete cascade,
  slot_a_label  text,
  slot_b_label  text,
  display_order integer not null default 0,
  created_at    timestamptz not null default now(),
  -- 片側が「チームも空枠ラベルも無い」状態は、画面に何も出せないので禁止する
  constraint team_matches_side_a_known
    check (team_a_id is not null or slot_a_label is not null),
  constraint team_matches_side_b_known
    check (team_b_id is not null or slot_b_label is not null)
);

comment on table public.team_matches is
  '対戦（チーム対チーム）。決勝は「予選1位」の空枠として先に作れる。';

create index if not exists team_matches_stage_idx
  on public.team_matches (stage_id, display_order);


-- ---------------------------------------------------------------------
-- 8. matches: 試合
-- ---------------------------------------------------------------------
-- 対戦の中の 1 試合（部ごと）。ダブルスなので出場者は片側 2 人。
--
-- **points_to_win / games_to_win を試合に焼き付ける。** 部でもステージでも
-- 変わるうえ、あとからルールを変えても終わった試合の解釈が壊れない。
create table if not exists public.matches (
  id                  uuid primary key default gen_random_uuid(),
  team_match_id       uuid not null references public.team_matches(id) on delete cascade,
  -- cascade にしているのは「大会を消したら中身ごと消える」を成り立たせるため。
  -- restrict にすると、大会 → 部 の連鎖削除がここで止まり、**大会を消せなくなる**（実測）。
  division_id         uuid not null references public.divisions(id) on delete cascade,
  -- 対戦の中での並び（1部 → 2部 → 3部 など）
  order_in_team_match integer not null default 1,
  -- コートと順番は当日動かせるので、決まっていない間は空でよい
  court_number        integer,
  order_in_court      integer,
  status              text not null default 'waiting'
                        check (status in ('waiting', 'live', 'done')),
  -- 得点から自動で勝敗を出すが、棄権・不戦勝だけは得点で表せないのでここに持つ
  outcome             text not null default 'normal'
                        check (outcome in ('normal',
                                           'retired_a', 'retired_b',
                                           'walkover_a', 'walkover_b')),
  points_to_win       integer not null default 15 check (points_to_win > 0),
  games_to_win        integer not null default 1  check (games_to_win  > 0),
  started_at          timestamptz,
  finished_at         timestamptz,
  created_at          timestamptz not null default now(),
  unique (team_match_id, order_in_team_match)
);

comment on table public.matches is
  '試合。何点先取かはこの行に焼き付ける（部でもステージでも変わるため）。';

create index if not exists matches_court_idx
  on public.matches (court_number, order_in_court);
create index if not exists matches_team_match_idx
  on public.matches (team_match_id, order_in_team_match);
create index if not exists matches_status_idx
  on public.matches (status);


-- ---------------------------------------------------------------------
-- 9. match_players: 出場者
-- ---------------------------------------------------------------------
-- ダブルスなので片側 2 行。player_order は 1 か 2。
--
-- **「片側ちょうど 2 人」はここでは強制しない。** 行を 1 つずつ入れる都合で、
-- 1 人目を入れた瞬間に違反になってしまう。取り込みと書き込み API の側で確かめる。
-- 将来シングルスが出たときも、この形なら 1 行だけ入れれば済む。
--
-- 列名を position にしなかったのは、position が SQL の予約語と紛れるため。
create table if not exists public.match_players (
  id           uuid primary key default gen_random_uuid(),
  match_id     uuid not null references public.matches(id) on delete cascade,
  side         text not null check (side in ('a', 'b')),
  -- ここも cascade。restrict だと 大会 → 参加 の連鎖削除が止まり、大会を消せない。
  -- 部や参加を単独で消す機能は作らないので、巻き添えの心配より連鎖の一貫性を取る。
  entry_id     uuid not null references public.entries(id) on delete cascade,
  player_order integer not null default 1 check (player_order in (1, 2)),
  created_at   timestamptz not null default now(),
  unique (match_id, side, player_order),
  -- 同じ人が同じ試合に 2 回出ることはない（両側に出るのもここで防ぐ）
  unique (match_id, entry_id)
);

comment on table public.match_players is
  '試合の出場者。ダブルスなので片側 2 行。「2 人そろっているか」は API 側で確かめる。';

-- マイページの「自分の試合」がここを引く
create index if not exists match_players_entry_idx on public.match_players (entry_id);


-- ---------------------------------------------------------------------
-- 10. games: ゲームごとの得点
-- ---------------------------------------------------------------------
-- 「＋1」を押すたびにこの行が更新される（1 試合で 30 回前後）。
create table if not exists public.games (
  id          uuid primary key default gen_random_uuid(),
  match_id    uuid not null references public.matches(id) on delete cascade,
  game_number integer not null check (game_number > 0),
  score_a     integer not null default 0 check (score_a >= 0),
  score_b     integer not null default 0 check (score_b >= 0),
  updated_at  timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  unique (match_id, game_number)
);

comment on table public.games is
  'ゲームごとの得点。「＋1」を押すたびに更新される。';

create index if not exists games_match_idx on public.games (match_id, game_number);


-- ---------------------------------------------------------------------
-- 権限（ベースラインの型どおり）
-- ---------------------------------------------------------------------
-- 10 表とも公開読み取り可。サイトは誰でも見られる作りで、隠す値は入っていない。
-- 書き込みのポリシーは 1 つも作らない = 書き込み API 経由でしか触れない。

alter table public.competitions  enable row level security;
alter table public.divisions     enable row level security;
alter table public.teams         enable row level security;
alter table public.players       enable row level security;
alter table public.entries       enable row level security;
alter table public.stages        enable row level security;
alter table public.team_matches  enable row level security;
alter table public.matches       enable row level security;
alter table public.match_players enable row level security;
alter table public.games         enable row level security;

grant select on public.competitions  to anon, authenticated;
grant select on public.divisions     to anon, authenticated;
grant select on public.teams         to anon, authenticated;
grant select on public.players       to anon, authenticated;
grant select on public.entries       to anon, authenticated;
grant select on public.stages        to anon, authenticated;
grant select on public.team_matches  to anon, authenticated;
grant select on public.matches       to anon, authenticated;
grant select on public.match_players to anon, authenticated;
grant select on public.games         to anon, authenticated;

grant all on public.competitions  to service_role;
grant all on public.divisions     to service_role;
grant all on public.teams         to service_role;
grant all on public.players       to service_role;
grant all on public.entries       to service_role;
grant all on public.stages        to service_role;
grant all on public.team_matches  to service_role;
grant all on public.matches       to service_role;
grant all on public.match_players to service_role;
grant all on public.games         to service_role;

drop policy if exists competitions_public_read  on public.competitions;
drop policy if exists divisions_public_read     on public.divisions;
drop policy if exists teams_public_read         on public.teams;
drop policy if exists players_public_read       on public.players;
drop policy if exists entries_public_read       on public.entries;
drop policy if exists stages_public_read        on public.stages;
drop policy if exists team_matches_public_read  on public.team_matches;
drop policy if exists matches_public_read       on public.matches;
drop policy if exists match_players_public_read on public.match_players;
drop policy if exists games_public_read         on public.games;

create policy competitions_public_read  on public.competitions  for select to anon, authenticated using (true);
create policy divisions_public_read     on public.divisions     for select to anon, authenticated using (true);
create policy teams_public_read         on public.teams         for select to anon, authenticated using (true);
create policy players_public_read       on public.players       for select to anon, authenticated using (true);
create policy entries_public_read       on public.entries       for select to anon, authenticated using (true);
create policy stages_public_read        on public.stages        for select to anon, authenticated using (true);
create policy team_matches_public_read  on public.team_matches  for select to anon, authenticated using (true);
create policy matches_public_read       on public.matches       for select to anon, authenticated using (true);
create policy match_players_public_read on public.match_players for select to anon, authenticated using (true);
create policy games_public_read         on public.games         for select to anon, authenticated using (true);


-- ---------------------------------------------------------------------
-- Realtime 配信対象
-- ---------------------------------------------------------------------
-- 当日に動くのはこの 2 つだけ。得点（games）と、進み具合（matches）。
-- 段2 以降で観戦者の画面がここを購読する。いまは誰も購読していないので何も起きない。
alter publication supabase_realtime add table public.matches;
alter publication supabase_realtime add table public.games;
