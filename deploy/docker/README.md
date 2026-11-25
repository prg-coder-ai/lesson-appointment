# Docker 容器化部署与前后版本切换

面向自建云服务器（腾讯云 CVM / 阿里云 ECS / 华为云 ECS）的单机 Docker 方案。  
读完这一份即可完成：**装 Docker → 首次部署（含从现有 systemd 迁移）→ 日常发布 → 版本切换与回滚 → 排障**。

> 与 `deploy/upload-to-server.sh` 的关系：那是 **systemd + jar + nginx** 的部署路径，仍然可用。  
> 两条路径**不要同时开**（同一个 8081 会被两个进程抢）。容器化之后 `upload-to-server.sh`  
> 里除 jar 之外的部分（sql / nginx / logrotate / backup.sh）依然要传，见第四节。

---

## 一、这套方案的分工

| 组件                                           | 跑在哪                       | 为什么                                                                    |
| -------------------------------------------- | ------------------------- | ---------------------------------------------------------------------- |
| booking 8081 / message 8090 / classroom 8092 | **容器**                    | 版本切换的单位就是它们                                                            |
| Redis                                        | 容器（可选）                    | 课堂强依赖；也可继续用宿主机 apt 装的                                                  |
| MySQL 8.4                                    | **宿主机**                   | 数据在容器外的备份/调参/升级路径都更成熟；容器化它只会让 `mysqldump 连哪` 变复杂                       |
| Nginx + 前端 dist                              | **宿主机**                   | 证书、限流 zone（`limit_req_zone` 必须在 http{} 上下文）、安全响应头、白名单都已跑通；容器化收益极低、风险不低 |
| 版本切换                                         | `deploy/docker/switch.sh` | 后端切镜像 tag，前端切软链，**两者独立**                                               |

一句话：**只把"会频繁换版本、且无状态"的部分装进容器**，其余保持现状。

> 补充（2026-11-21）：前端**也可以**容器化，作为上面的可选替代，资产在 `deploy/docker/frontend/`。
> 定位不同 —— 它把「静态站点 + 内层反代」装进容器，但 TLS / 限流 / 安全头仍留在宿主机 nginx，
> 容器只监听 `127.0.0.1:8080`。切换只需改宿主机 nginx 的两行（静态 `root` → `proxy_pass`），
> 随时能改回来。完整步骤与 17 条配置判据见
> `doc-develop/04-部署与运维/前端容器化镜像构建与配置校验-20261121-1435.md`，
> 上手命令见 `deploy/docker/frontend/README.md`。
> 两条路径可并存，不互相覆盖（容器在 8080，软链方案仍在 `/var/www/frontend`）。

---

## 二、安装 Docker

### 2.1 一条命令（推荐）

```bash
# 以 root 或 sudo 执行；脚本会做发行版识别、卸冲突包、配源、写 daemon.json、自检
sudo bash install-docker.sh

# 系统盘小、独立数据盘挂在 /data 时（强烈建议，镜像+日志很吃盘）
sudo DATA_ROOT=/data/docker bash install-docker.sh

# 源：默认腾讯云镜像；阿里云机器用 aliyun；能直连官方就用 official
sudo MIRROR_REGION=aliyun bash install-docker.sh
```

