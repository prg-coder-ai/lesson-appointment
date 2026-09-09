# Spring Boot 项目工程化方案合集

# Spring Boot 项目工程化方案合集

本文档合并两项核心工程化方案：**敏感字段 AES 加密存储方案** 与 **前端 CDN 依赖本地化打包方案**，可直接用于 Spring Boot 项目落地实施。

---

## 一、AES\-256\-GCM 敏感字符串加密存储与检索方案

### 1\. 技术选型与核心原理

采用 **AES\-256\-GCM** 标准认证加密算法，同时提供机密性与数据完整性校验，依托 CPU AES\-NI 硬件指令实现亚毫秒级加解密性能。

- **算法标准**：AES（高级加密标准），NIST 全球通用标准

- **密钥长度**：256 位（32 字节），金融级安全强度

- **工作模式**：GCM（伽罗瓦 / 计数器模式），自带认证标签，防数据篡改

- **存储格式**：`[12字节随机IV] + [16字节认证标签] + [密文]`，Base64URL 编码后入库

### 2\. 核心工具类实现

基于 JDK 原生 `javax.crypto` 实现，无第三方依赖，通过 `ThreadLocal` 缓存 Cipher 对象提升性能。

```java
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import javax.crypto.Cipher;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Base64;

public class AesGcmCryptoUtil {
    private static final Logger log = LoggerFactory.getLogger(AesGcmCryptoUtil.class);
    
    private static final String CIPHER_ALGORITHM = "AES/GCM/NoPadding";
    private static final int GCM_IV_LENGTH = 12;
    private static final int GCM_TAG_LENGTH = 16;
    private static final int GCM_TAG_LENGTH_BITS = GCM_TAG_LENGTH * 8;
    
    private static final ThreadLocal<Cipher> CIPHER_CACHE = ThreadLocal.withInitial(() -> {
        try {
            return Cipher.getInstance(CIPHER_ALGORITHM);
        } catch (Exception e) {
            log.error("初始化AES-GCM Cipher实例失败", e);
            throw new IllegalStateException("AES算法初始化失败", e);
        }
    });
    
    private static final SecureRandom SECURE_RANDOM = new SecureRandom();

    public static String encrypt(String plaintext, String base64Key) {
        if (plaintext == null || plaintext.isEmpty()) {
            return plaintext;
        }
        try {
            SecretKey secretKey = decodeSecretKey(base64Key);
            byte[] iv = new byte[GCM_IV_LENGTH];
            SECURE_RANDOM.nextBytes(iv);
            
            Cipher cipher = CIPHER_CACHE.get();
            GCMParameterSpec gcmSpec = new GCMParameterSpec(GCM_TAG_LENGTH_BITS, iv);
            cipher.init(Cipher.ENCRYPT_MODE, secretKey, gcmSpec);
            
            byte[] cipherTextWithTag = cipher.doFinal(plaintext.getBytes(StandardCharsets.UTF_8));
            byte[] encryptedData = ByteBuffer.allocate(GCM_IV_LENGTH + cipherTextWithTag.length)
                    .put(iv)
                    .put(cipherTextWithTag)
                    .array();
            
            return Base64.getUrlEncoder().encodeToString(encryptedData);
        } catch (Exception e) {
            log.error("AES-GCM加密数据失败", e);
            throw new CryptoBusinessException("数据加密失败", e);
        }
    }

    public static String decrypt(String encryptedText, String base64Key) {
        if (encryptedText == null || encryptedText.isEmpty()) {
            return encryptedText;
        }
        try {
            byte[] encryptedData = Base64.getUrlDecoder().decode(encryptedText);
            ByteBuffer byteBuffer = ByteBuffer.wrap(encryptedData);
            
            byte[] iv = new byte[GCM_IV_LENGTH];
            byteBuffer.get(iv);
            byte[] cipherTextWithTag = new byte[byteBuffer.remaining()];
            byteBuffer.get(cipherTextWithTag);
            
            SecretKey secretKey = decodeSecretKey(base64Key);
            Cipher cipher = CIPHER_CACHE.get();
            GCMParameterSpec gcmSpec = new GCMParameterSpec(GCM_TAG_LENGTH_BITS, iv);
            cipher.init(Cipher.DECRYPT_MODE, secretKey, gcmSpec);
            
            byte[] plaintextBytes = cipher.doFinal(cipherTextWithTag);
            return new String(plaintextBytes, StandardCharsets.UTF_8);
        } catch (Exception e) {
            log.error("AES-GCM解密数据失败，密钥不匹配或数据被篡改", e);
            throw new CryptoBusinessException("数据解密失败", e);
        }
    }

    private static SecretKey decodeSecretKey(String base64Key) {
        byte[] keyBytes = Base64.getDecoder().decode(base64Key);
        if (keyBytes.length != 32) {
            throw new IllegalArgumentException("AES-256密钥长度必须为32字节");
        }
        return new SecretKeySpec(keyBytes, "AES");
    }

    public static class CryptoBusinessException extends RuntimeException {
        public CryptoBusinessException(String message, Throwable cause) {
            super(message, cause);
        }
    }
}
```

