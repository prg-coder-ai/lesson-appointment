-- ============================================================================
-- migration-20260902-term.sql  行业专业词汇表 sys_term
-- 设计（2026-09-02 定稿）：
--   单表三级作用域，industry_id + tenant_id 用 0 作哨兵（MySQL 唯一键对 NULL 不生效）：
--     (0,       0)      = 平台词（全系统默认，平台管理员维护）
--     (行业id,  0)      = 行业词（该行业的专业词汇，平台管理员按行业维护）
--     (租户id,  冗余行业id) = 租户词（租户自定义/覆盖，租户管理员维护）
--   显示优先级：租户词 > 行业词 > 平台词，逐级回退，前端硬编码兜底
-- ============================================================================

-- ① 基础行业幂等初始化（此前 sys_industry 测试数据已清空，术语表需挂载行业）
--    code 与前端 terms.js 的行业 key 对齐：education / legal / counseling
INSERT INTO sys_industry (code, name, status, remark) VALUES
('education',  '教育',   1, '语言教学等通用教育行业'),
('legal',      '法律咨询', 1, '律师 / 法律咨询服务'),
('counseling', '心理咨询', 1, '心理咨询 / 情感咨询')
ON DUPLICATE KEY UPDATE name = VALUES(name), status = VALUES(status);

