-- 不戦勝をなくし、matches.ending を「普通・A 側が棄権・B 側が棄権」の 3 つだけにする。
--
-- 経緯: docs/specs/2026-10-11-retire-match.md
-- 棄権が出ても試合は飛ばさず、必ず代わりの試合をして点数を入れる。
-- 点数なしで終わる「不戦勝」は起きないので、値ごと無くす。
-- すでに不戦勝の行があれば、相手側の棄権に読み替える（A 側の不戦勝 = B 側が棄権）。

alter table public.matches drop constraint matches_ending_check;

update public.matches set ending = 'retired_side_b' where ending = 'walkover_side_a';
update public.matches set ending = 'retired_side_a' where ending = 'walkover_side_b';

alter table public.matches add constraint matches_ending_check
  check (ending in ('normal', 'retired_side_a', 'retired_side_b'));

-- 表の説明も合わせる（20260829000000_naming_review.sql の「勝敗は得点の多いほう」「不戦勝か」が古くなるため）
comment on table public.matches is
  '試合。勝敗は得点の多いほうで決まる（勝者の列は持たない）。ただし棄権があれば点数に関係なく相手の勝ち。'
  'ending は「普通に終わったか・A 側が棄権か・B 側が棄権か」。';
