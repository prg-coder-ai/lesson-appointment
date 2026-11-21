# 云托管 web（前端 nginx 容器）源文件

这两个文件是 `booking-web` 镜像的**源文件**，受版本控制：

| 文件 | 作用 |
|---|---|
| `Dockerfile` | nginx:1.27-alpine + 拷入 dist + 构建期 envsubst 生成 nginx.conf |
| `nginx.conf.template` | 前端静态托管 + `/api/v1/*` 双上游反代（booking / message-service） |

## 为什么放在这里，而不是 `cloudBased/web/`

`cloudBased/web` 是**纯暂存目录**（已在 `.gitignore` 里整目录忽略），里面堆着：

- `dist/` —— 前端构建产物（每次 build 覆盖）
- `Dockerfile` / `nginx.conf.template` —— 构建前从本目录**拷进去**的源文件
- 顺带还有 `web.zip`、`readme.md` 等打包中间物

把源文件留在那里会出现"源码和产物混在一起"的误判：`git status` 一片干净，改了模板却不知道有没有入库。

## 构建流程（不用手工拷）

```bash
# 全量（含前端 build + 三个镜像）
node cloudBased/scripts/build-all.sh --env-id <云托管环境ID>

# 或 Windows
powershell -File cloudBased/scripts/build-all.ps1 -EnvId <云托管环境ID>
```

脚本在 Step 3c 会先

```
cp deploy/nginx/cloudbase-web/{Dockerfile,nginx.conf.template}  cloudBased/web/
```

再在 `cloudBased/web`（构建上下文）里执行 `docker build`，并传入两个上游：

```
--build-arg API_UPSTREAM=http://api.<envid>.svc.cluster.local:8081
--build-arg MSG_UPSTREAM=http://message-service.<envid>.svc.cluster.local:8090
```

## 手工构建时（务必先拷）

```bash
cp deploy/nginx/cloudbase-web/Dockerfile deploy/nginx/cloudbase-web/nginx.conf.template cloudBased/web/
cd cloudBased/web
docker build \
  --build-arg API_UPSTREAM=http://api.<envid>.svc.cluster.local:8081 \
  --build-arg MSG_UPSTREAM=http://message-service.<envid>.svc.cluster.local:8090 \
  -t booking-web:latest .
```

> 两个 `--build-arg` 缺一个，构建会**直接失败**（Dockerfile 里有非空校验）。
> 不要传 `https://message-<envid>...` —— 那个域名不存在（返回 `INVALID_HOST`），
> 正确写法是 `message-service-`。

## 相关文件

- 自建服务器/本机 nginx 的完整注释版：`doc-develop/nginx-代理远端API-样例.conf`
- 本地联调代理：`doc-develop/dev-frontend-remote-tcb.js`
- 分流规则三处必须一致：本文件、上面两个。
  `/api/v1/{message,sensitive,sse,users/}` → 消息服务，其余 `/api/v1/*` → booking。
