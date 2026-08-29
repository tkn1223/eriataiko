-- =====================================================================
-- 「何ゲームやるか」を持つ（マスター設定 + 試合へのコピー）
-- =====================================================================
--
-- 経緯は docs/specs/2026-08-29-score-input-backend.md。
-- 名前の決め方は docs/specs/2026-08-29-naming-review.md。
--
-- **20260820000000 では「何ゲームやるかは持たない」と決めていた。** それを覆す。
-- 当時の理由は「試合の行ごとに点数を書く設定作業が増える」だったが、
-- 組み合わせを CSV で流し込むと決まったので、その手間はもう発生しない。
--
-- 逆に、持たないままだと**試合を終わらせる処理が書けない**。
-- 何点先取かを持っていないので、終了は人が「確定」を押したときだけ。
-- そのとき画面に何ゲームぶんの枠を出すかを、どこかに持つ必要がある。
--
-- 権限は 20260811000000_baseline.sql 冒頭の型どおり。
-- insert / update / delete のポリシーは **書かない**。
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. match_settings: 段 × 部ごとの決めごと
-- ---------------------------------------------------------------------
-- 「予選リーグの 1 部は 1 ゲーム」「決勝トーナメントの 1 部は 3 ゲーム」を持つ。
-- 大会ごとに 6〜9 行。あとで設定が増えたら、ここに列を足していく。
--
-- competition_id は持たない。stage_id からたどれる。
--
-- **単位を「段 × 部」にしたのは、部も段も大会ごとに作り直すため。**
-- 名前（「1部」など）で結ぶと、部の名前を変えた年に黙って壊れる。

create table if not exists public.match_settings (
  id             uuid primary key default gen_random_uuid(),
  stage_id       uuid not null references public.stages(id)    on delete cascade,
  division_id    uuid not null references public.divisions(id) on delete cascade,
  -- 上限。3 ゲームの試合が 2 ゲームで終わることがあるので「やった数」ではない。
  max_game_count integer not null default 3 check (max_game_count > 0),
  created_at     timestamptz not null default now(),
  unique (stage_id, division_id)
);

comment on table public.match_settings is
  '段 × 部ごとの決めごと。いまは「最大何ゲームやるか」だけ。大会ごとに 6〜9 行。';

create index if not exists match_settings_stage_idx
  on public.match_settings (stage_id, division_id);


-- ---------------------------------------------------------------------
-- 2. matches.max_game_count: マスターからコピーした値
-- ---------------------------------------------------------------------
-- マスターを直接見ずに試合へコピーするのは、当日 1 試合だけ変えたくなったときに
-- その試合だけ直せるようにするため。コピーは CSV 取り込みの段で行う。
--
-- **既定を 3 にする。** CSV が入れ忘れたとき、1 だと第 2・第 3 ゲームの得点を
-- 当日入れられなくなる。3 なら余分な枠が出るだけで、0 対 0 は数えないので害が無い。

alter table public.matches
  add column if not exists max_game_count integer not null default 3
    check (max_game_count > 0);


-- ---------------------------------------------------------------------
-- 3. 権限（ベースラインの型どおり）
-- ---------------------------------------------------------------------

alter table public.match_settings enable row level security;

grant select on public.match_settings to anon, authenticated;
grant all    on public.match_settings to service_role;

drop policy if exists match_settings_public_read on public.match_settings;
create policy match_settings_public_read
  on public.match_settings
  for select
  to anon, authenticated
  using (true);

-- insert / update / delete のポリシーは意図的に作らない。
-- ポリシーが無い操作は RLS が拒否する = 書き込み API 経由でしか触れない。


-- ---------------------------------------------------------------------
-- 4. Realtime
-- ---------------------------------------------------------------------
-- match_settings は当日変わらないので配信しない。
-- matches と game_scores は 20260820000000 で配信対象に入っている。
