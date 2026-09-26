# 纯前端交付物，零运行时依赖；使用官方精简 Node 镜像提供静态服务与验证。
FROM node:20-alpine

WORKDIR /app

# 项目零 npm 依赖，直接内联复制；不执行 npm install（可离线构建/运行）
COPY index.html health.html styles.css package.json ./
COPY src ./src
# verify 服务还需要测试与脚本
COPY test ./test
COPY scripts ./scripts

EXPOSE 8080

HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/health').then(r=>{if(r.status!==200)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "scripts/serve.js"]
