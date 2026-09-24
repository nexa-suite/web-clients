FROM node:22.22.3-alpine AS build

WORKDIR /workspace
RUN npm install --global npm@11.17.0
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build:shared && npm run build:platform

FROM nginx:stable-alpine AS runtime
COPY ops/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/dist/apps/platform/browser /usr/share/nginx/html

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 CMD wget -q -O /dev/null http://127.0.0.1/healthz || exit 1
