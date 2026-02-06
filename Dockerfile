# Dockerfile

# 1. 依赖安装阶段
FROM node:20-alpine AS deps
WORKDIR /app

# 安装 Python 3 + setuptools（提供 distutils）+ 完整编译工具链
# ⚠️ 注意：反斜杠后不能有空格/注释，注释必须单独成行
RUN apk add --no-cache \
    python3 \
    py3-setuptools \
    py3-pip \
    make \
    g++ \
    gcc \
    libc-dev \
    linux-headers \
    && ln -sf /usr/bin/python3 /usr/bin/python
# 复制 package.json 和 lock 文件
COPY package.json package-lock.json ./
# 安装依赖
RUN npm ci

# 2. 构建阶段
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# 设置环境变量，禁用 Next.js 的遥测
ENV NEXT_TELEMETRY_DISABLED=1

# 生成 Prisma Client (必须在 build 前执行)
RUN npx prisma generate

# 构建 Next.js 应用
RUN npm run build

# 3. 运行阶段
FROM node:20-alpine AS runner
WORKDIR /app

# 安装 OpenSSL (Prisma 需要)
# Alpine 3.17+ 默认使用 OpenSSL 3.x，但旧版 Prisma 可能依赖 libssl1.1
# 为了兼容性，安装 openssl 并添加 compatibility layer（如果需要）
RUN apk add --no-cache openssl \
    && ln -s /usr/lib/libssl.so.3 /usr/lib/libssl.so.1.1 \
    && ln -s /usr/lib/libcrypto.so.3 /usr/lib/libcrypto.so.1.1

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

# 创建非 root 用户提高安全性
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# 复制必要文件
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json

# 自动利用 standalone 输出 (Next.js 输出优化)
# 注意：需要在 next.config.ts 中开启 output: 'standalone'
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# 显式复制 Prisma Client (Standalone 模式可能会遗漏部分引擎文件)
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma

# 复制 Prisma Schema 和迁移文件
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma

# 创建数据目录并设置权限
RUN mkdir -p /app/data && chown -R nextjs:nodejs /app/data

# 切换到非 root 用户
USER nextjs

EXPOSE 3000

# 启动命令
CMD ["node", "server.js"]
