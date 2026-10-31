FROM node:24-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG VITE_API_BASE_URL=/api
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
RUN npm run build

# A rolling tag on purpose: a version tag stops getting patches once that branch
# ends, and scanners miss it because nginx comes from nginx.org, not Alpine.
FROM docker.io/nginxinc/nginx-unprivileged:stable-alpine

USER root
RUN apk --no-cache upgrade

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

USER 101

EXPOSE 3000

CMD ["nginx", "-g", "daemon off;"]
