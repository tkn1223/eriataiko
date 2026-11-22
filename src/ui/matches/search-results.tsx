import { MatchRow } from '@/ui/matches/match-row';
import { searchMatches } from '@/ui/matches/search-matches';
import type { BoardMatch } from '@/ui/matches/types';

function locationOf(match: BoardMatch): string | undefined {
  return match.courtNumber === null ? undefined : `コート${match.courtNumber}`;
}

/**
 * 1c 探すの結果。入力するとすぐ下に出る（候補を選ぶ段は挟まない）。
 * 「試合中」→「これから」→「終わった試合 ・ ◯勝◯敗」の順で、行の上に「コート1」などの場所を出す。
 * 入力が空のうちは何も出さない（探す欄だけが開いている）。
 */
export function SearchResults({ board, query }: { board: BoardMatch[]; query: string }) {
  if (query.trim() === '') return null;

  const result = searchMatches(board, query);
  const total = result.live.length + result.upcoming.length + result.done.length;
  if (total === 0) {
    return (
      <p className="py-8 text-center text-[14px] font-bold text-[#666]">
        当てはまる試合は見つかりませんでした
      </p>
    );
  }

  const { wins, losses } = result.record;
  const sections = [
    { key: 'live', title: '試合中', items: result.live },
    { key: 'upcoming', title: 'これから', items: result.upcoming },
    {
      key: 'done',
      title: wins + losses > 0 ? `終わった試合 ・ ${wins}勝${losses}敗` : '終わった試合',
      items: result.done,
    },
  ];

  return (
    <div data-testid="search-results" className="flex flex-col gap-1.5 pt-3">
      {sections.map(
        (section) =>
          section.items.length > 0 && (
            <section key={section.key} className="flex flex-col gap-2">
              <h2 className="mt-1.5 text-[12.5px] font-extrabold text-[#666]">{section.title}</h2>
              <ul className="flex flex-col gap-2">
                {section.items.map((match) => (
                  <MatchRow key={match.matchId} match={match} location={locationOf(match)} />
                ))}
              </ul>
            </section>
          )
      )}
    </div>
  );
}
