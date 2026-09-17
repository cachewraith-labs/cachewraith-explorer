# Builds .deb, .rpm and AppImage packages on Ubuntu 22.04.
#
# Building on the oldest supported base keeps the binary's glibc requirement low, so the
# same packages run on Ubuntu 22.04+, Debian 12+, Fedora 38+, openSUSE, Arch and others.
# Every download is pinned to an exact version, and Node is checksum-verified.
FROM ubuntu:22.04@sha256:829f6df217bcbae2b371026e81711d1a787c61b2967ad09d015063663ebafbf7

ARG RUST_VERSION=1.97.1
ARG NODE_VERSION=24.19.0
ARG NODE_SHA256=14b342e71204f811bde6153be8e04b62aef63c236fef92b55f9c83154b409647
ARG PNPM_VERSION=11.22.0

ENV DEBIAN_FRONTEND=noninteractive \
    RUSTUP_HOME=/opt/rustup \
    CARGO_HOME=/opt/cargo \
    PATH=/opt/cargo/bin:/opt/node/bin:$PATH \
    APPIMAGE_EXTRACT_AND_RUN=1 \
    CI=true

RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential ca-certificates curl file git patchelf rsync wget xz-utils \
        libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev \
        libssl-dev libxdo-dev xdg-utils \
    && rm -rf /var/lib/apt/lists/*

RUN curl --proto '=https' --tlsv1.2 -fsSL https://sh.rustup.rs \
        | sh -s -- -y --no-modify-path --profile minimal --default-toolchain "$RUST_VERSION" \
    && chmod -R a+rwX /opt/cargo /opt/rustup

RUN curl -fsSLo /tmp/node.tar.xz "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz" \
    && echo "${NODE_SHA256}  /tmp/node.tar.xz" | sha256sum -c - \
    && mkdir -p /opt/node && tar -xJf /tmp/node.tar.xz -C /opt/node --strip-components=1 \
    && rm /tmp/node.tar.xz \
    && npm install -g "pnpm@${PNPM_VERSION}"

COPY build.sh /usr/local/bin/build-packages
ENTRYPOINT ["/usr/local/bin/build-packages"]
