/**
 * 「自動更新が止まっています」の帯。他の人の点や試合の変化を受け取る購読が途切れたときに出す。
 * 結果LIVE と進行表の両方で同じ言葉・同じ見た目を使うので、ここに 1 か所だけ置く。
 */
export function LiveDownNotice() {
  return (
    <p
      role="status"
      data-testid="live-down-notice"
      className="text-live mb-[14px] rounded-[10px] bg-red-100 px-3 py-2 text-[12px] font-extrabold"
    >
      自動更新が止まっています。電波が戻ると自動でつながります。
    </p>
  );
}
