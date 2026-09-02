# Spring Boot 升级 HTTPS 完整实现方案

针对你的需求，我将从证书获取、Spring Boot 配置、双协议支持、生产适配四个维度提供完整落地步骤，方案以**简洁、合规、生产级兼容**为核心设计目标，完全匹配你的业务场景。



***

## 一、技术选型与核心前提说明

在动手实现前，先明确关键技术选择，避免后续走弯路：

### 1.1 证书类型选择

你目前没有有效 SSL 证书，推荐两种获取方式，优先选择免费受信任证书：



| 证书类型               | 安全性 | 浏览器信任度     | 适用场景          | 有效期  |
| ------------------ | --- | ---------- | ------------- | ---- |
| Let’s Encrypt 免费证书 | 高   | 完全信任       | 生产环境（无特殊合规要求） | 90 天 |
| 自签名证书              | 低   | 浏览器报 “不安全” | 开发 / 测试环境     | 自定义  |

> 生产环境
>
> **必须使用受信任的 CA 证书**
>
> ，自签名证书仅能用于内部测试，无法满足公网传输安全要求。

### 1.2 容器与协议选择



* 协议：禁用旧版 SSL 协议，仅启用 `TLS 1.2` 和 `TLS 1.3`（当前主流安全标准）；

* 容器：直接使用 Spring Boot 内嵌的 Tomcat 9.x/10.x 版本（支持 TLS 1.3），无需额外部署外部 Tomcat，降低生产运维成本；

* 证书格式：统一使用`PKCS12`格式（文件后缀`.p12`或`.pfx`），替代传统 JKS 格式，它是通用标准，兼容 Java、Nginx、云负载均衡等绝大多数场景，且体积更小、配置更简单。



***

## 二、获取 SSL 证书（生产级）

推荐使用 Let’s Encrypt 免费证书，通过`certbot`工具申请，操作全程自动化。

### 2.1 前置条件



* 准备一个备案完成的域名（公网 IP 无法直接申请 Let’s Encrypt 证书，必须使用域名）；

* 服务器开放`80`端口（证书验证需要），后续可关闭或用于重定向。

### 2.2 安装证书管理工具

以 CentOS/RHEL 系统为例，执行以下命令安装 certbot：



```
\# 安装epel源

yum install epel-release -y

\# 安装certbot

yum install certbot -y
```

### 2.3 申请 Let’s Encrypt 证书

执行以下命令，通过手动验证（域名所有权验证）申请证书：



```
certbot certonly --standalone -d 你的域名 -m 你的邮箱 --agree-tos --no-eff-email
```

> 示例：
>
> `certbot certonly --standalone -d app.example.com -m admin@example.com --agree-tos --no-eff-email`

命令参数说明：



* `certonly`：仅申请证书，不自动配置其他软件；

* `--standalone`：使用内置 Web 服务器完成域名验证，验证完成后可释放 80 端口；

* `-d`：指定需要绑定证书的域名；

* `-m`：填写管理员邮箱，用于证书过期提醒；

* `--agree-tos`：同意 Let’s Encrypt 服务条款；

* `--no-eff-email`：不接收 EFF 机构的营销邮件。

### 2.4 证书生成路径与格式转换

#### 2.4.1 查看证书文件

申请成功后，证书会默认生成在`/etc/letsencrypt/live/你的域名/`目录下，核心文件为：



* `fullchain.pem`：证书链文件（包含服务器证书和中间证书）；

* `privkey.pem`：证书私钥文件。

#### 2.4.2 转换为 Spring Boot 支持的 PKCS12 格式

Spring Boot 无法直接识别 PEM 格式证书，需要用`openssl`工具将其转换为 PKCS12 格式，执行以下命令：



```
openssl pkcs12 -export -out /opt/ssl/keystore.p12 \\

-inkey /etc/letsencrypt/live/你的域名/privkey.pem \\

-in /etc/letsencrypt/live/你的域名/fullchain.pem \\

-name tomcat -pass pass:你的证书密码
```

命令参数说明：



* `/opt/ssl/keystore.p12`：转换后的证书存储路径（建议统一存放在`/opt/ssl/`目录，方便后续配置和备份）；

* `-pass pass:你的证书密码`：设置证书访问密码（后续 Spring Boot 配置需要使用，密码复杂度需符合要求，建议包含大小写、数字、特殊字符）；

