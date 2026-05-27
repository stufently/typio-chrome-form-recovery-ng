# Docker image for building and testing Typio Chrome Form Recovery NG.
# No local Node.js installs anywhere — everything goes through this image.
#
# Usage:
#   docker build -t typio-ng-build .
#   docker run --rm -v "$PWD":/app -w /app typio-ng-build npm run build
#
# Pinned to a digest in CI for reproducibility.
FROM node:22.11-alpine

# Tools needed by WXT (puppeteer-extra, sharp for icon generation, etc.) and
# by web-ext (libxml for the linter). Apt equivalents are intentionally absent
# from alpine; we install the minimal alpine set.
RUN apk add --no-cache \
    bash \
    git \
    make \
    libc6-compat \
    chromium \
 && rm -rf /var/cache/apk/*

ENV CHROME_BIN=/usr/bin/chromium-browser
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=true

WORKDIR /app

# Default to a shell so `docker run -it typio-ng-build` is useful for poking.
CMD ["bash"]