|                                  |                                                                             |
| -------------------------------- | --------------------------------------------------------------------------- |
| 脚本支持 Ubuntu / Debian（\`ID=ubuntu | debian\`）与 RHEL 系（CentOS / Anolis / Rocky / AlmaLinux / openEuler / Kylin）。 |

### 2.2 为什么不用 `apt install docker.io`

- 发行版自带的 `docker.io` **没有 compose v2 插件**，`docker compose` 命令根本不存在，  
  而本项目所有脚本都用 v2 语法（v1 的 `docker-compose` 已于 2023 年 EOL，Python 依赖也装不上）。
- 版本常年落后 1~2 年，`--format` / `--no-deps` / `healthcheck` 的一些行为对不上。
- 装官方 docker-ce 前必须先卸 `docker.io` / `docker-compose` / 旧 `containerd`，  
  否则 apt 报 `docker-ce : Conflicts: docker.io`，而报错信息不足以让人想到要卸。

### 2.3 daemon.json 里每一项的作用

```json
{
  "data-root": "/data/docker",
  "log-driver": "json-file",
  "log-opts": { "max-size": "50m", "max-file": "3" },
  "live-restore": true,
  "default-ulimits": { "nofile": { "Name": "nofile", "Hard": 65536, "Soft": 65536 } }
}
```

| 项              | 不配会怎样                                                                     |
| -------------- | ------------------------------------------------------------------------- |
| `log-opts`     | 容器 stdout 默认**无上限**。服务天天重启、日志涨到几十 GB 把盘写满，表现是"所有服务都在跑但全站 502"。这是容器化最经典的自伤 |
| `data-root`    | 默认 `/var/lib/docker` 在系统盘。几十次发布后旧镜像能吃掉 20~50GB，系统盘 40GB 的机器必炸             |
| `live-restore` | 升级/重启 docker 本体时容器会被一起停 → 每次运维基础组件都是一次停机                                  |
| `nofile`       | 课堂的 WebSocket + SSE 长连接会吃掉大量 fd，默认 1024 在高并发课堂下不够                         |

### 2.4 装完的验证

```bash
docker version --format '{{.Client.Version}} / {{.Server.Version}}'
docker compose version          # 必须看到 v2.x，没有就是装成了 docker-compose v1
docker info --format '{{.DockerRootDir}} {{.LoggingDriver}}'
ss -lntp | grep -E ':(8081|8090|8092|6379)'   # 看旧 systemd 服务是否还占着端口
```

### 2.5 账号与权限（等保口径）

```bash
sudo useradd -r -m -s /bin/bash lesson        # 已有则跳过
sudo usermod -aG docker lesson
id -u lesson; id -g lesson                    # → 写进 .env 的 LESSON_UID / LESSON_GID
```

**加 `docker` 组 = 等效 root**（能 `-v /:/host` 挂根目录）。等保场景更推荐：部署账号不给 docker 组，  
只在 sudoers 里白名单放行固定命令：

```
lesson ALL=(root) NOPASSWD: /usr/bin/docker compose, /bin/bash /opt/lesson/docker/switch.sh, /bin/bash /opt/lesson/docker/rollback.sh
```

---

## 三、四个关键设计决策（先看这节，不然第四节会看不懂）

### 3.1 用 `network_mode: host`，不用端口映射

这是整套方案最重要的一条。`/etc/lesson/*.env` 里这些值全是 `127.0.0.1`：

```
SPRING_DATASOURCE_URL=jdbc:mysql://127.0.0.1:3306/...
REDIS_HOST=127.0.0.1
BOOKING_API_URL=http://127.0.0.1:8081
SERVER_ADDRESS=127.0.0.1
```

如果按常规做法用桥接网络 + `ports: 127.0.0.1:8081:8081`：

- 容器内的 `127.0.0.1` 指向**容器自己**，上面 4 个地址**同时失效**（连不上库、连不上 Redis、  
  课堂回调预约系统失败）——而报错分别是 connection refused，谁都不会先怀疑是网络模式；
- 更隐蔽的是 `SERVER_ADDRESS=127.0.0.1` 会让 Java 只监听**容器回环**，  
  端口映射压根接不进来：`docker ps` 显示 Up、`curl 127.0.0.1:8081` 却是 connection refused。

`network_mode: host` 让容器与宿主机共享网络栈：上面所有值**一字不改继续有效**，  
宿主机 nginx 的 `proxy_pass http://127.0.0.1:8081` 也一行不改，只改"谁在监听这个端口"。

代价与对冲：

| 代价                  | 对冲                                                             |
| ------------------- | -------------------------------------------------------------- |
| 失去网络隔离，容器能访问宿主机所有端口 | 非 root 运行 + `no-new-privileges`；服务本身受 `SERVER_ADDRESS` 限制只监听回环 |
| 两个容器不能同时用同一端口       | 蓝绿切换时用不同的 `SERVER_PORT` 覆盖（第八节）                                |
| 仅 Linux 支持          | 生产就是 Linux；开发机本地调试不用这套                                         |

> 若确实要用桥接网络：必须把 4 个 env 值改成 `host.docker.internal`（需要  
> `extra_hosts: - "host.docker.internal:host-gateway"`）或 docker 网桥网关 IP，  
> 同时把 `SERVER_ADDRESS` 改成 `0.0.0.0`。相当于多改 5 处配置换一点隔离，不划算。

### 3.2 容器用宿主 `lesson` 账号的 uid 运行

`compose` 里 `user: "${LESSON_UID}:${LESSON_GID}"`。原因：env 里 `LOG_PATH=/var/log/lesson/api`  
和 `STORAGE_LOCAL_ROOT=/opt/lesson/data/oss` 是**宿主机目录**，挂进容器后属主是 `lesson`(uid 1000 左右)。  
镜像内默认的 `appuser` 是 uid 999，写不进去 → 容器启动即退出，日志只剩一行 `Permission denied`。

### 3.3 `TEACHER_UPLOAD_PATH` 必须显式指定

`application.properties` 里是 `teacher.upload.path=${TEACHER_UPLOAD_PATH:${user.home}/teacher-uploads}`，  
而 `user.home` 靠 `/etc/passwd` 解析：容器以 `uid=1000` 运行，但容器内 `/etc/passwd` 里  
没有 uid 1000 的记录 → JDK 把 `user.home` 退化成 `"?"` → 老师头像写进  
`/app/?/teacher-uploads`（镜像可写层）。**容器一重建全丢，宿主机磁盘上还看不见。**

所以 compose 里硬设 `TEACHER_UPLOAD_PATH: /app/data/teacher-uploads` 并挂卷。  
**首次切换前必须把旧数据搬过来**（见 4.4），否则老师头像全 404。

### 3.4 `docker compose up -d` 返回 0 ≠ 部署成功

容器崩了，compose 会按 `restart: unless-stopped` 把它拉进 restart 循环，而 `up -d`  
早就返回 0 了。**只看退出码就宣布上线，是最常见的"静默发布失败"**。

`switch.sh` 因此做三件事：轮询 `docker inspect` 的 `Health.Status` 到 `healthy`、  
再打一次 `actuator/health/readiness` 确认 200、任何一步失败立刻把 `.env` 改回旧 tag 重新拉起。

---

## 四、首次部署（从 systemd 迁到 Docker）

> 全程约 20~30 分钟。**第 4.4 步（数据搬家）漏了会丢东西，别跳。**

### 4.1 前置检查

```bash
# 1) 旧服务占着端口 → 先停（不删 unit，留着随时能退回 systemd）
sudo systemctl stop booking message-service classroom-service
sudo systemctl disable booking message-service classroom-service
ss -lntp | grep -E ':(8081|8090|8092)'     # 应为空

# 2) MySQL / Redis 在跑
mysqladmin -uroot -p ping
redis-cli -n 2 ping                         # → PONG（课堂用 db 2）
```

### 4.2 建目录与授权

```bash
sudo mkdir -p /var/log/lesson/{api,message,classroom} \
              /opt/lesson/data/{oss,redis,teacher-uploads} \
              /opt/lesson/docker /var/www/releases
sudo chown -R lesson:lesson /var/log/lesson /opt/lesson/data /var/www/releases
```

### 4.3 放编排文件

> 新机器（第一次上云）还需要 SQL / nginx 站点 / logrotate / backup.sh 这些**跟容器无关**的资产，  
> 直接跑一次 `SERVER=root@<ip> bash deploy/upload-to-server.sh` 即可（它只传文件、不重启服务；  
> jar 那几步传过去也用不上，留在 `/opt/lesson/*.jar` 正好作为逃生路径，见 10.5）。  
> 跑完再把下面这套 docker 文件传上去。

```bash
# 从仓库上传 deploy/docker/（任选其一）
rsync -av deploy/docker/ root@server:/opt/lesson/docker/
# 或 scp deploy/docker/{docker-compose.yml,switch.sh,rollback.sh} root@server:/opt/lesson/docker/

ssh root@server
cd /opt/lesson/docker
cp env.example .env
sed -i "s/^LESSON_UID=.*/LESSON_UID=$(id -u lesson)/; s/^LESSON_GID=.*/LESSON_GID=$(id -g lesson)/" .env
chmod 600 .env
chmod +x switch.sh rollback.sh
```

`.env` 里三个 `*_TAG` 要填成实际镜像 tag（格式 `<pom版本>-<git sha>`，由 `build-images.sh` 产出）。

### 4.4 数据搬家（漏了会丢数据）

```bash
# ① 教师上传目录：systemd 时代落在 lesson 的 home 下
ls -ld /home/lesson/teacher-uploads 2>/dev/null && \
  sudo rsync -a /home/lesson/teacher-uploads/ /opt/lesson/data/teacher-uploads/

