FROM node:24-alpine
RUN apk add --no-cache chromium font-noto-cjk
ENV SELF_CHROMIUM_PATH=/usr/bin/chromium
WORKDIR /app
