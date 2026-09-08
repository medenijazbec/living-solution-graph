FROM node:26-alpine
WORKDIR /app
COPY --chown=node:node . .
RUN mkdir -p /data /workspace && chown node:node /data /workspace
ENV LSG_HOST=0.0.0.0 \
    LSG_PORT=7347 \
    LSG_DB_PATH=/data/lsg.sqlite \
    LSG_WORKSPACE_ROOT=/workspace
VOLUME ["/data", "/workspace"]
EXPOSE 7347
USER node
CMD ["node", "src/cli.mjs", "http"]