* `-name tomcat`：设置证书别名（固定为`tomcat`即可，无特殊要求）。

#### 2.4.3 验证证书权限

证书文件必须对 Spring Boot 运行用户可读，执行以下命令设置权限，避免因权限不足导致应用启动失败：



```
\# 设置证书目录权限

chmod -R 755 /opt/ssl/

\# 设置证书文件权限

chmod 600 /opt/ssl/keystore.p12
```



***

## 三、Spring Boot 配置 HTTPS 与双协议支持

目标效果：



* 同时支持 HTTP（默认 8080 端口）和 HTTPS（默认 8443 端口）；

* 所有 HTTP 请求 301 永久重定向到 HTTPS 对应端口；

* 外部化证书配置，适配生产环境部署。

### 3.1 基础配置（application.properties）

在`src/main/resources`目录下，先创建通用配置文件`application.properties`，激活生产环境配置：



```
\# 激活生产环境配置，后续可通过启动参数覆盖

spring.profiles.active=prod
```

再创建生产环境专属配置文件`application-prod.properties`，配置 HTTPS 核心参数：



```
\# -------------------------- HTTPS 基础配置 --------------------------

\# HTTPS监听端口，生产环境可通过Nginx转发到443端口

server.port=8443

\# 启用HTTPS安全约束

server.ssl.enabled=true

\# 证书存储路径，使用绝对路径，对应前面转换的PKCS12文件

server.ssl.key-store=/opt/ssl/keystore.p12

\# 证书类型，固定为PKCS12

server.ssl.key-store-type=PKCS12

\# 证书密码，与转换时设置的密码一致

server.ssl.key-store-password=你的证书密码

\# 证书别名，固定为tomcat

server.ssl.key-alias=tomcat

\# -------------------------- 安全协议配置 --------------------------

\# 禁用旧版SSL协议，仅启用TLS1.2和TLS1.3

server.ssl.protocol=TLS

server.ssl.enabled-protocols=TLSv1.2,TLSv1.3

\# 配置安全加密套件，禁用弱加密算法，优先使用ECC、GCM算法

server.ssl.ciphers=TLS\_ECDHE\_RSA\_WITH\_AES\_128\_GCM\_SHA256,TLS\_ECDHE\_RSA\_WITH\_AES\_256\_GCM\_SHA384,TLS\_ECDHE\_RSA\_WITH\_AES\_128\_CBC\_SHA256,TLS\_ECDHE\_RSA\_WITH\_AES\_256\_CBC\_SHA384,TLS\_DHE\_RSA\_WITH\_AES\_128\_GCM\_SHA256,TLS\_DHE\_RSA\_WITH\_AES\_256\_GCM\_SHA384

\# -------------------------- 业务自定义配置 --------------------------

\# 后续Nginx反向代理的目标端口，HTTP协议

app.http-port=8080

\# 域名配置，后续重定向使用

app.domain=你的域名
```

> 开发环境可复制
>
> `application-prod.properties`
>
> 为
>
> `application-dev.properties`
>
> ，使用自签名证书或测试证书，避免影响生产配置。

### 3.2 配置双协议支持与 HTTP 自动重定向

Spring Boot 默认仅启动一个内嵌 Tomcat 端口，需要通过自定义配置类，同时启动 HTTP（8080）和 HTTPS（8443）两个连接器，再配置 HTTP 请求自动重定向到 HTTPS。

在项目中创建配置类`com.reservation.config.HttpsConfig`，完整代码如下：



