# 前端镜像（自建云服务器）

把前端静态站点 + 内层反代装进一个 nginx 容器。**TLS / 限流 / 安全响应头仍留在宿主机 nginx**，
容器只监听 `127.0.0.1:8080` —— 所以它不会抢 80/443，随时可以退回软链方案。

完整步骤、17 条配置判据、故障速查表见：
`doc-develop/04-部署与运维/前端容器化镜像构建与配置校验-20261121-1435.md`

## 30 秒上手

```bash
# 1) 先有 dist（跳过这步会构建出空站点）
CODEBUDDY_SAFE_DELETE_ENABLED=0 node frontend/build.js

# 2) 静态自检 + 构建（含三段镜像自检）
node deploy/docker/frontend/check-config.mjs
bash deploy/docker/frontend/build.sh

# 3) 部署后校验（23 项断言）
bash deploy/docker/frontend/verify.sh http://127.0.0.1:8080
```

## 文件职责

| 文件 | 作用 | 改它要注意 |
|---|---|---|
| `Dockerfile` | nginx:1.27-alpine + dist + 模板 + 启动引导 | 别加 `ENV` 上游地址（那是部署环境信息，不是镜像信息） |
| `nginx/default.conf.template` | 站点配置模板 | **所有 API location 必须 `^~` 或 `=`**，见下 |
| `nginx/proxy_params` | 容器版反代头 | `X-Forwarded-Proto` 用 `$lesson_fwd_proto`，**不能写 `$scheme`**（会把上层的 https 覆盖掉） |
| `nginx/00-proxy-map.conf` | 跨层协议 map | 必须留在 `conf.d`（`http{}` 上下文），挪进 server 块会让 nginx 起不来 |
| `entrypoint/00-preflight.sh` | 校验变量 → 渲染 → 体检 → `nginx -t` | 缺变量时**必须 exit 1**，宁可容器起不来也不要「Running 但全 502」 |
| `check-config.mjs` | 构建前静态自检 + 变异自验证 | 新增 location 后同步补用例 |
| `build.sh` | 拷 dist → 版本校验 → build → 自检 | 别用 `pkill -f "nginx: master"` 收尾（会杀掉宿主机的 nginx） |
| `verify.sh` | 运行期 23 项校验 | 那条 mp4 断言是抓 `^~` 漏写的唯一手段，别删 |
| `compose.fragment.yml` | compose 服务片段 | `network_mode: host` 不能改成端口映射 |

## 三个最容易踩的坑

1. **API location 漏 `^~`** → 带 `.mp4 /.pdf /.png` 后缀的接口被静态正则抢走，
   返回 404 + HTML，`nginx -t` 查不出来。用 `check-config.mjs` 拦。
   （`^~` 只在「它就是最长前缀匹配」时才压住正则，兜底的 `^~ /api/v1/` 救不了它。）
2. **`network_mode` 改成端口映射** → 容器内 `127.0.0.1` 指向自己，三个上游全断，
   `docker ps` 显示 Up、页面能开、接口全 502。
3. **`app-config.json` 挂单文件** → 宿主机路径不存在时 docker 建同名**目录**顶上，
   请求它 403，报错只说 permission denied。挂目录，由 entrypoint 拷。

## 快速定位

```bash
node deploy/docker/frontend/check-config.mjs --self-test   # 证明检查器真会红
docker logs frontend | head -20                            # 预检 6 行
docker exec frontend wget -qO- http://127.0.0.1:8081/actuator/health   # 上游通不通
```
