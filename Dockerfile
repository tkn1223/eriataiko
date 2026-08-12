# syntax=docker/dockerfile:1

# Node は 22 に固定する。ホストが 20.10 だと ESLint と supabase-js が警告を出すため、
# コンテナ側で正しいバージョンを保証してしまうのが目的のひとつ。

# ---------------------------------------------------------------- base
FROM node:22-alpine AS base
# Alpine で Next.js のネイティブ依存を動かすのに必要
RUN apk add --no-cache libc6-compat
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# ---------------------------------------------------------------- deps
# package.json が変わらない限りこの層はキャッシュされる
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# ---------------------------------------------------------------- dev
# compose から使う開発用。ソースは bind mount で上書きされる。
FROM base AS dev
ENV NODE_ENV=development
COPY --from=deps /app/node_modules ./node_modules
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev", "--", "--hostname", "0.0.0.0"]

# ---------------------------------------------------------------- builder
FROM base AS builder
ENV NODE_ENV=production

# NEXT_PUBLIC_* はビルド時に JS へ焼き込まれるので、ここで渡す必要がある。
# （公開される値なのでイメージに残って問題ない。service_role は絶対に渡さない）
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---------------------------------------------------------------- runner
# 本番相当の動作確認用。next.config.ts の output: 'standalone' を利用して
# node_modules を丸ごと持たない小さいイメージにする。
FROM base AS runner
ENV NODE_ENV=production
RUN addgroup -S -g 1001 nodejs && adduser -S -u 1001 -G nodejs nextjs

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
CMD ["node", "server.js"]