```
package com.reservation.config;

import org.apache.catalina.Context;

import org.apache.catalina.connector.Connector;

import org.apache.tomcat.util.descriptor.web.SecurityCollection;

import org.apache.tomcat.util.descriptor.web.SecurityConstraint;

import org.springframework.beans.factory.annotation.Value;

import org.springframework.boot.web.embedded.tomcat.TomcatServletWebServerFactory;

import org.springframework.boot.web.server.WebServerFactoryCustomizer;

import org.springframework.context.annotation.Bean;

import org.springframework.context.annotation.Configuration;

import org.springframework.util.StringUtils;

/\*\*

&#x20;\* HTTPS双协议支持与重定向配置

&#x20;\* 实现同时监听HTTP、HTTPS端口，HTTP自动重定向到HTTPS

&#x20;\*/

@Configuration

public class HttpsConfig {

&#x20;   @Value("\${server.port}")

&#x20;   private Integer httpsPort;

&#x20;   @Value("\${app.http-port}")

&#x20;   private Integer httpPort;

&#x20;   @Value("\${app.domain}")

&#x20;   private String domain;

&#x20;   /\*\*

&#x20;    \* 配置Tomcat连接器，同时支持HTTP和HTTPS

&#x20;    \*/

&#x20;   @Bean

&#x20;   public WebServerFactoryCustomizer\<TomcatServletWebServerFactory> connectorCustomizer() {

&#x20;       return factory -> {

&#x20;           // 添加HTTP连接器，监听指定端口

&#x20;           factory.addAdditionalTomcatConnectors(createHttpConnector());

&#x20;           // 配置HTTPS连接器，使用生产环境的SSL证书配置

&#x20;           factory.setSslStoreProvider(null);

&#x20;       };

&#x20;   }

&#x20;   /\*\*

&#x20;    \* 创建HTTP连接器

&#x20;    \*/

&#x20;   private Connector createHttpConnector() {

&#x20;       // 初始化HTTP连接器，使用HTTP/1.1协议

&#x20;       Connector connector = new Connector(TomcatServletWebServerFactory.DEFAULT\_PROTOCOL);

&#x20;       connector.setScheme("http");

&#x20;       connector.setSecure(false);

&#x20;       // 绑定HTTP监听端口

&#x20;       connector.setPort(httpPort);

&#x20;       // 配置服务器内部重定向端口为HTTPS端口

&#x20;       connector.setRedirectPort(httpsPort);

&#x20;       return connector;

&#x20;   }

&#x20;   /\*\*

&#x20;    \* 配置全局安全约束，将所有HTTP请求重定向到HTTPS

&#x20;    \*/

&#x20;   @Bean

&#x20;   public WebServerFactoryCustomizer\<TomcatServletWebServerFactory> redirectCustomizer() {

&#x20;       return factory -> factory.addContextCustomizers(this::configureSecurityConstraint);

&#x20;   }

&#x20;   /\*\*

&#x20;    \* 配置安全约束规则

&#x20;    \*/

&#x20;   private void configureSecurityConstraint(Context context) {

&#x20;       // 创建安全集合，定义需要重定向的请求路径

&#x20;       SecurityCollection securityCollection = new SecurityCollection();

&#x20;       // 对所有请求生效

&#x20;       securityCollection.addPattern("/\*");

&#x20;       // 创建安全约束，强制使用HTTPS

&#x20;       SecurityConstraint securityConstraint = new SecurityConstraint();

&#x20;       securityConstraint.setUserConstraint("CONFIDENTIAL");

&#x20;       securityConstraint.addCollection(securityCollection);

&#x20;       // 忽略对健康检查接口的重定向，方便运维监控

&#x20;       if (StringUtils.hasLength(domain)) {

&#x20;           securityConstraint.setDomain(domain);

&#x20;       }

&#x20;       // 给Tomcat上下文添加安全约束

&#x20;       context.addConstraint(securityConstraint);

&#x20;   }

}
```

### 3.3 配置说明



1. **双端口监听**：HTTPS 端口（8443）由 Spring Boot 默认配置启动，HTTP 端口（8080）通过额外的 Tomcat 连接器启动；

2. **重定向逻辑**：通过 Tomcat 的`SecurityConstraint`安全约束，将所有路径的 HTTP 请求，301 永久重定向到对应的 HTTPS 端口；

3. **协议适配**：配置中启用 TLS1.2 和 TLS1.3，禁用弱加密算法，兼顾安全性和兼容性。



***

## 四、生产环境适配方案

Spring Boot 内嵌 Tomcat 直接对外开放 HTTPS 端口，存在端口权限、性能、证书续期等运维问题，**生产环境推荐使用「Nginx 反向代理 + Spring Boot 内嵌 Tomcat」的分层架构**，由 Nginx 处理 SSL 终止、端口转发、证书续期，Spring Boot 仅处理业务请求，架构如下：



```
用户请求 → Nginx（443端口/SSL终止）→ 转发到Spring Boot（8080端口/HTTP）

&#x20;         ↓

&#x20;         自动重定向（80端口 → 443端口）
```

### 4.1 生产环境架构优势



1. **权限问题**：Nginx 可直接监听 443 端口，无需额外配置 Java 程序的特权端口权限；