-- ② 建表
CREATE TABLE IF NOT EXISTS sys_term (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  term_key    VARCHAR(64)  NOT NULL COMMENT '词条编码（业务标识，如 course/teacher/student）',
  term_name   VARCHAR(64)  NOT NULL COMMENT '显示词（该作用域下的词汇值）',
  term_type   VARCHAR(32)  NOT NULL DEFAULT 'label' COMMENT '用途：label标签/menu菜单/button按钮/tip提示',
  industry_id BIGINT       NOT NULL DEFAULT 0 COMMENT '所属行业：0=平台级，>0=该行业',
  tenant_id   BIGINT       NOT NULL DEFAULT 0 COMMENT '所属租户：0=平台/行业级，>0=租户自定义',
  sort_order  INT          NOT NULL DEFAULT 0 COMMENT '同级排序（菜单顺序可用）',
  status      TINYINT      NOT NULL DEFAULT 1 COMMENT '1启用 0停用（停用=该级回退到下一级）',
  remark      VARCHAR(255) NULL     COMMENT '备注',
  create_time DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_scope_key (term_key, industry_id, tenant_id),
  KEY idx_tenant (tenant_id),
  KEY idx_industry (industry_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='行业专业词汇表';

-- ③ 平台词（education 锚点词 = 全系统默认，值取自前端 terms.js TERM_DICT.education）
INSERT INTO sys_term (term_key, term_name, term_type, industry_id, tenant_id, sort_order, status, remark) VALUES
('lessonSystem','语言教学预约系统','label',0,0,1,1,'系统名称'),
('course','课程','label',0,0,2,1,''),
('schedule','排期','menu',0,0,3,1,''),
('teacher','教师','label',0,0,4,1,''),
('teacherAlt','老师','label',0,0,5,1,''),
('student','学生','label',0,0,6,1,''),
('lesson','上课','label',0,0,7,1,''),
('lessonTime','上课时间','label',0,0,8,1,''),
('lessonUnit','课时','label',0,0,9,1,''),
('teaching','授课','label',0,0,10,1,''),
('lessonNumber','课次','label',0,0,11,1,''),
('courseName','课程名称','label',0,0,12,1,''),
('leave','请假','label',0,0,13,1,''),
('lessonFee','课时费','label',0,0,14,1,''),
('content','教学内容','label',0,0,15,1,''),
('classForm','班级形式','label',0,0,16,1,''),
('classForm1p1','一对一','label',0,0,17,1,''),
('classForm1pN','小班课','label',0,0,18,1,''),
('classForm1p2N','大班课','label',0,0,19,1,''),
('classLevel','难度等级','label',0,0,20,1,''),
('classLevelB1','B1入门','label',0,0,21,1,''),
('classLevelB2','B2初级','label',0,0,22,1,''),
('classLevelB3','B3中级','label',0,0,23,1,''),
('classLevelB4','B4高级','label',0,0,24,1,''),
('classType','语言类型','label',0,0,25,1,''),
('classType1','法语','label',0,0,26,1,''),
('classType2','英语','label',0,0,27,1,''),
('classType3','汉语','label',0,0,28,1,''),
('classType4','西语','label',0,0,29,1,''),
('lessonDuration','课时长度(分钟)','label',0,0,30,1,'')
ON DUPLICATE KEY UPDATE term_name = VALUES(term_name), status = VALUES(status);

-- ④ 法律咨询行业词（industry_id 动态取，值取自 terms.js TERM_DICT.legal）
INSERT INTO sys_term (term_key, term_name, term_type, industry_id, tenant_id, sort_order, status, remark)
SELECT t.term_key, t.term_name, t.term_type, ind.id, 0, t.sort_order, 1, '法律咨询行业词'
FROM (
  SELECT 'lessonSystem' term_key,'法律咨询预约系统' term_name,'label' term_type,1 sort_order UNION ALL
  SELECT 'course','咨询话题','label',2 UNION ALL
  SELECT 'teacher','律师','label',4 UNION ALL
  SELECT 'teacherAlt','律师','label',5 UNION ALL
  SELECT 'student','咨询者','label',6 UNION ALL
  SELECT 'lesson','咨询','label',7 UNION ALL
  SELECT 'lessonTime','咨询时间','label',8 UNION ALL
  SELECT 'lessonUnit','咨询时长','label',9 UNION ALL
  SELECT 'teaching','执业','label',10 UNION ALL
  SELECT 'lessonNumber','咨询次序','label',11 UNION ALL
  SELECT 'courseName','咨询话题','label',12 UNION ALL
  SELECT 'leave','改期','label',13 UNION ALL
  SELECT 'lessonFee','咨询费','label',14 UNION ALL
  SELECT 'content','咨询内容','label',15 UNION ALL
  SELECT 'classForm','服务形式','label',16 UNION ALL
  SELECT 'classForm1p1','个案咨询','label',17 UNION ALL
  SELECT 'classForm1pN','小组咨询','label',18 UNION ALL
  SELECT 'classForm1p2N','专题讲座','label',19 UNION ALL
  SELECT 'classLevel','咨询等级','label',20 UNION ALL
  SELECT 'classType','咨询范畴','label',25 UNION ALL
  SELECT 'classType1','婚姻','label',26 UNION ALL
  SELECT 'classType2','劳动','label',27 UNION ALL
  SELECT 'classType3','刑事','label',28 UNION ALL
  SELECT 'classType4','行政','label',29 UNION ALL
  SELECT 'lessonDuration','预约时长(分钟)','label',30
) t
CROSS JOIN sys_industry ind
WHERE ind.code = 'legal'
ON DUPLICATE KEY UPDATE term_name = VALUES(term_name), status = VALUES(status);

-- ⑤ 心理咨询行业词（industry_id 动态取，值取自 terms.js TERM_DICT.counseling）
INSERT INTO sys_term (term_key, term_name, term_type, industry_id, tenant_id, sort_order, status, remark)
SELECT t.term_key, t.term_name, t.term_type, ind.id, 0, t.sort_order, 1, '心理咨询行业词'
FROM (
  SELECT 'lessonSystem' term_key,'心理咨询预约系统' term_name,'label' term_type,1 sort_order UNION ALL
  SELECT 'course','咨询项目','label',2 UNION ALL
  SELECT 'teacher','咨询师','label',4 UNION ALL
  SELECT 'teacherAlt','咨询师','label',5 UNION ALL
  SELECT 'student','来访者','label',6 UNION ALL
  SELECT 'lesson','咨询','label',7 UNION ALL
  SELECT 'lessonTime','咨询时间','label',8 UNION ALL
  SELECT 'lessonUnit','咨询时长','label',9 UNION ALL
  SELECT 'teaching','提供咨询','label',10 UNION ALL
  SELECT 'lessonNumber','咨询次序','label',11 UNION ALL
  SELECT 'courseName','咨询项目','label',12 UNION ALL
  SELECT 'leave','改期','label',13 UNION ALL
  SELECT 'lessonFee','咨询费','label',14 UNION ALL
  SELECT 'classForm','服务形式','label',16 UNION ALL
  SELECT 'classForm1p1','一对一咨询','label',17 UNION ALL
  SELECT 'classForm1pN','小组咨询','label',18 UNION ALL
  SELECT 'classForm1p2N','团体咨询','label',19 UNION ALL
  SELECT 'classLevel','咨询等级','label',20 UNION ALL
  SELECT 'classType','咨询类型','label',25 UNION ALL
  SELECT 'classType1','婚姻','label',26 UNION ALL
  SELECT 'classType2','情感','label',27 UNION ALL
  SELECT 'classType3','成长','label',28 UNION ALL
  SELECT 'classType4','育儿','label',29 UNION ALL
  SELECT 'lessonDuration','预约时长(分钟)','label',30
) t
CROSS JOIN sys_industry ind
WHERE ind.code = 'counseling'
ON DUPLICATE KEY UPDATE term_name = VALUES(term_name), status = VALUES(status);

-- ⑥ 演示数据：把 DEFAULT 租户归属到教育行业（便于直接演示三级优先级；可改/可留空）
UPDATE sys_tenant SET industry_id = (SELECT id FROM sys_industry WHERE code = 'education')
WHERE id = 1 AND industry_id IS NULL;

-- ============================================================================
-- 验证语句：
--   SELECT id, term_key, term_name, industry_id, tenant_id, status FROM sys_term ORDER BY industry_id, tenant_id, sort_order;
--   平台词数量: SELECT COUNT(*) FROM sys_term WHERE industry_id=0 AND tenant_id=0;
--   行业词数量: SELECT industry_id, COUNT(*) FROM sys_term WHERE tenant_id=0 AND industry_id>0 GROUP BY industry_id;
-- ============================================================================