### 3\. MyBatis 自动加解密拦截

通过自定义 `TypeHandler` \+ 注解，实现敏感字段写入自动加密、读取自动解密，对业务代码无侵入。

#### 3\.1 敏感字段注解

```java
import java.lang.annotation.*;

@Target(ElementType.FIELD)
@Retention(RetentionPolicy.RUNTIME)
public @interface Encrypted {
    KeyType value() default KeyType.DEFAULT;
    int keyVersion() default 1;

    enum KeyType {
        DEFAULT,
        USER_PHONE,
        USER_ID_CARD,
        USER_BANK_CARD
    }
}
```

#### 3\.2 加密 TypeHandler

```java
import org.apache.ibatis.type.BaseTypeHandler;
import org.apache.ibatis.type.JdbcType;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import java.sql.*;

@Component
public class EncryptTypeHandler extends BaseTypeHandler<String> {

    @Value("${app.aes-gcm.secret}")
    private String aesSecret;

    @Override
    public void setNonNullParameter(PreparedStatement ps, int i, String parameter, JdbcType jdbcType) throws SQLException {
        if (parameter == null || parameter.isEmpty()) {
            ps.setString(i, parameter);
            return;
        }
        try {
            ps.setString(i, AesGcmCryptoUtil.encrypt(parameter, aesSecret));
        } catch (Exception e) {
            throw new SQLException("敏感字段加密失败", e);
        }
    }

    @Override
    public String getNullableResult(ResultSet rs, String columnName) throws SQLException {
        return decryptValue(rs.getString(columnName));
    }

    @Override
    public String getNullableResult(ResultSet rs, int columnIndex) throws SQLException {
        return decryptValue(rs.getString(columnIndex));
    }

    @Override
    public String getNullableResult(CallableStatement cs, int columnIndex) throws SQLException {
        return decryptValue(cs.getString(columnIndex));
    }

    private String decryptValue(String encryptedValue) {
        if (encryptedValue == null || encryptedValue.isEmpty()) {
            return encryptedValue;
        }
        return AesGcmCryptoUtil.decrypt(encryptedValue, aesSecret);
    }
}
```

### 4\. 配置文件（application\.yml）

```yaml
app:
  aes-gcm:
    enabled: true
    secret: ${AES_GCM_SECRET:}  # 从环境变量注入密钥，禁止硬编码
    version: 1

mybatis-plus:
  configuration:
    map-underscore-to-camel-case: true
    type-handlers-package: com.yourpackage.encryptor
  type-aliases-package: com.yourpackage.entity
```

### 5\. 加密数据检索方案

- **精确查询**：查询关键词先加密，再用密文等值匹配数据库，可正常走索引

- **模糊查询**：采用分片 HMAC 索引方案，额外维护索引表，通过指纹匹配实现模糊检索

### 6\. 生产性能与安全建议

1. **JVM 硬件加速**：启动参数添加 `-XX:+UseAES -XX:+UseGHASHIntrinsics`

2. **密钥管理**：生产环境通过 KMS / 配置中心注入密钥，支持密钥版本轮换

3. **字段长度**：数据库敏感字段设置为 `VARCHAR(512)`，容纳加密后膨胀

4. **日志规范**：异常日志禁止输出密钥、明文、密文等敏感信息

---

## 二、前端 CDN 依赖本地化打包方案（frontend\-maven\-plugin）

### 1\. 方案目标

执行 `mvn clean package` 即可自动下载 axios、FullCalendar 等前端资源，复制到 Spring Boot 静态目录，最终打入 Jar 包，完全脱离外网 CDN。

### 2\. 目录结构

```Plain Text
项目根目录
├─ pom.xml
├─ package.json
└─ src
    └─ main
        ├─ java
        └─ resources
            └─ static  # 前端资源自动复制到此处
```

### 3\. 步骤 1：创建 package\.json

项目根目录新建 `package.json`，锁定版本并内置跨系统复制脚本。

```json
{
  "name": "springboot-static-lib",
  "version": "1.0.0",
  "private": true,
  "dependencies": {
    "axios": "^1.7.9",
    "@fullcalendar/core": "6.1.10",
    "@fullcalendar/daygrid": "6.1.10",
    "@fullcalendar/interaction": "6.1.10"
  },
  "scripts": {
    "copy:win": "if not exist src\\main\\resources\\static\\lib md src\\main\\resources\\static\\lib && xcopy /E /Y node_modules\\axios\\dist src\\main\\resources\\static\\lib\\axios && xcopy /E /Y node_modules\\@fullcalendar src\\main\\resources\\static\\lib\\fullcalendar",
    "copy:linux": "mkdir -p src/main/resources/static/lib && cp -r node_modules/axios/dist src/main/resources/static/lib/axios && cp -r node_modules/@fullcalendar src/main/resources/static/lib/fullcalendar"
  }
}
```

