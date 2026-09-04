#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
清理前后端调试输出（SaaS 迁移子项3）：
- 后端 Java：System.out.println -> log.debug；缺日志器的文件补 @Slf4j + import。
- 前端 static：删除独立成行的单行长 console.log 语句（保留嵌入/多行/行尾注释的）。
只改源码，不改 target/ 构建产物。
"""
import re
import pathlib

API = pathlib.Path(r"C:\Users\Administrator\WorkBuddy\2026-08-30-17-19-24\api")
JAVA = API / "src" / "main" / "java"
STATIC = API / "src" / "main" / "resources" / "static"

# ---------------- 后端 ----------------
backend_files = 0
backend_repl = 0
for f in JAVA.rglob("*.java"):
    text = f.read_text(encoding="utf-8")
    if "System.out.println" not in text:
        continue
    backend_files += 1
    has_slf4j = "@Slf4j" in text
    has_explicit = bool(re.search(r'private\s+static\s+final\s+\w*Logger\s+(log|logger)\b', text))
    need_logger = not (has_slf4j or has_explicit)

    new_text, n = re.subn(r'System\.out\.println', 'log.debug', text)
    backend_repl += n

    if need_logger:
        if "import lombok.extern.slf4j.Slf4j;" not in new_text:
            lines = new_text.split("\n")
            last_import = -1
            for i, line in enumerate(lines):
                if line.strip().startswith("import "):
                    last_import = i
            if last_import >= 0:
                lines.insert(last_import + 1, "import lombok.extern.slf4j.Slf4j;")
            else:
                for i, line in enumerate(lines):
                    if line.strip().startswith("package "):
                        lines.insert(i + 1, "import lombok.extern.slf4j.Slf4j;")
                        break
            new_text = "\n".join(lines)
        lines = new_text.split("\n")
        for i, line in enumerate(lines):
            if re.match(r'^(public\s+|final\s+|abstract\s+|@\w+\s*)*?(class|interface|enum|record)\s+\w+', line):
                lines.insert(i, "@Slf4j")
                break
        new_text = "\n".join(lines)
    f.write_text(new_text, encoding="utf-8")

print(f"[backend] files={backend_files} replacements={backend_repl}")

# ---------------- 前端 ----------------
frontend_files = 0
frontend_repl = 0
pat = re.compile(r'^\s*console\.log\(.*\)\s*;?\s*$')
for ext in ("*.js", "*.html"):
    for f in STATIC.rglob(ext):
        text = f.read_text(encoding="utf-8")
        if "console.log" not in text:
            continue
        lines = text.split("\n")
        out = []
        removed = 0
        for line in lines:
            if pat.match(line):
                removed += 1
                continue
            out.append(line)
        if removed:
            frontend_files += 1
            frontend_repl += removed
            f.write_text("\n".join(out), encoding="utf-8")

print(f"[frontend] files={frontend_files} lines_removed={frontend_repl}")
