# AVASYA frontend — production image (Next.js standalone-style runner)
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# NEXT_PUBLIC_* values are baked into the bundle at BUILD time — every one
# must arrive as a build arg (compose passes them; defaults keep local
# `docker build` working).
ARG NEXT_PUBLIC_USE_MOCK_DATA=false
ARG NEXT_PUBLIC_API_URL=http://localhost:58000
ARG NEXT_PUBLIC_DEMO_OFFICER_EMAIL=demo.officer@avasya.local
ARG NEXT_PUBLIC_SUPABASE_URL=
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY=
ENV NEXT_TELEMETRY_DISABLED=1 \
    NEXT_PUBLIC_USE_MOCK_DATA=$NEXT_PUBLIC_USE_MOCK_DATA \
    NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_DEMO_OFFICER_EMAIL=$NEXT_PUBLIC_DEMO_OFFICER_EMAIL \
    NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
RUN npm run build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1
RUN addgroup -S app && adduser -S app -G app
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
# The repo has no public/ directory; copy it only when present.
COPY --from=build /app/public* ./
COPY --from=build /app/next.config.ts ./next.config.ts
USER app
EXPOSE 3000
CMD ["npm", "run", "start"]
