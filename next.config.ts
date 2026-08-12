import type { NextConfig } from 'next';

/**
 * セキュリティヘッダ。
 *
 * 狙いは「別のサイトに飛ばされる・埋め込まれる」系を止めること。
 * 詳しい方針は docs/security.md。
 *
 * script-src はあえて縛っていない。Next.js は動作にインラインスクリプトを使うので、
 * 縛ると nonce の仕込みが必要になり、壊れやすさのほうが上回る。
 * XSS 対策は「React が自動でエスケープする」＋「dangerouslySetInnerHTML 禁止（ESLint）」で行う。
 */
const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    value: [
      // 他サイトの iframe に埋め込ませない（偽サイトに重ねられるのを防ぐ）
      "frame-ancestors 'none'",
      // <base> を書き換えて相対リンクの行き先を乗っ取られるのを防ぐ
      "base-uri 'self'",
      // フォームの送信先を自サイトに限定する
      "form-action 'self'",
      // Flash などの埋め込みを禁止
      "object-src 'none'",
    ].join('; '),
  },
  // 古いブラウザ向けの frame-ancestors 相当
  { key: 'X-Frame-Options', value: 'DENY' },
  // 拡張子と中身が違うファイルを勝手に解釈させない
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // 外部サイトへ飛ぶとき、URL のパス以降を渡さない
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // 使わない端末機能は明示的に閉じる
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

const nextConfig: NextConfig = {
  // Docker の本番イメージを node_modules なしの小さい構成にするため。
  // Vercel では無視されるので付けたままで問題ない。
  output: 'standalone',

  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
