# 微信云托管部署工作区

> 配合手册 `doc-develop/微信云托管部署操作手册-预约系统-2026-10-14.md` 使用。
> 本目录集中存放云托管所需的容器化配置和迁移准备文件，**源码仍在原项目根目录**。

## 目录结构

```
cloudBased/
├── api/                      # 主后端服务容器化
│   ├── Dockerfile            # Java 17 + Asia/Shanghai
│   ├── container.config.json # 云托管规格（端口 8081）
│   ├── application-cloud.properties  # 覆盖 serverTimezone + 数据源地址
│   └── .dockerignore
│
├── message-service/          # 消息中心服务容器化
│   ├── Dockerfile            # Java 17 + Asia/Shanghai
│   ├── container.config.json # 端口 8090
│   ├── application-cloud.properties
│   └── .dockerignore
│
├── web/                      # 前端静态托管 + /api 反代（Nginx）
│   ├── Dockerfile            # nginx:alpine + envsubst 替换 ${API_UPSTREAM}
│   ├── nginx.conf.template   # 反代 /api 到后端，透传 X-WX-* Header
│   └── container.config.json # 端口 80
│
├── env/                      # 环境变量模板（占位符）
│   ├── .env.api.example              # api 服务（含微信变量）
│   ├── .env.message-service.example  # message-service（无微信变量）
│   └── README.txt                     # 变量名 × 服务 对照表
│
└── db/                       # 数据库迁移准备
    └── README.md             # 方案选择 + 现有 schema 脚本路径 + 时区强制项
```

## 快速执行路径（按顺序）

### Step 1 — 本地预打包 jar

```bash
# api
cd <项目根>/api
mvn clean package -DskipTests
# 产物：target/booking-api-2.2.0.jar

# message-service
cd <项目根>/api/message-service
mvn clean package -DskipTests
# 产物：target/message-service-1.1.0.jar
```

### Step 2 — 前端构建

```bash
cd <项目根>/frontend
node build.js
# 产物：frontend/dist/
# 把整个 dist/ 拷贝到 cloudBased/web/dist/
```

### Step 3 — 数据库迁移

见 `db/README.md`。核心：schema 脚本在原项目根 `api/sql/` 下，cloudBased 不重复维护。

### Step 4 — 控制台创建 3 个服务

| 服务名 | containerPort | 用途 |
|--------|---------------|------|
| api | 8081 | 主后端 |
| message-service | 8090 | 消息中心 |
| web | 80 | 前端 Nginx |

### Step 5 — 每个服务的环境变量

按 `env/.env.<服务>.example` 模板填，密钥一律走加密变量，改完**重新发布**。

### Step 6 — web 服务的 nginx.conf 占位符替换

`cloudBased/web/container.config.json` 里 `envParams.API_UPSTREAM` 填 api 服务的**内网地址**：
```
http://api.<envid>.svc.cluster.local:8081
```

### Step 7 — 发布验证

1. 三个服务都能 build 通过、实例健康
2. web 静态页面能打开
3. web/api/xxx 能正确反代到 api 后端
4. `/api/v1/health` 返回 200
5. 登录、微信能力正常
