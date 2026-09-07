import re

SRC = r"C:/Users/Administrator/WorkBuddy/2026-08-30-17-19-24/docs/_orig.sql"
DST = r"C:/Users/Administrator/WorkBuddy/2026-08-30-17-19-24/docs/lesson_appointment_init.sql"

with open(SRC, "r", encoding="utf-8", errors="replace") as f:
    text = f.read()

# 1) Remove all COMMENT '...' / COMMENT='...' clauses (column + table level), handling escaped quotes
comment_re = re.compile(r"\s*COMMENT\s*=?\s*'(?:[^'\\]|\\.|'')*'", re.DOTALL)
text = comment_re.sub("", text)
# tidy trailing whitespace before semicolons
text = re.sub(r"\s+;", ";", text)

# 2) Remove instance-specific AUTO_INCREMENT=NNN -> keep plain AUTO_INCREMENT
text = re.sub(r"AUTO_INCREMENT=\d+", "AUTO_INCREMENT", text)

# 3) Remove the mysqldump session-variable noise lines (/*!NNN SET ... */;)
text = re.sub(r"^\s*/\*!\d+\s+SET[^\n;]*;\s*$", "", text, flags=re.MULTILINE)

# 4) Drop the per-column character_set_client save/restore blocks if any stray remain
text = re.sub(r"/\*!\d+\s+SET\s+character_set_client[^\n;]*;\s*", "", text)

# 5) Collapse 3+ blank lines into 1
text = re.sub(r"\n{3,}", "\n\n", text)

header = """-- ============================================================
-- 预约系统 初始化建库脚本 (lesson_appointment)
-- 由 mysqldump --no-data 导出真实结构，并经清洗生成。
-- 说明：原库 COMMENT 注释在写入时已损坏，故此处统一移除；
--       列名与类型保持与线上库完全一致。
-- 使用： mysql -uroot -p < lesson_appointment_init.sql
-- ============================================================

"""

text = header + text.strip() + "\n"

with open(DST, "w", encoding="utf-8", newline="\n") as f:
    f.write(text)

print("done; chars=", len(text))