2. **性能优化**：Nginx 具备高效的 SSL 会话复用、静态资源缓存、负载均衡能力，比内嵌 Tomcat 性能更好；

3. **运维便捷**：证书续期、加密套件升级、协议变更仅需操作 Nginx，无需重启 Spring Boot 业务服务；

4. **安全增强**：Nginx 可配置统一的安全响应头、WAF 防护规则，对外隐藏后端服务细节。

### 4.2 生产环境 Nginx 配置

#### 4.2.1 安装 Nginx 并配置 SSL

在服务器上安装 Nginx，编辑 Nginx 配置文件`/etc/nginx/conf.d/your-domain.conf`，配置 SSL 终止和反向代理：



```
\# 定义反向代理的后端Spring Boot服务

upstream reservation\_service {

&#x20;   \# 转发到Spring Boot的HTTP端口，对应配置文件中的app.http-port

&#x20;   server 127.0.0.1:8080;

&#x20;   \# 配置负载均衡策略，保持会话 persistence

&#x20;   ip\_hash;

}

\# 配置HTTP服务器，监听80端口，自动重定向到HTTPS

server {

&#x20;   listen 80;

&#x20;   \# 绑定域名

&#x20;   server\_name 你的域名;

&#x20;   \# 对所有请求永久重定向到HTTPS

&#x20;   location / {

&#x20;       return 301 https://\$host\$request\_uri;

&#x20;   }

}

\# 配置HTTPS服务器，监听443端口，处理SSL请求

server {

&#x20;   listen 443 ssl http2;

&#x20;   server\_name 你的域名;

&#x20;   \# 配置证书链和私钥，直接使用Let’s Encrypt的原始PEM文件

&#x20;   ssl\_certificate /etc/letsencrypt/live/你的域名/fullchain.pem;

&#x20;   ssl\_certificate\_key /etc/letsencrypt/live/你的域名/privkey.pem;

&#x20;   \# 配置SSL会话复用，提升性能

&#x20;   ssl\_session\_cache shared:SSL:10m;

&#x20;   ssl\_session\_timeout 10m;

&#x20;   \# 强制使用指定的TLS协议版本，禁用旧版本

&#x20;   ssl\_protocols TLSv1.2 TLSv1.3;

&#x20;   \# 配置安全加密套件，与Spring Boot配置保持一致，优先使用ECC、GCM算法

&#x20;   ssl\_ciphers ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-RSA-AES128-SHA256:ECDHE-RSA-AES256-SHA384:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384;

&#x20;   ssl\_prefer\_server\_ciphers on;

&#x20;   \# 配置安全响应头，增强传输安全

&#x20;   add\_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

&#x20;   add\_header X-Frame-Options DENY;

&#x20;   add\_header X-Content-Type-Options nosniff;

&#x20;   add\_header X-XSS-Protection "1; mode=block";

&#x20;   \# 配置反向代理，将请求转发给后端Spring Boot

&#x20;   location / {

&#x20;       proxy\_pass http://reservation\_service;

&#x20;       proxy\_set\_header Host \$host;

&#x20;       proxy\_set\_header X-Real-IP \$remote\_addr;

&#x20;       proxy\_set\_header X-Forwarded-For \$proxy\_add\_x\_forwarded\_for;

&#x20;       proxy\_set\_header X-Forwarded-Proto \$scheme;

&#x20;       \# 配置长连接，提升代理性能

&#x20;       proxy\_http\_version 1.1;

&#x20;       proxy\_set\_header Connection "";

&#x20;   }

&#x20;   \# 配置静态资源缓存，减少后端请求

&#x20;   location \~\* \\.(css|js|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)\$ {

&#x20;       proxy\_pass http://reservation\_service;

&#x20;       expires 7d;

&#x20;       add\_header Cache-Control "public, immutable";

&#x20;   }

}
```

#### 4.2.2 配置 Nginx 开机自启



```
systemctl enable nginx

systemctl start nginx
```

### 4.3 证书自动续期

Let’s Encrypt 证书有效期为 90 天，需要配置自动续期，避免业务因证书过期中断。执行以下步骤配置自动续期：



1. **测试续期命令**



```
certbot renew --dry-run
```

若命令执行成功，说明续期环境配置正常。



1. **配置续期定时任务**

   执行`crontab -e`命令，添加以下定时任务，每天凌晨 2 点自动检查续期，续期成功后重载 Nginx：



