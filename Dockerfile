# Atalaya · imagen para servidor propio (sin dependencias de Cloudflare)
# Node 24 trae SQLite incorporado (node:sqlite): no hay que instalar paquetes.
FROM node:24-slim

ENV NODE_ENV=production \
    PORT=8080 \
    DB_PATH=/data/atalaya.db \
    FILES_PATH=/data/archivos \
    TZ=America/Santiago

WORKDIR /app
COPY package.json ./
COPY servidor ./servidor
COPY site ./site
COPY data ./data
COPY scripts ./scripts

# La aplicación corre con un usuario sin privilegios y solo escribe en /data
RUN mkdir -p /data/archivos /data/respaldos && chown -R node:node /data
USER node

EXPOSE 8080
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "--disable-warning=ExperimentalWarning", "servidor/server.mjs"]
