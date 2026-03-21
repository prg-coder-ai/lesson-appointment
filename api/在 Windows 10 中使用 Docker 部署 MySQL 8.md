在 Windows 10 中使用 Docker 部署 MySQL 8 与 Linux 核心逻辑一致，但需适配 Windows 系统的**路径规则、Docker Desktop 操作、权限配置**等特性。以下是分步详解，兼顾新手友好性和实用性，包含图形化操作和命令行两种方式。

### 一、前置准备（Windows 10 专属）
#### 1. 安装并配置 Docker Desktop
Windows 10 需满足以下条件：
- 系统版本：Windows 10 专业版/企业版（家庭版需开启 WSL2 兼容）；
- 启用 WSL2：Docker Desktop 依赖 WSL2 运行容器（替代传统 Hyper-V）。

安装步骤：
1. 下载 [Docker Desktop for Windows](https://www.docker.com/products/docker-desktop/)，双击安装包，勾选「Use WSL 2 instead of Hyper-V」；
2. 安装完成后启动 Docker Desktop，等待右下角图标变为「✅」（表示运行正常）；
3. 验证 Docker 是否可用：
   打开「Windows 终端/PowerShell/CMD」，执行：
   ```powershell
   docker --version  # 显示版本即正常
   docker info       # 查看Docker状态
   ```

#### 2. 拉取 MySQL 8 官方镜像
在终端执行以下命令拉取指定版本（避免 `latest` 版本漂移）：
```powershell
# 拉取 MySQL 8.4.3（稳定版，可替换为8.0.x）
docker pull mysql:8.4.3

# 验证镜像是否拉取成功
docker images | findstr mysql
```

### 二、方式1：图形化操作（Docker Desktop 界面，新手推荐）
#### 1. 创建本地挂载目录（持久化数据/配置）
Windows 路径建议用「非中文、无空格」的目录，例如：
- 数据目录：`D:\docker\mysql8\data`
- 配置目录：`D:\docker\mysql8\conf`
- 日志目录：`D:\docker\mysql8\log`

创建步骤：
1. 打开文件资源管理器，在 D 盘新建 `docker\mysql8` 文件夹，再分别创建 `data`、`conf`、`log` 子文件夹；
2. 在 `conf` 文件夹中新建 `my.cnf` 文件（记事本打开，粘贴以下配置）：
   ```ini
   [mysqld]
   port = 3306
   character-set-server = utf8mb4
   collation-server = utf8mb4_unicode_ci
   default-storage-engine = InnoDB
   innodb_buffer_pool_size = 256M
   max_connections = 1000
   [client]
   default-character-set = utf8mb4
   [mysql]
   default-character-set = utf8mb4
   ```

#### 2. 通过 Docker Desktop 启动 MySQL 容器
1. 打开 Docker Desktop，点击左侧「Images」，找到 `mysql:8.4.3`，点击「Run」；
2. 在「Optional settings」中配置核心参数（关键！）：
   | 配置项                | 取值/操作                                                                 |
   |-----------------------|--------------------------------------------------------------------------|
   | Container name        | 自定义名称（如 `mysql8-windows`）                                        |
   | Ports                 | 点击「Publish a new port」，填写 `3306`（主机）→ `3306`（容器）          |
   | Environment variables | 点击「Add environment variable」，添加：<br> `MYSQL_ROOT_PASSWORD=123456`（必填）<br> `TZ=Asia/Shanghai`（时区）<br> `MYSQL_ROOT_HOST=%`（允许远程连接） |
   | Volumes               | 点击「Add volume」，分别挂载：<br> 主机路径 `D:\docker\mysql8\data` → 容器路径 `/var/lib/mysql`（数据持久化）<br> 主机路径 `D:\docker\mysql8\conf\my.cnf` → 容器路径 `/etc/mysql/conf.d/my.cnf`（配置文件）<br> 主机路径 `D:\docker\mysql8\log` → 容器路径 `/var/log/mysql`（日志） |
3. 点击「Run」启动容器，Docker Desktop 会自动创建并运行容器。

### 三、方式2：命令行操作（PowerShell/CMD，高效）
#### 1. 创建本地挂载目录
在 PowerShell 中执行以下命令（自动创建目录）：
```powershell
# 创建目录（若手动创建可跳过）
mkdir -Force D:\docker\mysql8\data
mkdir -Force D:\docker\mysql8\conf
mkdir -Force D:\docker\mysql8\log

# 写入配置文件（替换为自己的路径）
@"
[mysqld]
port = 3306
character-set-server = utf8mb4
collation-server = utf8mb4_unicode_ci
default-storage-engine = InnoDB
innodb_buffer_pool_size = 256M
max_connections = 1000
[client]
default-character-set = utf8mb4
[mysql]
default-character-set = utf8mb4
"@ | Out-File -FilePath D:\docker\mysql8\conf\my.cnf -Encoding utf8
```

#### 2. 启动 MySQL 容器（核心命令）
在 PowerShell 中执行以下命令（注意 Windows 路径用 `/` 或转义 `\`）：
```powershell
docker run -d `
  --name mysql8-windows `  # 容器名称
  --restart=always `        # 开机自动启动
  -p 3306:3306 `            # 端口映射：主机3306 → 容器3306
  -v D:/docker/mysql8/data:/var/lib/mysql `  # 数据持久化（Windows路径用/）
  -v D:/docker/mysql8/conf/my.cnf:/etc/mysql/conf.d/my.cnf `  # 挂载配置
  -v D:/docker/mysql8/log:/var/log/mysql `  # 日志持久化
  -e MYSQL_ROOT_PASSWORD=123456 `  # root密码（必填）
  -e MYSQL_ROOT_HOST=% `           # 允许远程连接
  -e TZ=Asia/Shanghai `            # 同步北京时间
  mysql:8.4.3
```

### 三、验证 MySQL 8 实例是否正常
#### 1. 检查容器状态
- 图形化：打开 Docker Desktop → 左侧「Containers」，看到 `mysql8-windows` 状态为「Running」；
- 命令行：
  ```powershell
  # 查看运行中的容器
  docker ps | findstr mysql8-windows
  # 若启动失败，查看日志
  docker logs mysql8-windows
  ```

#### 2. 连接 MySQL 数据库
##### 方式1：Docker 容器内连接
```powershell
# 进入容器终端
docker exec -it mysql8-windows cmd

# 登录MySQL（输入密码123456）
mysql -uroot -p

# 验证配置（字符集应为utf8mb4）
show variables like '%character%';
```

##### 方式2：Windows 本地客户端连接（如 Navicat/MySQL Workbench）
连接参数：
- 主机：`127.0.0.1`（或本机IP）；
- 端口：`3306`；
- 用户名：`root`；
- 密码：`123456`。

### 四、Windows 10 专属问题与解决
#### 1. 路径挂载失败（最常见）
- 原因：Docker Desktop 未授权访问 Windows 本地磁盘；
- 解决：
  1. 打开 Docker Desktop → 设置（齿轮图标）→「Resources」→「File Sharing」；
  2. 添加本地目录（如 `D:\docker`），点击「Apply & Restart」；
  3. 重新启动容器。

#### 2. 端口被占用（3306 被本地 MySQL 占用）
- 解决：修改端口映射，如 `-p 3307:3306`（主机用3307端口连接）；
  ```powershell
  # 重新启动容器（修改端口）
  docker run -d `
    --name mysql8-windows `
    -p 3307:3306 `  # 主机3307 → 容器3306
    -v D:/docker/mysql8/data:/var/lib/mysql `
    -e MYSQL_ROOT_PASSWORD=123456 `
    mysql:8.4.3
  ```

#### 3. WSL2 相关错误
- 症状：Docker Desktop 启动失败，提示「WSL2 is not installed」；
- 解决：
  1. 以管理员身份打开 PowerShell，执行：
     ```powershell
     wsl --install  # 安装WSL2和Ubuntu子系统
     ```
  2. 重启电脑，重新启动 Docker Desktop。

#### 4. 中文乱码
- 原因：配置文件字符集未设为 `utf8mb4`（MySQL 中 `utf8` 是伪 UTF-8）；
- 解决：确保 `my.cnf` 中字符集配置为 `utf8mb4`，重启容器。

### 五、常用运维操作（Windows 命令行）
```powershell
# 停止容器
docker stop mysql8-windows

# 重启容器
docker restart mysql8-windows

# 删除容器（需先停止，数据卷已持久化，删除后不丢数据）
docker rm mysql8-windows

# 备份数据（复制本地挂载目录）
xcopy D:\docker\mysql8\data D:\docker\mysql8\data_backup /s /e
```

### 总结
1. Windows 10 部署 MySQL 8 核心步骤：安装 Docker Desktop → 配置磁盘共享 → 创建本地挂载目录 → 启动容器（指定密码/端口/配置）；
2. 关键坑点：路径挂载需授权磁盘访问、端口冲突需修改映射、字符集必须用 `utf8mb4`；
3. 两种操作方式：图形化（Docker Desktop）适合新手，命令行（PowerShell）高效，可按需选择。

在 MySQL 中批量创建数据表的核心思路是**将多个 `CREATE TABLE` 语句按语法规范组合执行**，可通过「直接执行 SQL 脚本」「存储过程循环创建」「动态 SQL 生成」三种方式实现，适配不同场景（如固定表结构、批量生成同构表、自定义表名/字段）。以下是详细步骤和示例，兼顾实用性和规范性。

### 一、基础方式：直接执行多表创建 SQL 脚本（最常用）
适用于**表结构固定、数量较少**的场景（如一次性创建10张以内的业务表），核心是将多个 `CREATE TABLE` 语句用分号分隔，一次性执行。

#### 1. 编写批量建表 SQL 脚本
新建 `batch_create_tables.sql` 文件（或直接在 MySQL 客户端中编写），示例如下（以「课时预约系统」为例，批量创建教师、学生、预约、课程4张表）：
```sql
-- 批量创建数据表（注意：每条CREATE TABLE后必须加分号）
-- 1. 教师表
CREATE TABLE IF NOT EXISTS teacher (
  id VARCHAR(32) NOT NULL COMMENT '教师ID',
  name VARCHAR(50) NOT NULL COMMENT '教师姓名',
  phone VARCHAR(20) UNIQUE COMMENT '手机号',
  subject VARCHAR(30) COMMENT '授课科目',
  create_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='教师信息表';

-- 2. 学生表
CREATE TABLE IF NOT EXISTS student (
  id VARCHAR(32) NOT NULL COMMENT '学生ID',
  name VARCHAR(50) NOT NULL COMMENT '学生姓名',
  grade VARCHAR(20) COMMENT '年级',
  class VARCHAR(20) COMMENT '班级',
  create_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  update_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='学生信息表';

-- 3. 课程表
CREATE TABLE IF NOT EXISTS course (
  id VARCHAR(32) NOT NULL COMMENT '课程ID',
  teacher_id VARCHAR(32) NOT NULL COMMENT '关联教师ID',
  course_name VARCHAR(100) NOT NULL COMMENT '课程名称',
  price DECIMAL(10,2) COMMENT '课程价格',
  create_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  FOREIGN KEY (teacher_id) REFERENCES teacher(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='课程信息表';

-- 4. 预约表
CREATE TABLE IF NOT EXISTS appointment (
  id INT AUTO_INCREMENT COMMENT '预约ID',
  course_id VARCHAR(32) NOT NULL COMMENT '关联课程ID',
  student_id VARCHAR(32) NOT NULL COMMENT '关联学生ID',
  appointment_time DATETIME NOT NULL COMMENT '预约时间',
  status TINYINT DEFAULT 0 COMMENT '0-待确认 1-已确认 2-取消',
  PRIMARY KEY (id),
  FOREIGN KEY (course_id) REFERENCES course(id) ON DELETE CASCADE,
  FOREIGN KEY (student_id) REFERENCES student(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='课时预约表';
```

#### 2. 执行脚本（3种方式）
##### 方式1：MySQL 客户端直接执行（推荐）
登录 MySQL 后，切换到目标数据库，执行脚本内容：
```sql
-- 1. 切换到目标数据库（需先创建）
USE lesson_appointment;

-- 2. 粘贴上述批量建表SQL，执行即可
```

##### 方式2：通过 `source` 命令执行本地脚本
```bash
# 1. 登录MySQL（Docker环境）
docker exec -it mysql8-instance mysql -uroot -p lesson_appointment

# 2. 执行本地脚本（Windows路径示例）
mysql> source D:/docker/mysql8/script/batch_create_tables.sql;

# Linux/macOS路径示例
mysql> source /docker/mysql8/script/batch_create_tables.sql;
```

##### 方式3：命令行直接执行脚本
```bash
# Docker环境（Windows PowerShell）
docker exec -i mysql8-instance mysql -uroot -p123456 lesson_appointment < D:/docker/mysql8/script/batch_create_tables.sql

# Linux/macOS
docker exec -i mysql8-instance mysql -uroot -p123456 lesson_appointment < /docker/mysql8/script/batch_create_tables.sql
```

### 二、进阶方式：存储过程循环创建（同构表批量生成）
适用于**创建大量结构相同/相似的表**（如按年级/月份分表：`student_grade1`、`student_grade2`...），核心是通过存储过程+循环动态生成 `CREATE TABLE` 语句。

#### 示例：批量创建按年级分的学生表
```sql
-- 1. 创建存储过程（批量生成1-6年级的学生分表）
DELIMITER //  -- 临时修改语句结束符为//，避免存储过程内分号中断执行
CREATE PROCEDURE batch_create_student_tables()
BEGIN
  -- 定义变量：年级数
  DECLARE grade_num INT DEFAULT 1;
  
  -- 循环创建1-6年级的表
  WHILE grade_num <= 6 DO
    -- 动态生成建表SQL（拼接表名）
    SET @create_sql = CONCAT(
      'CREATE TABLE IF NOT EXISTS student_grade', grade_num, ' (',
      'id VARCHAR(32) NOT NULL COMMENT ''学生ID'',',
      'name VARCHAR(50) NOT NULL COMMENT ''学生姓名'',',
      'age TINYINT COMMENT ''年龄'',',
      'gender TINYINT COMMENT ''0-女 1-男'',',
      'create_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,',
      'PRIMARY KEY (id)',
      ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT=''', '', grade_num, '年级学生表'';'
    );
    
    -- 执行动态SQL
    PREPARE stmt FROM @create_sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
    
    -- 年级数+1
    SET grade_num = grade_num + 1;
  END WHILE;
END //
DELIMITER ;  -- 恢复语句结束符为;

-- 2. 调用存储过程（执行批量建表）
CALL batch_create_student_tables();

-- 3. 验证结果（查看创建的表）
SHOW TABLES LIKE 'student_grade%';
```

#### 关键说明
1. `DELIMITER //`：修改语句结束符，因为存储过程内的分号会被 MySQL 误认为脚本结束，执行失败；
2. `CONCAT()`：拼接动态 SQL 语句，核心是根据循环变量生成不同表名；
3. `PREPARE/EXECUTE`：执行动态生成的 SQL 语句（MySQL 不支持直接执行拼接的字符串 SQL）；
4. 执行完成后，会生成 `student_grade1` 到 `student_grade6` 共6张结构相同的表。

### 三、高级方式：动态 SQL 生成（自定义表名/字段）
适用于**表结构需动态调整**的场景（如从配置表读取表名/字段，批量创建），核心是通过程序/脚本生成建表 SQL，再导入 MySQL 执行。

#### 示例：Python 脚本批量生成建表 SQL
```python
# batch_create_tables.py
import pymysql

# 1. 连接MySQL（Docker环境，宿主机IP+端口）
conn = pymysql.connect(
  host='127.0.0.1',
  port=3306,
  user='root',
  password='123456',
  database='lesson_appointment',
  charset='utf8mb4'
)
cursor = conn.cursor()

# 2. 定义要创建的表配置（表名+字段+注释）
tables_config = [
  {
    'table_name': 'class',
    'comment': '班级表',
    'fields': [
      'id VARCHAR(32) NOT NULL PRIMARY KEY COMMENT ''班级ID'',',
      'class_name VARCHAR(50) NOT NULL COMMENT ''班级名称'',',
      'grade VARCHAR(20) COMMENT ''年级'',',
      'teacher_id VARCHAR(32) COMMENT ''班主任ID'',',
      'create_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT ''创建时间'''
    ]
  },
  {
    'table_name': 'score',
    'comment': '成绩表',
    'fields': [
      'id INT AUTO_INCREMENT PRIMARY KEY COMMENT ''成绩ID'',',
      'student_id VARCHAR(32) NOT NULL COMMENT ''学生ID'',',
      'course_id VARCHAR(32) NOT NULL COMMENT ''课程ID'',',
      'score DECIMAL(5,2) COMMENT ''分数'',',
      'exam_time DATETIME COMMENT ''考试时间'''
    ]
  }
]

# 3. 循环生成并执行建表SQL
for table in tables_config:
  # 拼接建表语句
  create_sql = f"""
    CREATE TABLE IF NOT EXISTS {table['table_name']} (
      {''.join(table['fields'])}
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='{table['comment']}';
  """
  # 执行SQL
  try:
    cursor.execute(create_sql)
    conn.commit()
    print(f"表 {table['table_name']} 创建成功！")
  except Exception as e:
    conn.rollback()
    print(f"表 {table['table_name']} 创建失败：{e}")

# 4. 关闭连接
cursor.close()
conn.close()
```

#### 执行 Python 脚本
```bash
# 安装依赖（若未安装）
pip install pymysql

# 执行脚本
python batch_create_tables.py
```

### 四、批量建表的注意事项（避坑指南）
1. **避免重复创建**：所有建表语句必须加 `IF NOT EXISTS`，防止表已存在时报错；
2. **字符集统一**：指定 `DEFAULT CHARSET=utf8mb4`，避免中文乱码（MySQL 中 `utf8` 是伪 UTF-8）；
3. **引擎选择**：优先使用 `InnoDB`（支持事务、外键、行锁），避免 `MyISAM`；
4. **外键约束**：创建有外键的表时，需保证关联的主表已存在（如先建 `teacher` 再建 `course`）；
5. **Docker 路径问题**：执行本地脚本时，Windows 路径用 `/` 或转义 `\`（如 `D:/docker/xxx.sql`），避免路径解析失败；
6. **权限足够**：执行建表的用户需有 `CREATE` 权限（如 root、或授权过的业务用户）。

### 五、验证批量建表结果
```sql
-- 1. 查看当前数据库所有表
SHOW TABLES;

-- 2. 查看指定表结构
DESC teacher;  -- 或 DESC student_grade1;

-- 3. 查看表注释
SHOW TABLE STATUS LIKE 'teacher'\G;  -- \G：按行格式化输出
```

### 总结
1. **基础场景**：直接编写多表 `CREATE TABLE` 脚本执行，简单高效，适配大多数业务场景；
2. **同构分表场景**：用存储过程+循环批量生成表，减少重复代码；
3. **动态配置场景**：用Python/Shell等脚本生成建表SQL，适配复杂的自定义表结构；
4. 核心避坑点：加 `IF NOT EXISTS`、统一字符集 `utf8mb4`、保证外键依赖顺序。

掌握以上方法可高效完成 MySQL 批量建表，适配开发、测试、生产环境的不同需求。


以下是使用 Python 操作 MySQL 8.0 创建数据库并执行 `database.sql` 脚本的完整代码，包含环境准备、连接配置、脚本执行等核心步骤：

### 1. 环境准备
首先安装依赖库：
```bash
pip install pymysql cryptography  # cryptography用于MySQL8.0的密码加密认证
```

### 2. Python 代码实现
```python
import pymysql
from pymysql.err import OperationalError, ProgrammingError

# MySQL 连接配置（根据实际情况修改）
MYSQL_CONFIG = {
    'host': 'localhost',
    'port': 3306,
    'user': 'root',  # 替换为你的MySQL用户名
    'password': 'your_password',  # 替换为你的MySQL密码
    'charset': 'utf8mb4'
}

# 读取database.sql文件内容
def read_sql_file(file_path: str) -> str:
    """读取SQL脚本文件，处理注释和空行"""
    with open(file_path, 'r', encoding='utf8') as f:
        sql_content = f.read()
    
    # 按分号分割SQL语句（处理多行语句，跳过注释和空行）
    sql_statements = []
    current_stmt = ""
    for line in sql_content.split('\n'):
        # 跳过注释行和空行
        line = line.strip()
        if not line or line.startswith('--'):
            continue
        current_stmt += line
        # 以分号结尾则分割为完整语句
        if current_stmt.endswith(';'):
            sql_statements.append(current_stmt.strip())
            current_stmt = ""
    return sql_statements

# 执行SQL脚本创建数据库和表
def execute_sql_script():
    # 1. 先连接MySQL服务（不指定数据库）
    try:
        conn = pymysql.connect(**MYSQL_CONFIG)
        cursor = conn.cursor()
        print("成功连接到MySQL服务器")

        # 2. 创建数据库（如果不存在）
        create_db_sql = """
        CREATE DATABASE IF NOT EXISTS lesson_appointment 
        DEFAULT CHARACTER SET utf8mb4 
        COLLATE utf8mb4_unicode_ci;
        """
        cursor.execute(create_db_sql)
        conn.commit()
        print("数据库lesson_appointment创建/验证成功")

        # 3. 切换到目标数据库
        cursor.execute("USE lesson_appointment;")

        # 4. 读取并执行SQL脚本中的表创建语句
        sql_statements = read_sql_file('database.sql')  # 确保database.sql在当前目录
        for idx, stmt in enumerate(sql_statements):
            try:
                cursor.execute(stmt)
                conn.commit()
                print(f"执行第{idx+1}条SQL语句成功")
            except ProgrammingError as e:
                print(f"执行第{idx+1}条SQL语句失败: {e}")
                conn.rollback()

    except OperationalError as e:
        print(f"MySQL连接失败: {e}")
    finally:
        # 关闭连接
        if 'conn' in locals() and conn.open:
            cursor.close()
            conn.close()
            print("MySQL连接已关闭")

if __name__ == '__main__':
    execute_sql_script()
```

### 3. 关键说明
#### （1）适配 MySQL 8.0 注意事项
- MySQL 8.0 默认使用 `caching_sha2_password` 认证方式，`pymysql` 需配合 `cryptography` 库才能正常连接；
- 确保 MySQL 服务已启动，且配置的用户名/密码有创建数据库、表的权限；
- 字符集统一使用 `utf8mb4`，兼容emoji等特殊字符。

#### （2）SQL脚本处理逻辑
- 跳过注释行（`--` 开头）和空行，避免执行无效语句；
- 按分号分割SQL语句，确保每条语句独立执行；
- 执行失败时回滚，避免部分执行导致的表结构异常。

#### （3）异常处理
- 捕获连接异常（如密码错误、端口不通）；
- 捕获SQL语法异常（如脚本写错）；
- 执行每条SQL后自动提交，失败则回滚。

### 4. 使用步骤
1. 将 `database.sql` 文件放在Python脚本同一目录；
2. 修改 `MYSQL_CONFIG` 中的 `host`/`user`/`password` 为你的MySQL实际配置；
3. 运行Python脚本，控制台会输出每条SQL的执行结果；
4. 执行完成后，可通过MySQL客户端验证：
   ```sql
   USE lesson_appointment;
   SHOW TABLES;  -- 查看是否创建了所有表
   ```

### 5. 常见问题解决
- **认证失败**：如果报 `caching_sha2_password` 错误，可临时修改MySQL用户认证方式：
  ```sql
  ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY 'your_password';
  FLUSH PRIVILEGES;
  ```
- **权限不足**：确保MySQL用户有 `CREATE DATABASE`、`CREATE TABLE` 权限；
- **SQL语法错误**：检查 `database.sql` 中是否有语法错误（如重复创建 `course_evaluation` 表，需删除其中一个重复定义）。

### 6. 优化建议（可选）
- 生产环境建议使用配置文件（如 `config.ini`）存储MySQL配置，而非硬编码；
- 增加日志模块（如 `logging`），替代print输出，方便排查问题；
- 批量执行时可增加事务控制，确保所有表要么都创建成功，要么都回滚。