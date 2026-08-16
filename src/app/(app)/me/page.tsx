import { MyPage } from '@/ui/me/my-page';
import { sampleMatches, sampleProfile, sampleRecord } from '@/ui/me/sample-data';

export default function MePage() {
  return <MyPage profile={sampleProfile} record={sampleRecord} matches={sampleMatches} />;
}
