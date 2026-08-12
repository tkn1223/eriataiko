-- =====================================================================
-- ベースライン: アクセス権限の土台
-- =====================================================================
--
-- このアプリの大原則:
--
--   読み取り : ブラウザ → Supabase 直（Realtime 購読もこの経路）
--              → anon には select ポリシーだけ書く
--   書き込み : ブラウザ → Next.js の /api/** → service_role → Supabase
--              → anon には insert / update / delete ポリシーを書かない
--
-- 守っているのは **RLS（行レベルセキュリティ）だけ**。
-- 権限（GRANT / REVOKE）をいじって二重に守ろうとしないこと。
-- 実際にそれをやって、anon の select と service_role の権限まで巻き添えで
-- 消え、アプリが動かなくなった。RLS 一本に絞るほうが確実に守れる。
--
-- 新しいテーブルを足すときは、この 4 行だけ:
--   1. alter table ... enable row level security;
--   2. grant select on ... to anon, authenticated;   （公開してよいテーブルだけ）
--   3. grant all on ... to service_role;             （書き込み API 用）
--   4. 公開してよいものだけ create policy ... for select
--   ※ insert / update / delete のポリシーは **書かない**
--
-- GRANT を明示的に書く理由: Supabase の既定権限は環境やバージョンで変わる。
-- 「たぶん付いているはず」に頼ると、ローカルでは動くのに本番で
-- permission denied になる（実際になった）。
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. operators: 入場画面の「あなたは誰？」に出す運営者一覧
-- ---------------------------------------------------------------------
create table if not exists public.operators (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  -- 一覧の並び順。小さいほど上。
  display_order integer not null default 0,
  -- 当日辞退などで一覧から外したいときは false にする（行は消さない）
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

comment on table public.operators is
  '得点入力ができる運営者。名前だけを持ち、パスワードは持たない。';

create index if not exists operators_display_order_idx
  on public.operators (display_order, name);

alter table public.operators enable row level security;

grant select on public.operators to anon, authenticated;
grant all    on public.operators to service_role;

-- 名前しか入っていないので公開読み取り可。入場画面が anon で読む。
drop policy if exists operators_public_read on public.operators;
create policy operators_public_read
  on public.operators
  for select
  to anon, authenticated
  using (is_active);

-- insert / update / delete のポリシーは意図的に作らない。
-- ポリシーが無い操作は RLS が拒否する = service_role 経由でしか書けない。


-- ---------------------------------------------------------------------
-- 2. write_logs: 誰が何を書いたかの記録
-- ---------------------------------------------------------------------
-- 当日「この点数、誰が入れた？」を追えるようにする。
-- 巻き戻し判断とバックアップの突き合わせに使う。

create table if not exists public.write_logs (
  id            bigint generated always as identity primary key,
  operator_id   uuid references public.operators(id) on delete set null,
  -- operators の行が消えても誰だったかは残したいので名前を非正規化して持つ
  operator_name text not null,
  action        text not null,
  detail        jsonb,
  created_at    timestamptz not null default now()
);

comment on table public.write_logs is
  '書き込み監査ログ。anon からは読めない（select ポリシーなし）。';

create index if not exists write_logs_created_at_idx
  on public.write_logs (created_at desc);

alter table public.write_logs enable row level security;

-- anon / authenticated には何も渡さない。書き込み API だけが触れる。
grant all on public.write_logs to service_role;

-- ポリシーを 1 つも作らない = anon / authenticated からは読めも書けもしない。
-- 閲覧は Supabase の管理画面か service_role 経由で。


-- ---------------------------------------------------------------------
-- 3. Realtime 配信対象
-- ---------------------------------------------------------------------
-- 得点テーブルなどを作ったら、ここに追加すると Realtime で配信される。
-- 例:
--   alter publication supabase_realtime add table public.matches;
--
-- 配信対象のテーブルには anon の select ポリシーが必要（RLS が購読にも効くため）。
