#!/bin/sh
set -e

# 自动同步数据库结构
echo "Running database migrations..."
npx prisma db push

# 自动填充初始数据（seed.js 中使用了 upsert，所以是幂等的，可以重复运行）
echo "Seeding database..."
node prisma/seed.js

# 启动应用
echo "Starting application..."
exec "$@"