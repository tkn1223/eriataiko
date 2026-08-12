-- 開発用のサンプルデータ。本番の運営者名は当日までに入れ替えること。
--
-- クラウドに流し込むとき:
--   psql "$SUPABASE_DB_URL" -f supabase/seed.sql

insert into public.operators (name, display_order) values
  ('本部 A', 10),
  ('本部 B', 20),
  ('第1コート 主審', 30),
  ('第2コート 主審', 40),
  ('第3コート 主審', 50)
on conflict do nothing;
