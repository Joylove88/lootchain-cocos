#!/usr/bin/env bash
# 把 release:web 的发版包做成 nginx 镜像并推到 GHCR(后端仓 docs/44)。
# 用法:bash deploy/railway-web/build-image.sh build/release/lootchain-web-<时间>-<commit>.tar.gz [--push]
# 镜像名:ghcr.io/joylove88/lootchain-web:<版本>,同时打 latest。Railway 的游戏站点服务拉 latest,推完后在 Railway 上重新部署该服务。
set -euo pipefail

TAR="${1:?用法: build-image.sh <lootchain-web-*.tar.gz> [--push]}"
PUSH="${2:-}"
HERE="$(cd "$(dirname "$0")" && pwd)"
IMAGE="${LOOTCHAIN_WEB_IMAGE:-ghcr.io/joylove88/lootchain-web}"
VERSION="$(basename "$TAR" .tar.gz | sed 's/^lootchain-web-//')"

CTX="$(mktemp -d)"
trap 'rm -rf "$CTX"' EXIT
mkdir -p "$CTX/web"
tar -xzf "$TAR" -C "$CTX/web"
# 发版包可能多包一层目录:index.html 不在根上就下钻一层
if [ ! -f "$CTX/web/index.html" ]; then
  inner="$(find "$CTX/web" -mindepth 1 -maxdepth 1 -type d | head -1)"
  [ -n "$inner" ] && [ -f "$inner/index.html" ] || { echo "发版包里找不到 index.html" >&2; exit 1; }
  mv "$inner" "$CTX/web_inner" && rm -rf "$CTX/web" && mv "$CTX/web_inner" "$CTX/web"
fi
for f in index.html sw.js version.json; do
  [ -f "$CTX/web/$f" ] || { echo "发版包缺 $f" >&2; exit 1; }
done
cp "$HERE/Dockerfile" "$HERE/default.conf.template" "$CTX/"

docker build -t "$IMAGE:$VERSION" -t "$IMAGE:latest" "$CTX"
echo "built $IMAGE:$VERSION"
if [ "$PUSH" = "--push" ]; then
  docker push "$IMAGE:$VERSION"
  docker push "$IMAGE:latest"
  echo "pushed $IMAGE:$VERSION"
fi