### 4\. 步骤 2：pom\.xml 添加插件

在 `pom.xml` 的 `<build><plugins>` 中添加 `frontend-maven-plugin`，保留原有 Spring Boot 打包插件。

```xml
<build>
    <plugins>
        <!-- 原有 Spring Boot 打包插件 -->
        <plugin>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-maven-plugin</artifactId>
        </plugin>

        <!-- 前端资源自动下载插件 -->
        <plugin>
            <groupId>com.github.eirslett</groupId>
            <artifactId>frontend-maven-plugin</artifactId>
            <version>1.13.4</version>
            <configuration>
                <workingDirectory>${project.basedir}</workingDirectory>
                <installDirectory>${project.basedir}/.node</installDirectory>
                <!-- 国内镜像加速，可选 -->
                <nodeDownloadRoot>https://npmmirror.com/mirrors/node/</nodeDownloadRoot>
            </configuration>
            <executions>
                <!-- 自动下载安装 Node.js，无需本机预装 -->
                <execution>
                    <id>install-node-npm</id>
                    <goals>
                        <goal>install-node-and-npm</goal>
                    </goals>
                    <configuration>
                        <nodeVersion>v20.17.0</nodeVersion>
                    </configuration>
                </execution>
                <!-- 执行 npm install 下载依赖 -->
                <execution>
                    <id>npm-install</id>
                    <goals>
                        <goal>npm</goal>
                    </goals>
                    <configuration>
                        <arguments>install</arguments>
                    </configuration>
                </execution>
                <!-- Windows 环境复制资源，本机开发使用 -->
                <execution>
                    <id>copy-lib-windows</id>
                    <goals>
                        <goal>npm</goal>
                    </goals>
                    <configuration>
                        <arguments>run copy:win</arguments>
                    </configuration>
                </execution>
            </executions>
        </plugin>
    </plugins>
</build>
```

### 5\. 步骤 3：配置 Git 忽略

在 `.gitignore` 中添加缓存目录，避免提交到代码仓库。

```gitignore
# frontend-maven-plugin 缓存
node_modules/
.node/
npm-debug.log
package-lock.json
```

### 6\. 步骤 4：执行打包

项目根目录打开终端执行：

```bash
mvn clean package
```

执行流程：

1. 自动下载并安装 Node\.js 到 `.node` 目录

2. 执行 `npm install` 下载前端依赖到 `node_modules`

3. 运行复制脚本，将资源拷贝到 `src/main/resources/static/lib/`

4. Spring Boot 插件将静态资源打入最终 Jar 包

### 7\. 步骤 5：页面替换本地引用

```html
<!-- Axios -->
<script src="/lib/axios/axios.min.js"></script>

<!-- FullCalendar -->
<link rel="stylesheet" href="/lib/fullcalendar/core/main.min.css">
<script src="/lib/fullcalendar/core/index.global.min.js"></script>
<script src="/lib/fullcalendar/daygrid/index.global.min.js"></script>
<script src="/lib/fullcalendar/interaction/index.global.min.js"></script>
```

### 8\. 进阶：一套 pom 自动兼容 Windows/Linux

通过 Maven Profile 自动识别操作系统，切换对应复制脚本。

```xml
<profiles>
    <profile>
        <id>build-win</id>
        <activation>
            <os><family>Windows</family></os>
        </activation>
        <build>
            <plugins>
                <plugin>
                    <groupId>com.github.eirslett</groupId>
                    <artifactId>frontend-maven-plugin</artifactId>
                    <version>1.13.4</version>
                    <executions>
                        <execution>
                            <id>copy-lib</id>
                            <goals><goal>npm</goal></goals>
                            <configuration><arguments>run copy:win</arguments></configuration>
                        </execution>
                    </executions>
                </plugin>
            </plugins>
        </build>
    </profile>
    <profile>
        <id>build-linux</id>
        <activation>
            <os><family>unix</family></os>
        </activation>
        <build>
            <plugins>
                <plugin>
                    <groupId>com.github.eirslett</groupId>
                    <artifactId>frontend-maven-plugin</artifactId>
                    <version>1.13.4</version>
                    <executions>
                        <execution>
                            <id>copy-lib</id>
                            <goals><goal>npm</goal></goals>
                            <configuration><arguments>run copy:linux</arguments></configuration>
                        </execution>
                    </executions>
                </plugin>
            </plugins>
        </build>
    </profile>
</profiles>
```

### 9\. 常见问题排查

1. **国内下载 Node 超时**：添加 `<nodeDownloadRoot>` 配置国内镜像

2. **Windows xcopy 报错**：使用 Git Bash 终端执行打包，或检查路径反斜杠

3. **Jar 包找不到静态资源**：解压 Jar 确认 `BOOT-INF/classes/static/lib` 目录存在文件

4. **Linux 权限报错**：执行 `chmod +x -R ./` 赋予项目目录执行权限

> （注：部分内容可能由 AI 生成）
