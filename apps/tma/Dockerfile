FROM node:20-alpine AS build

WORKDIR /repo
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/tma/package.json apps/tma/package.json

RUN pnpm install --frozen-lockfile --filter @elmental/tma... --filter @elmental/shared...

COPY packages/shared packages/shared
COPY apps/tma apps/tma

ARG VITE_GAME_TRANSPORT=spacetime
ARG VITE_GAME_TRACE=true
ARG VITE_SPACETIME_URI=http://localhost
ARG VITE_SPACETIME_DB=elmental-v2
ARG VITE_BOT_FALLBACK_SECONDS=30
ARG VITE_PAYMENTS_URL=http://localhost
ARG VITE_BASE_PATH=/

ENV VITE_GAME_TRANSPORT=$VITE_GAME_TRANSPORT
ENV VITE_GAME_TRACE=$VITE_GAME_TRACE
ENV VITE_SPACETIME_URI=$VITE_SPACETIME_URI
ENV VITE_SPACETIME_DB=$VITE_SPACETIME_DB
ENV VITE_BOT_FALLBACK_SECONDS=$VITE_BOT_FALLBACK_SECONDS
ENV VITE_PAYMENTS_URL=$VITE_PAYMENTS_URL
ENV VITE_BASE_PATH=$VITE_BASE_PATH

RUN pnpm --filter @elmental/shared build
RUN pnpm --filter @elmental/tma build

FROM nginx:1.27-alpine AS runtime

COPY apps/tma/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/tma/dist /usr/share/nginx/html

EXPOSE 80
