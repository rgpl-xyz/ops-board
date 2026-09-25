# Build from the repository root: docker build -f apps/web/Dockerfile .
FROM node:24-alpine AS build
WORKDIR /web

COPY apps/web/package.json apps/web/package-lock.json ./
RUN npm ci

COPY apps/web/ ./
RUN npm run build

FROM nginx:alpine AS final
ENV NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1
COPY apps/web/nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build /web/dist/web/browser /usr/share/nginx/html
