import { MatchesPage } from '@/ui/matches/matches-page';
import { sampleCourts } from '@/ui/matches/sample-data';

export default function Page() {
  return <MatchesPage courts={sampleCourts} />;
}
