# 整改跟踪系统 (Rectification Tracking System)

本项目是一个基于 Next.js + Prisma + SQLite 的整改任务跟踪系统，旨在帮助管理员高效分发整改任务，并让各县市用户方便地查看和反馈整改情况。

## 🛠 技术栈

- **框架**: [Next.js](https://nextjs.org/) (App Router)
- **语言**: TypeScript
- **数据库**: SQLite (通过 Prisma ORM 管理)
- **样式**: Tailwind CSS
- **工具**: XLSX (Excel 导入导出)

## 🚀 快速开始 (开发环境)

### 1. 环境准备
确保您的本地环境已安装：
- [Node.js](https://nodejs.org/) (推荐 v18 或更高版本)
- npm (Node.js 安装包通常自带)

### 2. 安装依赖
在项目根目录下执行：
```bash
npm install
```

### 3. 数据库初始化
本项目默认使用本地 SQLite 数据库 (`prisma/dev.db`)。首次运行前需初始化数据库结构：

```bash
# 1. 生成 Prisma Client 代码
npx prisma generate

# 2. 将 Schema 同步到数据库文件 (自动创建 dev.db)
npx prisma db push
```

### 4. 初始化管理员账号
执行内置脚本创建一个默认的管理员账号：
- **用户名**: `admin`
- **密码**: `admin`

```bash
node prisma/seed.js
```

### 5. 启动开发服务器
```bash
npm run dev
```

启动成功后，访问浏览器：[http://localhost:3000](http://localhost:3000)

---

## 📖 使用指南

### 登录系统
访问 `/login` 页面。
- **管理员**: 使用 `admin/admin` 登录，进入后台管理。
- **普通用户**: 使用管理员创建的账号登录，自动跳转至所属县市的任务批次列表。

### 管理员功能 (`/admin`)
1.  **批量导入**: 上传 Excel 文件导入整改任务，支持自定义列映射（如指定哪一列是“县市”）。
2.  **任务管理**: 查看所有批次，删除误导的批次，或导出特定批次的数据。
3.  **用户管理**: 创建各县市的普通用户账号（需绑定具体的县市名称，如“北京”）。
4.  **数据导出**: 支持导出全部数据或按批次导出 Excel。

### 普通用户功能
1.  **批次选择**: 登录后查看相关的任务批次及完成进度。
2.  **任务反馈**: 点击进入任务列表，查看具体问题并提交整改反馈（支持文字和图片）。
3.  **数据导出**: 可导出当前所属县市的任务数据。

---

## 🐳 部署指南 (推荐 Docker)

### 1. 准备数据目录
在服务器上创建一个目录用于存放数据库文件，防止容器重启数据丢失。
```bash
mkdir -p ./data
# 确保该目录有写权限
chmod 777 ./data
```

### 2. 启动容器
本项目已发布到 GitHub Container Registry，直接运行即可（支持 x86 和 arm64）：

```bash
docker run -d \
  --name rectification-app \
  --restart always \
  -p 3000:3000 \
  -v $(pwd)/data:/app/data \
  -e DATABASE_URL="file:/app/data/dev.db" \
  ghcr.io/javesun99/rectification:latest
```

**说明**：
- 容器启动时会自动检测数据库是否存在。如果不存在，会自动创建表结构并初始化默认管理员账号 (`admin`/`admin`)。
- 请勿修改 `/app/data` 容器内路径，这是数据库的默认存储位置。

### 3. 访问系统
访问 `http://服务器IP:3000` 即可。

---

## 📦 部署指南 (独立运行包 Standalone)

如果您不想使用 Docker，可以直接下载我们构建好的独立运行包（包含 Node.js 运行时以外的所有依赖，支持 Linux x86/ARM64 和 macOS）。

### 1. 下载运行包
前往 GitHub 仓库的 **Actions** 页面，找到最新的构建记录，下载 `standalone-package` Artifact。

### 2. 解压并运行
```bash
# 解压
tar -xzf rectification-system-standalone.tar.gz
cd app

# 启动 (使用内置脚本，自动处理数据库初始化)
./start.sh
```

**前置要求**：
- 服务器需安装 Node.js 18 或更高版本。
- 确保端口 3000 未被占用。

---

## 💻 开发与源码部署

### 1. 环境准备
- Node.js 18+
- npm

### 2. 安装与启动
```bash
# 安装依赖
npm install

# 初始化数据库
npx prisma generate
npx prisma db push
node prisma/seed.js

# 开发模式启动
npm run dev

# 生产模式编译与启动
npm run build
npm start
```


## 🛠 常用维护命令

- **查看/管理数据库**:
    ```bash
    npx prisma studio
    ```
    这会打开一个网页版数据库管理器，方便直接查看和修改数据。

- **Schema 变更后更新**:
    如果修改了 `prisma/schema.prisma` 文件，必须执行：
    ```bash
    npx prisma generate
    ```
    并重启开发服务器。
