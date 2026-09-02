import subprocess, os, datetime

DB = "lesson_appointment"
OUT_DIR = r"C:/Users/Administrator/WorkBuddy/2026-09-02-12-40-49/test-saas"

def mysql_val(sql):
    r = subprocess.run(
        ["mysql", "-uroot", "-p123456", "--default-character-set=utf8mb4", DB, "-B", "-N", "-e", sql],
        capture_output=True, text=True, timeout=60)
    if r.returncode != 0:
        raise RuntimeError("mysql query failed: " + r.stderr)
    return [ln.split("\t") for ln in r.stdout.splitlines() if ln.strip()]

# 1) 当前全部表（按 SHOW TABLES 顺序）
tables = [row[0] for row in mysql_val("SHOW TABLES;")]
print("tables:", tables)

# 2) 导出建表 DDL（schema-only，带 DROP TABLE IF EXISTS 便于重复执行）
r = subprocess.run(
    ["mysqldump", "-uroot", "-p123456", "--no-data", "--add-drop-table",
     "--default-character-set=utf8mb4", DB],
    capture_output=True, text=True, timeout=180)
if r.returncode != 0:
    raise RuntimeError("mysqldump failed: " + r.stderr)
schema_path = os.path.join(OUT_DIR, "lesson_appointment_schema.sql")
with open(schema_path, "w", encoding="utf-8") as f:
    f.write(r.stdout)
print("schema bytes:", len(r.stdout), "->", schema_path)

# 3) 生成全表数据清理脚本（禁用外键检查后 DELETE，顺序无关）
now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
lines = []
lines.append("-- ============================================================")
lines.append("-- 清理脚本: 删除 lesson_appointment 全部表的数据内容")
lines.append("-- 生成时间: " + now)
lines.append("-- 说明: 仅删除数据(DELETE)，保留表结构；禁用外键检查后逐表清空")
lines.append("--       如需同时重置自增列，可将下方 DELETE 改为 TRUNCATE TABLE")
lines.append("-- 执行:   mysql -uroot -p123456 lesson_appointment < lesson_appointment_cleanup.sql")
lines.append("-- ============================================================")
lines.append("")
lines.append("SET FOREIGN_KEY_CHECKS = 0;")
lines.append("")
for t in tables:
    lines.append("DELETE FROM `" + t + "`;")
lines.append("")
lines.append("SET FOREIGN_KEY_CHECKS = 1;")
lines.append("")
lines.append("-- 校验: 各表剩余行数应为 0")
for t in tables:
    lines.append("SELECT '" + t + "' AS `table`, COUNT(*) AS `rows` FROM `" + t + "`;")

cleanup_path = os.path.join(OUT_DIR, "lesson_appointment_cleanup.sql")
with open(cleanup_path, "w", encoding="utf-8") as f:
    f.write("\n".join(lines))
print("cleanup ->", cleanup_path)
print("DONE")