# ② 课堂存储 /opt/lesson/data/oss 与日志目录：路径没变，无需搬（这就是挂载用同路径的原因）

# ③ 三份 env 不用动：DB/Redis/BOOKING_API_URL 全是 127.0.0.1，host 网络下继续有效
sudo ls -l /etc/lesson/*.env
```

### 4.5 拉镜像并启动

```bash
# 在开发机上：构建 → 打包 → 传输 → load
SERVER=root@<ip> bash deploy/docker/build-images.sh     # 出镜像与 /tmp/lesson-image-tags.txt
SERVER=root@<ip> bash deploy/docker/release.sh --skip-build --frontend-only
#   ↑ 首次可以先只走「传输 + load」，版本切换放在 4.6 手工做一次，便于观察

# 服务器上首次启动（手工，便于看日志）
cd /opt/lesson/docker
sudo docker compose --env-file .env up -d
sudo docker compose ps
sudo docker compose logs -f booking        # Ctrl-C 退出，不影响容器
```

### 4.6 首次切换（走脚本，验证健康检查链路）

```bash
sudo bash /opt/lesson/docker/switch.sh booking   2.2.0-<sha>
sudo bash /opt/lesson/docker/switch.sh message   1.1.0-<sha>
sudo bash /opt/lesson/docker/switch.sh classroom 1.0.0-<sha>
sudo bash /opt/lesson/docker/switch.sh status
```

### 4.7 前端：实体目录 → releases 软链

`switch.sh frontend` **不会自动删除**线上目录（哪怕逻辑对，运维看到"目录突然消失"也会慌），  
首次需要手工迁移一次：

```bash
sudo mkdir -p /var/www/releases
sudo mv /var/www/frontend /var/www/releases/legacy-$(date +%Y%m%d-%H%M%S)
sudo ln -sfn "$(ls -1dt /var/www/releases/legacy-* | head -1)" /var/www/frontend
sudo nginx -t && sudo systemctl reload nginx
curl -I http://127.0.0.1/            # → 200，首页正常
```

之后所有前端发布都由 `release.sh` 自动完成（`rsync → releases/<时间戳> → 切软链 → reload`）。

### 4.8 首次部署验收清单

```bash
sudo docker compose ps                       # 三个都是 Up (healthy)
curl -s localhost:8081/actuator/health/readiness   # {"status":"UP"}
curl -s localhost:8090/actuator/health/readiness
curl -s localhost:8092/actuator/health/readiness
curl -s localhost:8092/api/v1/rtc/providers        # configured/active/degraded
curl -s -o /dev/null -w '%{http_code}\n' localhost/api/v1/system/info   # 200，且是 nginx 转发进来的
redis-cli -n 2 ping                                # PONG
df -h /var/lib/docker /opt                          # 数据盘余量
```

---

## 五、日常发布

```bash
# 开发机：构建 jar → 构建镜像 → 打包传输 → 远端切版本（失败自动回滚）
bash deploy/build-backends.sh
node deploy/collect-artifacts.js
SERVER=root@<ip> bash deploy/docker/release.sh

# 只发某一个服务
SERVER=root@<ip> bash deploy/docker/release.sh --only classroom

# 只发前端（不动后端）
SERVER=root@<ip> bash deploy/docker/release.sh --frontend-only
```

`release.sh` 的六步：构建 → `docker save`（一次打包三个，共享 JRE 层）→ `scp` →  
`sha256sum` 校验 + `docker load` → `switch.sh` 逐个切 → 前端 `rsync` + 切软链。

**为什么用 save/load 而不是推镜像仓库**：单机、发布频率低，多一个 Harbor 就多一个要打补丁的组件。  
规模起来（>2 台 / 每天多次）时，把 `load` 换成 `push/pull` 即可，**切换机制完全不用改** ——  
这就是"发布"与"分发"解耦的收益。镜像包 400~600MB，走内网。

> **接到 CI（GitHub Actions / GitLab CI）时**：把 `release.sh` 拆成两半 ——  
> "构建 + push 镜像"一半，"`ssh` 执行 `switch.sh`"另一半。  
> 关键一条：**别在 CI 里 ssh 完就判绿**。`ssh` 的退出码才是结论，而 `switch.sh`  
> 自己会做健康检查并在失败时回滚、返回非 0；如果写成 `ssh ... ; echo deployed`，  
> 失败会被吞掉，流水线全绿而线上在跑旧版本。

---

## 六、版本切换与回滚

### 6.1 后端（镜像 tag）

```bash
sudo bash switch.sh status                       # 先看现在跑的是什么
sudo bash switch.sh booking 2.2.0-b7f2a11        # 切到指定版本
sudo bash switch.sh booking 2.2.0-a1b2c3d        # "切回"就是再切一次，方向无所谓
sudo bash rollback.sh booking                    # 自动回上一版（从 releases.log 推）
```

机制：改 `/opt/lesson/docker/.env` 里对应的一行 `*_TAG` → `docker compose up -d --no-deps <svc>`  
→ 等 healthy → 失败自动改回旧 tag。**切换是"改声明 + 重建容器"，不是"替换文件"**，  
所以不存在"jar 拷了一半"的状态。

`--no-deps` 是必须的：`classroom` 声明了 `depends_on: redis`，不带它会把 Redis 一起重启 ——  
课堂在线态 key 在 Redis 里，重启等于把在课学生全判掉线。

### 6.2 前端（软链）

```bash
ls -1t /var/www/releases/                        # 看历史发布
sudo bash switch.sh frontend 20261120-2230       # 切到某个发布
sudo bash rollback.sh frontend                   # 回上一版
```


`/var/www/frontend` 是一个软链，指向 `/var/www/releases/<id>`。切换用  
`ln -sfn` + `mv -T` 两步原子操作，中间不存在"软链指向空"的窗口。  
`releases/` 只增不删，留 5~10 个即可（每个约 5MB）。

### 6.3 发布记录

`/opt/lesson/docker/releases.log`，tab 分隔，`switch.sh` 每次切换自动追加：

```
时间                    服务        旧版本           新版本          结果
2026-11-20 22:31:07    booking    2.2.0-a1b2c3d   2.2.0-b7f2a11   ok
2026-11-21 09:12:44    classroom  1.0.0-a1b2c3d   1.0.0-c9d1e02   failed-rolled-back
```

`rollback.sh` 就是在读它。**不要手工编辑这个文件**，它是回滚的唯一依据。

### 6.4 数据库迁移与回滚的次序

回滚的是**代码**，不是**数据库**。所以：

1. DDL 一律"只加不删"：新字段先加、先允许 NULL、下个版本才删旧字段；
2. 发布顺序：**先跑 SQL，再切镜像**（旧代码不读新字段，多一层字段是安全的）；
3. 回滚顺序：**直接回镜像**（新表新列旧代码不读，一般不炸）；
4. 破坏性变更（字段改名、语义变化）必须拆两个版本发布，不能一个版本内完成。

---

## 七、目录与端口一览

```
/opt/lesson/docker/
├── docker-compose.yml      编排（从仓库 deploy/docker/ 来）
├── .env                    版本清单（三 TAG + uid + 上传目录）★ 切版本改这里
├── .env.prev               切换过程中的临时备份（成功后自动删）
├── releases.log            切换记录（回滚依据）
├── switch.sh / rollback.sh 服务器侧切换脚本
└── env.example             模板

/var/log/lesson/{api,message,classroom}/     容器内 LOG_PATH 挂载点（logback 写）
/opt/lesson/data/oss/                        课堂讲稿/作品/录制（挂载）
/opt/lesson/data/teacher-uploads/            booking 教师上传（挂载）
/opt/lesson/data/redis/                      Redis AOF（挂载）
/var/www/releases/<id>/                      前端历史版本
/var/www/frontend → releases/<id>            当前前端（软链）
```

| 服务        | 监听             | 暴露面                               |
| --------- | -------------- | --------------------------------- |
| booking   | 127.0.0.1:8081 | 仅本机，nginx 反代                      |
| message   | 127.0.0.1:8090 | 仅本机，nginx 反代                      |
| classroom | 127.0.0.1:8092 | 仅本机，nginx 反代（含 `/ws/classrooms/`） |
| nginx     | 80 / 443       | 公网（安全组只放这两个）                      |
| MySQL     | 127.0.0.1:3306 | 仅本机                               |
| Redis     | 127.0.0.1:6379 | 仅本机                               |

---

## 八、零中断演进：蓝绿双槽（可选，别急着上）

当前 `switch.sh` 是"停旧起新"，中断时间 = JVM 启动时间（booking 约 20~~40s，classroom 约 40~~70s）。

若确实要求 HTTP 无感，做法是**同一镜像跑两套容器，用不同端口**：

```bash
# 绿色槽：覆盖 SERVER_PORT 起在 18081
docker run -d --name lesson-booking-green --network host \
  --env-file /etc/lesson/booking.env -e SERVER_PORT=18081 -e SERVER_ADDRESS=127.0.0.1 \
  lesson/booking-api:<new-tag>

# 健康后把 nginx 切过去（需要把 proxy_pass 改成 upstream 块 + reload）
upstream booking_api { server 127.0.0.1:18081; keepalive 32; }
```

**但对课堂要降低期望**：`/ws/classrooms/` 是 WebSocket 长连接，切流后连接仍会断，  
客户端要重连（前端已做自动重连 + 会话恢复）。所以蓝绿的收益只在 HTTP 接口，  
课堂的实际体验收益 ≈ 0，而运维复杂度翻倍。

结论：**先在单槽方案上把"快速回滚"做扎实（< 60s 回滚到上一版），比追零中断更划算。**

---

## 九、故障排查

| 现象                                     | 先查                                                | 常见原因                                                                |
| -------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------- |
| 容器起来就退出，日志一句 `Permission denied`       | `docker logs <c>`、`ls -ld /var/log/lesson/api`    | `LESSON_UID/GID` 与目录属主不一致（第四 4.2/4.3 步）                             |
| 容器 Up，`curl 127.0.0.1:8081` 却是 refused | `docker compose ps` 看是否用了桥接；`ss -lntp`            | 用了 `ports:` 而不是 host 网络，或 env 里 `SERVER_ADDRESS` 仍是桥接场景下的 127.0.0.1 |
| nginx 502，容器 healthy                   | `curl 127.0.0.1:80/api/v1/system/info` vs 直连 8081 | 上一行；或 env 里残留 `SERVER_PORT` 把服务顶到别的端口（日志不提端口，只表现为 502）              |
| 课堂能进、出勤全 0                             | `docker logs lesson-classroom-1 \| grep Redis`    | Redis 没起 / db 不是 2 / 用了 `allkeys-lru` 驱逐了在线 key                     |
| 老师头像 404                               | `ls /opt/lesson/data/teacher-uploads`             | 4.4 第①步没做，或 `TEACHER_UPLOAD_PATH` 被 env 文件覆盖回 `${user.home}`        |
| 每次发布后日志从零开始                            | `docker logs` 与 `/var/log/lesson/*` 是两份           | 正常：容器 stdout 归 docker 管（50m×3 自动滚），logback 那份在挂载目录                  |
| 镜像越积越多、盘满                              | `docker system df`                                | 见第十节清理命令                                                            |
| `switch.sh` 报"没有镜像 xxx:tag"            | `docker images \| grep lesson/`                   | tag 拼错，或 `docker save`/`load` 那步失败（`release.sh` 会校验 sha256）         |

容器内排查用的常用姿势：

```bash
docker compose exec booking sh                 # 进容器（镜像内有 curl、sh）
docker inspect -f '{{.State.Health.Status}}' lesson-booking-1
docker logs --since 10m lesson-booking-1
docker stats --no-stream                       # 内存/CPU（对比宿主机 --env 里的 -Xmx）
```

---

## 十、运维杂项

### 10.1 镜像清理（保留可回滚窗口）

```bash
# 只清 30 天前的 lesson/* 镜像 —— 最近的必须留着，否则回滚时没镜像
docker images 'lesson/*' --format '{{.Repository}}:{{.Tag}} {{.CreatedAt}}' \
  | awk '$2 < "'"$(date -d '-30 days' +%F)"'" {print $1}' \
  | xargs -r docker rmi

# 悬空镜像（构建中间层）随时可清
docker image prune -f

# 看总占用
docker system df -v
```

### 10.2 备份要改的地方

现有 `deploy/backup.sh` **不用改**：`mysqldump` 在宿主机执行，`/opt/lesson/data/oss`  
路径也与容器内挂载一致。但要把**教师上传目录**纳入：

```bash
# 编辑 /opt/lesson/backup.sh，把 /opt/lesson/data/oss 改成这两个目录一起打
#   /opt/lesson/data/oss  /opt/lesson/data/teacher-uploads
```

⚠️ 老规矩：只回库不回文件 = 记录都在、点开全 404。

Redis 的 AOF 在 `/opt/lesson/data/redis/`，属于"丢了可重建"的数据（在线态 + 限流计数），  
不进备份范围，但**重启 Redis 前须知：在课学生会全部被判掉线**（判掉线 → 可能触发自动结课）。

### 10.3 开机自启

`restart: unless-stopped` 已覆盖 docker 启动后的拉起；前提是 docker 本身开机自启：

```bash
sudo systemctl is-enabled docker     # → enabled
```

### 10.4 运行时参数调整

`-Xmx` 之类写在 `/etc/lesson/*.env` 的 `JAVA_OPTS`（env 文件优先级高于镜像 ENV）。  
改完 `docker compose up -d --no-deps booking` 生效，不需要重新构建镜像。

容器内存限额目前**没设**（host 网络 + 无 `mem_limit`），JVM 看到的是宿主机全部内存。  
若要设：compose 里加 `mem_limit: 1g`，同时把 `JAVA_OPTS` 改成  
`-XX:InitialRAMPercentage=40 -XX:MaxRAMPercentage=70`，别再写死 `-Xmx512m`  
（写死了容器限额就是摆设）。

### 10.5 回到 systemd（逃生路径）

Docker 层出问题、短时间修不好时，旧 unit 还在：

```bash
cd /opt/lesson/docker && sudo docker compose down
sudo systemctl enable --now booking message-service classroom-service
sudo systemctl status booking
```

jar 还在 `/opt/lesson/*.jar`，env 还在 `/etc/lesson/`。**这就是不删旧目录的价值。**

---

## 十一、与仓库其它文档的关系

| 文档                                                  | 关系                                                     |
| --------------------------------------------------- | ------------------------------------------------------ |
| `deploy/README.md`                                  | 部署资产总清单（sql / nginx / logrotate / backup.sh 都在那）       |
| `deploy/upload-to-server.sh`                        | systemd 路径的上传脚本；容器化后只用它传 sql/nginx/logrotate/backup.sh |
| `doc-develop/04-部署与运维/000 云服务器部署配置核对清单-20261013.md` | 首次上云的逐项核对，容器化后第四节（后端）以本文为准                             |
| `doc-develop/08-电子课堂/电子课堂-系统维护说明.md`                | 课堂业务侧维护（3.8 课堂开关、4.4 备份）                               |

---

## 附：文件清单

| 文件                   | 在哪跑 | 作用                                       |
| -------------------- | --- | ---------------------------------------- |
| `Dockerfile`         | -   | 三服务通用镜像（信任库 / 非 root / 时区 / healthcheck） |
| `docker-compose.yml` | 服务器 | 编排（host 网络、挂载、healthcheck、Redis）         |
| `env.example`        | 服务器 | `.env` 模板（版本清单 + uid + 上传目录）             |
| `install-docker.sh`  | 服务器 | 装 Docker CE + compose v2 + daemon.json   |
| `build-images.sh`    | 开发机 | 构建三个镜像，tag = `<版本>-<sha>`                |
| `release.sh`         | 开发机 | 一键：构建 → 打包 → 传输 → load → 切版本 → 发前端       |
| `switch.sh`          | 服务器 | 切版本 + 健康检查 + 失败自动回滚（前后端通用）               |
| `rollback.sh`        | 服务器 | 从 `releases.log` 推上一版并回滚                 |
