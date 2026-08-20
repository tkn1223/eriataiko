import { CourtsPage } from '@/ui/courts/courts-page';
import { completedMatches, sampleCourts, totalMatches } from '@/ui/courts/sample-data';

/** 「結果LIVE」画面。当日いちばん見られる画面。トップ（/）を開くとここに飛ぶ。 */
export default function Page() {
  return (
    <CourtsPage
      courts={sampleCourts}
      completedMatches={completedMatches}
      totalMatches={totalMatches}
    />
  );
}
