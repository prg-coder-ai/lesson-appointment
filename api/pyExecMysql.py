import pymysql
from pymysql.err import OperationalError, ProgrammingError

# MySQL 连接配置（根据实际情况修改）
MYSQL_CONFIG = {
    'host': 'localhost',
    'port': 3306,
    'user': 'root',  # 替换为你的MySQL用户名
    'password': '123456',  # 替换为你的MySQL密码
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