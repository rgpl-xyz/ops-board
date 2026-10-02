# Build from the repository root: docker build -f apps/web/Dockerfile .
FROM node:24-alpine AS build
WORKDIR /web

COPY apps/web/package.json apps/web/package-lock.json ./
RUN npm ci

COPY apps/web/ ./
# The full commit the image is built from, shown in the app; `dev` when not given.
ARG GIT_SHA=dev
RUN echo "$GIT_SHA" | grep -Eqx 'dev|[0-9a-f]{40}' \
      || { echo "GIT_SHA must be dev or a full 40-character commit" >&2; exit 1; }
RUN npm run build -- --define "OPSBOARD_COMMIT='$GIT_SHA'"

FROM nginx:alpine AS final
ENV NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1
COPY apps/web/nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build /web/dist/web/browser /usr/share/nginx/html
