-- ============================================================================
-- migration-20260902-term-lang.sql  sys_term 多语言字段
-- 需求（2026-09-02）：按语言类型显示词汇，如 key=course 在中文环境显示"课程"、
--   英语环境显示 "Course"、法语环境显示 "Cours"，用于多语言界面显示。
-- 设计：
--   ① 新增 language 字段（ISO 639-1 双字母代码，默认 zh）
--   ② 唯一键从 (term_key, industry_id, tenant_id) 扩展为
--      (term_key, industry_id, tenant_id, language)：
--      同一 key 同一作用域下可维护多个语言版本，互不冲突
--   ③ 现有数据（单语言）自动归入 zh，无需回填
--   ④ 显示取词规则（后端 getTermMap）：
--        语言内按作用域回退：租户[lang] → 行业[lang] → 平台[lang]
--        语言间回退：指定语言缺失 → zh → 该 key 任意语言
-- ============================================================================

-- ① 新增 language 字段（放在 term_name 之后，语义相邻）
ALTER TABLE sys_term
  ADD COLUMN language VARCHAR(16) NOT NULL DEFAULT 'zh'
  COMMENT '语言代码（ISO 639-1：zh中文/en英语/fr法语）' AFTER term_name;

-- ② 重建唯一键（原三列键已不满足多语言：同 key 同作用域可多语言共存）
--    现有数据三列唯一，加语言维度后不会产生冲突
ALTER TABLE sys_term
  DROP INDEX uk_scope_key,
  ADD UNIQUE KEY uk_scope_key (term_key, industry_id, tenant_id, language);
