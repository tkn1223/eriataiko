-- 試合の入力担当（同じ試合を 2 人が同時に入れられないようにする）。
--
-- 経緯と「なぜそう決めたか」: docs/specs/2026-10-14-match-scorer.md
--
-- matches に 2 列を足す。
--   scorer_participant_id  いまの担当（参加者）。担当がいなければ空。
--                          参加者の行が消えたら空に戻す（試合は残す）。
--   scorer_last_scored_at  担当が最後に点を入れた時刻。担当になった時刻もここに入れる
--                          （まだ 1 点も入れていない担当も、取った時刻から 5 分で外れる）。
--                          5 分たったかどうかはアプリ側で時刻を見て決める（この列は時刻を持つだけ）。
--
-- 権限は足さない。matches には select の許可がすでにあり、新しい列もそのまま読める。
-- insert / update / delete のポリシーは書かない（書き込みは入口の Route Handler だけ）。
-- matches は Realtime の配信対象なので、担当の変化もそのまま全員の画面に届く。

alter table public.matches
  add column if not exists scorer_participant_id uuid
    references public.participants(id) on delete set null,
  add column if not exists scorer_last_scored_at timestamptz;

comment on column public.matches.scorer_participant_id is
  'いまの入力担当（参加者）。空なら担当がいない。参加者が消えたら空に戻る。';
comment on column public.matches.scorer_last_scored_at is
  '担当が最後に点を入れた時刻（担当になった時刻も入る）。5 分たつと担当は外れた扱いになる。';
