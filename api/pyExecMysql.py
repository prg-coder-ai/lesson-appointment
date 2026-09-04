import os
import re
import sys

import pymysql
from pymysql.err import OperationalError, ProgrammingError

# MySQL 连接配置
#
# 密码不再写死在脚本里（此前此处直接写着明文密码，且已随 git 进入版本历史）：
#   1) 优先读环境变量 DB_PASSWORD（部署/CI 推荐）
#   2) 未设置时回退到 application.properties 的 spring.datasource.password
#      —— 保证密码只有一处来源，不必在两个文件里各维护一份
PROP_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                         'src', 'main', 'resources', 'application.properties')

# 同时兼容 `spring.datasource.password=xxx` 与 `=${DB_PASSWORD:xxx}` 两种写法
_PWD_RE = re.compile(
    r'^\s*spring\.datasource\.password\s*=\s*'
    r'(?:\$\{DB_PASSWORD:([^}]*)\}|(.*?))\s*$'
)


def _resolve_password():
    env = os.environ.get('DB_PASSWORD')
    if env:
        return env
    try:
        with open(PROP_FILE, 'r', encoding='utf-8') as f:
            for line in f:
                m = _PWD_RE.match(line)
                if m:
                    return (m.group(1) or m.group(2) or '').strip() or None
    except OSError:
        pass
    return None


MYSQL_CONFIG = {
    'host': os.environ.get('DB_HOST', 'localhost'),
    'port': int(os.environ.get('DB_PORT', 3306)),
    'user': os.environ.get('DB_USERNAME', 'root'),
    'password': _resolve_password(),
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
    if not MYSQL_CONFIG['password']:
        print("未提供数据库密码。请任选其一：\n"
              "  1) 设置环境变量 DB_PASSWORD=你的密码\n"
              "  2) 确保 application.properties 中存在 "
              "spring.datasource.password=你的密码")
        sys.exit(1)
    execute_sql_script()