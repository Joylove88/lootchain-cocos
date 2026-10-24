# 游戏站点镜像(Railway,后端仓 docs/44):nginx + release:web 产出的静态包。
# 构建上下文由 build-image.sh 组装:静态包按文件路径散到 web_00 … web_15 十六个目录,脚本在本文件末尾追加对应的 COPY 行,
# 每层约 40MB——单层 550MB 时经本机代理推 GHCR 反复断线(2026-10-24),小层断了只重传那一层。
FROM nginx:1.27-alpine
ENV PORT=8080 \
    GAME_UPSTREAM=lootchain-game.railway.internal:8081 \
    NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1
RUN rm -f /etc/nginx/conf.d/default.conf
COPY default.conf.template /etc/nginx/templates/default.conf.template
EXPOSE 8080
