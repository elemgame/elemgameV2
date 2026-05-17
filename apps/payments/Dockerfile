FROM node:20-alpine AS build

WORKDIR /repo
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/payments/package.json apps/payments/package.json

RUN pnpm install --frozen-lockfile --filter @elmental/payments...

COPY apps/payments apps/payments

RUN pnpm --filter @elmental/payments build
RUN pnpm --filter @elmental/payments deploy --prod /prod
RUN cp -R apps/payments/dist /prod/dist

FROM node:20-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /prod/ ./

EXPOSE 3002
CMD ["node", "dist/index.js"]
