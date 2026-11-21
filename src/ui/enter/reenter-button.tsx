'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { appScoreSyncStore } from '@/ui/courts/use-score-sync';

/**
 * 「別の人として入り直す」「選手として入り直す」のボタン。
 *
 * **押した時点で退場まで済ませ、チームを選ぶ最初の画面へ移る。**
 * 以前は入場画面に「入場中」の画面を出し、そこでもう一度「退場する」を押させていたが、
 * 入り直したい人にとっては 1 手余計なので省いた。
 *
 * 画面の移動は router.push（読み込み直さない）で行う。結果LIVE で送れていない点が
 * この端末に残っているとき、それを消さずに「前の人の点」として知らせるため
 * （use-score-sync.ts、仕様 ⑪）。同じ理由で、退場の始まりと終わりを預かり場所に知らせる。
 */
export function ReenterButton({ label }: { label: string }) {
  const router = useRouter();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function leave() {
    setError(null);
    setWorking(true);
    appScoreSyncStore.beginEntrantChange();
    try {
      const res = await fetch('/api/session', { method: 'DELETE' });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        setError(json.error ?? '通信に失敗しました。');
        setWorking(false);
        return;
      }
      appScoreSyncStore.endEntrantChange(null);
      // 移り終わるまでボタンは押せないままにする（二度押しで退場を 2 回送らない）
      router.push('/enter');
    } catch {
      setError('ネットワークに繋がりませんでした。電波を確認してください。');
      setWorking(false);
    } finally {
      // 退場できなかった（Cookie は替わっていない）。もう終わっていれば何もしない
      appScoreSyncStore.cancelEntrantChange();
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => void leave()}
        disabled={working}
        className="flex min-h-11 w-full items-center justify-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-bold disabled:opacity-50"
      >
        {label}
      </button>
      {error && (
        <p role="alert" className="text-live mt-2 text-[13px] font-bold">
          {error}
        </p>
      )}
    </div>
  );
}