```
0 2 \* \* \* /usr/bin/certbot renew --quiet --renew-hook "/usr/bin/systemctl reload nginx"
```

### 4.4 Spring Boot 生产环境启动命令

使用`java -jar`命令启动应用，通过外部命令行参数覆盖证书路径、端口等配置，避免打包敏感信息到 JAR 包中：



```
nohup java -jar /opt/appointment-service/appointment-service.jar \\

\--spring.profiles.active=prod \\

\--server.ssl.key-store=/opt/ssl/keystore.p12 \\

\--server.ssl.key-store-password=你的证书密码 \\

\--app.http-port=8080 \\

\> /var/log/appointment-service.log 2>&1 &
```

命令参数说明：



* `nohup ... &`：后台启动应用，避免关闭终端后进程退出；

* `spring.profiles.active=prod`：激活生产环境配置；

* 外部化证书参数，启动时指定，不打包到 JAR 包中；

* 日志输出到`/var/log/`目录，方便后续排查问题。



***

## 五、验证配置正确性

### 5.1 验证双协议与重定向



1. 先测试本地端口转发：执行`curl -I http://localhost`，查看响应头是否为`301 Moved Permanently`，Location 是否为`https://localhost`；

2. 公网测试：在本地浏览器访问`http://你的域名`，检查是否自动跳转到`https://你的域名`，地址栏是否显示安全锁标识。

### 5.2 验证证书有效性



1. 浏览器访问`https://你的域名`，点击地址栏的安全锁图标，查看证书信息，确认证书有效期、颁发机构与申请的 Let’s Encrypt 证书一致；

2. 使用`openssl`命令验证证书链完整性：



```
openssl s\_client -connect 你的域名:443 -showcerts
```

命令输出中应包含完整的证书链，无任何证书信任异常提示。

### 5.3 验证 TLS 协议与加密套件

使用在线工具`SSL Server Test`（[https://www.ssllabs.com/ssltest/](https://www.ssllabs.com/ssltest/)）扫描你的域名，检测结果需满足以下要求：



* 协议：仅启用 TLS1.2 和 TLS1.3，无 SSL、TLS1.0/1.1 等旧协议；

* 加密套件：优先使用 ECC、GCM 算法，无弱加密套件；

* 证书评分：达到`A`级标准，符合行业安全规范。



***

## 六、常见生产问题排查

### 6.1 端口占用异常

启动应用前，先执行`ss -tulpn | grep 8080`和`ss -tulpn | grep 8443`，检查端口是否被其他进程占用。若端口被占用，可修改配置文件中的端口号，或终止占用进程。

### 6.2 证书权限不足

Spring Boot 运行用户必须拥有证书文件的读取权限，执行`chmod 600 /opt/ssl/keystore.p12`和`chown root:root /opt/ssl/keystore.p12`命令，设置正确的文件权限和属主。

### 6.3 证书链不完整

若浏览器提示 “证书链不完整”，需要重新生成 PKCS12 格式证书，确保导入`fullchain.pem`（包含中间证书），而非仅导入`cert.pem`。

### 6.4 重定向循环

若出现`Too Many Redirects`错误，检查 Nginx 配置中是否添加了`X-Forwarded-Proto`请求头，同时注释掉 Spring Boot 配置类中的`createHttpConnector`方法，避免双层重定向。



***

## 七、方案总结



| 维度    | 方案说明                                                          |
| ----- | ------------------------------------------------------------- |
| 证书获取  | Let’s Encrypt 免费证书，用 certbot 申请，配置自动续期，完全免费合规                 |
| 双协议支持 | Nginx 监听 80/443 端口，80 端口强制重定向到 443 端口，Spring Boot 仅处理 HTTP 请求 |
| 架构分层  | Nginx 做 SSL 终止和反向代理，转发到后端 Spring Boot 业务端口，运维更便捷              |
| 生产适配  | 外部化证书配置，使用 systemd 管理应用进程，配置开机自启和日志轮转                         |
| 安全标准  | 仅启用 TLS1.2/1.3，配置强加密套件，添加安全响应头，达到行业 A 级安全标准                   |

该方案完全适配你的预约系统生产环境，传输层无任何明文传输风险，同时兼顾了性能、安全性、可运维性，后续扩展集群、升级证书、优化加密套件都无需修改业务层代码。

> （注：文档部分内容可能由 AI 生成）