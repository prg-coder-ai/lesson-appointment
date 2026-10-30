#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
生成 sys_term 的 upsert 同步脚本：
把「当前数据库」(lesson_appointment) 中 sys_term 的数据，
同步写入「指定的目标数据库」。若目标库已存在相同 id，则执行 UPDATE。

用法：
  1) 修改下方 OUT 文件顶部的 <目标数据库名> 占位符为实际库名；
  2) 在目标 MySQL 实例上执行该 SQL 文件即可。
"""
import pymysql

SRC_HOST, SRC_PORT, SRC_USER, SRC_PASS, SRC_DB = "127.0.0.1", 3306, "root", "123456", "lesson_appointment"
TABLE = "sys_term"

OUT = "sys_term_upsert_to_target.sql"

# 不参与 UPDATE 的列（主键/自增不更新）
SKIP_UPDATE = {"id"}

conn = pymysql.connect(host=SRC_HOST, port=SRC_PORT, user=SRC_USER, password=SRC_PASS,
                       database=SRC_DB, charset="utf8mb4")
try:
    with conn.cursor() as cur:
        cur.execute("SHOW COLUMNS FROM `%s`.`%s`" % (SRC_DB, TABLE))
        cols = [r[0] for r in cur.fetchall()]
        cur.execute("SELECT COUNT(*) FROM `%s`.`%s`" % (SRC_DB, TABLE))
        total = cur.fetchone()[0]
        cur.execute("SELECT `%s` FROM `%s`.`%s` ORDER BY id"
                    % ("`,`".join(cols), SRC_DB, TABLE))
        rows = cur.fetchall()
finally:
    conn.close()

assert rows, "源表 %s 无数据" % TABLE
update_cols = [c for c in cols if c not in SKIP_UPDATE]


def sql_val(v):
    if v is None:
        return "NULL"
    if isinstance(v, bool):
        return "1" if v else "0"
    if isinstance(v, (int, float)):
        return str(v)
    # bytes / str -> 转义字符串
    s = v.decode("utf-8", "replace") if isinstance(v, (bytes, bytearray)) else str(v)
    return "'" + pymysql.converters.escape_string(s) + "'"


def row_values(r):
    return "(" + ",".join(sql_val(x) for x in r) + ")"


# 分批写入，每批 200 行，避免单条语句过大
BATCH = 200
col_list = ", ".join("`%s`" % c for c in cols)
update_clause = ", ".join("`%s`=new.`%s`" % (c, c) for c in update_cols)

header = (
    "-- ============================================================\n"
    "-- sys_term 数据同步 upsert 脚本（由 gen_upsert_sys_term.py 生成）\n"
    "-- 源库: %s.%s  (共 %d 行)\n"
    "-- 作用: 将数据写入「目标数据库」，id 已存在则 UPDATE，否则 INSERT。\n"
    "-- 使用: 将下方 <目标数据库名> 替换为实际目标库名后执行本文件。\n"
    "-- 注意: 本脚本要求目标库已存在 sys_term 表且结构与源一致。\n"
    "-- ============================================================\n\n"
) % (SRC_DB, TABLE, total)

chunks = [rows[i:i + BATCH] for i in range(0, len(rows), BATCH)]
stmts = []
for ci, chunk in enumerate(chunks, 1):
    vals = ",\n".join(row_values(r) for r in chunk)
    stmts.append(
        "INSERT INTO `<目标数据库名>`.`%s` (%s) VALUES\n%s\nAS new\n"
        "ON DUPLICATE KEY UPDATE %s;  -- 批次 %d/%d"
        % (TABLE, col_list, vals, update_clause, ci, len(chunks))
    )

with open(OUT, "w", encoding="utf-8") as f:
    f.write(header)
    f.write("\n".join(stmts))
    f.write("\n")

print("OK: 写入 %s，共 %d 行，分 %d 批" % (OUT, total, len(chunks)))
print("列:", cols)
