-- 試合の入力担当（同じ試合を 2 人が同時に入れられないようにする）。
--
-- 経緯と「なぜそう決めたか」: docs/specs/2026-10-14-match-scorer.md
--
-- matches に 2 列を足す。
--   scorer_participant_id  いまの担当（参加者）。担当がいなければ空。
--                          参加者の行が消えたら空に戻す（試合は残す）。
--   scorer_claimed_at      担当になった時刻（取った・引き継いだ・「直す」を押した時刻）。
--
-- 担当が外れるのは「担当になった時刻」と「その試合の game_scores の updated_at の一番新しいもの」
-- の遅いほうから 5 分（アプリ側で時刻を見て決める。この表は時刻を持つだけ）。
-- 「最後に点を入れた時刻」を matches に持たないのは、点を入れるたびに matches も書き換えると、
-- 全員の画面への知らせ（Realtime）が 1 点あたり game_scores と matches の 2 通になるため
-- （無料プランは 1 秒あたりの通数に上限がある）。点の保存では game_scores.updated_at が
-- 必ず新しくなり、担当でない人の点は保存しないので、それをそのまま「最後に点を入れた時刻」に使う。
--
-- 権限は足さない。matches には select の許可がすでにあり、新しい列もそのまま読める。
-- insert / update / delete のポリシーは書かない（書き込みは入口の Route Handler だけ）。
-- matches は Realtime の配信対象なので、担当の変化もそのまま全員の画面に届く。

alter table public.matches
  add column if not exists scorer_participant_id uuid
    references public.participants(id) on delete set null,
  add column if not exists scorer_claimed_at timestamptz;

comment on column public.matches.scorer_participant_id is
  'いまの入力担当（参加者）。空なら担当がいない。参加者が消えたら空に戻る。';
comment on column public.matches.scorer_claimed_at is
  '担当になった時刻。これと game_scores.updated_at の新しいほうから 5 分たつと、担当は外れた扱いになる。';
