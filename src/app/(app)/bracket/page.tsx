import { BracketPage } from '@/ui/bracket/bracket-page';
import {
  sampleKoBracket,
  sampleLeagueCards,
  sampleStandings,
  sampleTeams,
} from '@/ui/bracket/sample-data';

export default function Page() {
  return (
    <BracketPage
      teams={sampleTeams}
      leagueCards={sampleLeagueCards}
      standings={sampleStandings}
      koBracket={sampleKoBracket}
    />
  );
}
