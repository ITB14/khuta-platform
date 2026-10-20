# Two stages: the build keeps the toolchain, the runtime keeps nothing it does
# not need. The server runs as a non-root user and holds no secrets — those
# arrive as environment variables at run time.
FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json* ./
RUN npm ci --omit=optional
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3100 HOSTNAME=0.0.0.0
RUN useradd -r -u 10001 -m khuta
COPY --from=build --chown=khuta:khuta /app/.next/standalone ./
COPY --from=build --chown=khuta:khuta /app/.next/static ./.next/static
COPY --from=build --chown=khuta:khuta /app/public ./public
# Operational pieces that live outside the bundle: migrations, the seed, and
# the lesson files, which are served only through signed URLs.
COPY --from=build --chown=khuta:khuta /app/db ./db
COPY --from=build --chown=khuta:khuta /app/scripts ./scripts
COPY --from=build --chown=khuta:khuta /app/src ./src
COPY --from=build --chown=khuta:khuta /app/content ./content
USER khuta
EXPOSE 3100
CMD ["node", "server.js"]
