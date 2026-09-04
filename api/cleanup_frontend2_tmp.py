#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""二次清理：移除 static 中仍活跃的（含多行）console.log 调用。
- 仅处理 console.log( （非 console.error/warn），且前一个字符不是单词/点（排除 myConsole.log）。
- 跳过行内有 // 注释的（已注释的惰性代码保留不动）。
- 用括号配对 + 字符串感知定位到匹配的 )，整体替换为 undefined，保证语法有效。
"""
import pathlib

STATIC = pathlib.Path(r"C:\Users\Administrator\WorkBuddy\2026-08-30-17-19-24\api\src\main\resources\static")
TOKEN = "console.log("


def strip(text):
    out = []
    i = 0
    n = len(text)
    replaced = 0
    while i < n:
        idx = text.find(TOKEN, i)
        if idx == -1:
            out.append(text[i:])
            break
        # 边界：前一个字符不能是字母/数字/下划线/点（排除 myConsole.log / obj.console.log）
        if idx > 0:
            pc = text[idx - 1]
            if pc.isalnum() or pc in "_.":
                out.append(text[i:idx + len(TOKEN)])
                i = idx + len(TOKEN)
                continue
        # 跳过被 // 注释的行
        line_start = text.rfind("\n", 0, idx) + 1
        if "//" in text[line_start:idx]:
            out.append(text[i:idx + len(TOKEN)])
            i = idx + len(TOKEN)
            continue
        # 替换 console.log(<balanced>) -> undefined
        out.append(text[i:idx])
        p = idx + len("console.log")  # '(' 位置
        depth = 0
        j = p
        in_str = None
        while j < n:
            c = text[j]
            if in_str:
                if c == "\\":
                    j += 2
                    continue
                if c == in_str:
                    in_str = None
                j += 1
                continue
            if c in ('"', "'", "`"):
                in_str = c
                j += 1
                continue
            if c == "(":
                depth += 1
            elif c == ")":
                depth -= 1
                if depth == 0:
                    j += 1
                    break
            j += 1
        out.append("undefined")
        replaced += 1
        i = j
    return "".join(out), replaced


total = 0
files = []
for ext in ("*.js", "*.html"):
    for f in STATIC.rglob(ext):
        text = f.read_text(encoding="utf-8")
        if "console.log(" not in text:
            continue
        new_text, rep = strip(text)
        if rep:
            f.write_text(new_text, encoding="utf-8")
            total += rep
            files.append((f.name, rep))
print(f"[frontend2] replaced={total}")
for name, rep in files:
    print(f"  {name}: {rep}")
