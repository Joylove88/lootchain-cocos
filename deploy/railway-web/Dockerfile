# 游戏站点镜像(Railway,后端仓 docs/44):nginx + release:web 产出的静态包。
# 构建上下文由 build-image.sh 组装:web/ = 解压后的发版包,default.conf.template = 本目录同名文件。
FROM nginx:1.27-alpine
ENV PORT=8080 \
    GAME_UPSTREAM=lootchain-game.railway.internal:8081 \
    NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1
RUN rm -f /etc/nginx/conf.d/default.conf
COPY default.conf.template /etc/nginx/templates/default.conf.template
COPY web/ /usr/share/nginx/html/
EXPOSE 8080
