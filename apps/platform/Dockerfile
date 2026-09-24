FROM node:22.22.3-alpine@sha256:e58326d0d441090181ac150dc2078d3e2cf6a0d42e809aebba3ef5880935ffdd AS build

WORKDIR /workspace
RUN npm install --global npm@11.17.0
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build:shared && npm run build:platform

FROM nginx:1.30.5-alpine3.24@sha256:bf3201ab56f23e5954646379c775d511fc466e9f11376d9725361064ad07ed35 AS runtime
COPY ops/nginx.conf /etc/nginx/conf.d/default.conf
COPY --chmod=755 apps/platform/docker-entrypoint.d/40-runtime-config.sh /docker-entrypoint.d/40-runtime-config.sh
COPY --from=build /workspace/dist/apps/platform/browser /usr/share/nginx/html

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 CMD wget -q -O /dev/null http://127.0.0.1/healthz || exit 1
