-- ============================================================================
-- migration-20260902-term-lang-data.sql  sys_term 多语言翻译种子数据
-- 目的：为平台词 + 法律/心理咨询行业词补充 en(英语) / fr(法语) 翻译，
--       使 /term/map?lang=en|fr 真正返回目标语言词表（否则按设计回退 zh）。
-- 幂等：唯一键 (term_key, industry_id, tenant_id, language)，重复执行仅更新 term_name。
-- 依赖：migration-20260902-term.sql（zh 基础数据）+ migration-20260902-term-lang.sql（language 列）
-- ============================================================================

-- ① 平台词（industry_id=0, tenant_id=0）英语
INSERT INTO sys_term (term_key, term_name, language, term_type, industry_id, tenant_id, sort_order, status, remark) VALUES
('lessonSystem','Language Teaching Booking System','en','label',0,0,1,1,'系统名称(en)'),
('course','Course','en','label',0,0,2,1,''),
('schedule','Schedule','en','menu',0,0,3,1,''),
('teacher','Teacher','en','label',0,0,4,1,''),
('teacherAlt','Teacher','en','label',0,0,5,1,''),
('student','Student','en','label',0,0,6,1,''),
('lesson','Class','en','label',0,0,7,1,''),
('lessonTime','Class Time','en','label',0,0,8,1,''),
('lessonUnit','Session','en','label',0,0,9,1,''),
('teaching','Teaching','en','label',0,0,10,1,''),
('lessonNumber','Session No.','en','label',0,0,11,1,''),
('courseName','Course Name','en','label',0,0,12,1,''),
('leave','Leave','en','label',0,0,13,1,''),
('lessonFee','Session Fee','en','label',0,0,14,1,''),
('content','Content','en','label',0,0,15,1,''),
('classForm','Class Format','en','label',0,0,16,1,''),
('classForm1p1','1-on-1','en','label',0,0,17,1,''),
('classForm1pN','Small Group','en','label',0,0,18,1,''),
('classForm1p2N','Large Group','en','label',0,0,19,1,''),
('classLevel','Level','en','label',0,0,20,1,''),
('classLevelB1','B1 Beginner','en','label',0,0,21,1,''),
('classLevelB2','B2 Elementary','en','label',0,0,22,1,''),
('classLevelB3','B3 Intermediate','en','label',0,0,23,1,''),
('classLevelB4','B4 Advanced','en','label',0,0,24,1,''),
('classType','Language Type','en','label',0,0,25,1,''),
('classType1','French','en','label',0,0,26,1,''),
('classType2','English','en','label',0,0,27,1,''),
('classType3','Chinese','en','label',0,0,28,1,''),
('classType4','Spanish','en','label',0,0,29,1,''),
('lessonDuration','Duration (min)','en','label',0,0,30,1,'')
ON DUPLICATE KEY UPDATE term_name=VALUES(term_name), status=1, remark=VALUES(remark);

-- ② 平台词（industry_id=0, tenant_id=0）法语
INSERT INTO sys_term (term_key, term_name, language, term_type, industry_id, tenant_id, sort_order, status, remark) VALUES
('lessonSystem','Système de réservation de cours de langue','fr','label',0,0,1,1,'系统名称(fr)'),
('course','Cours','fr','label',0,0,2,1,''),
('schedule','Horaire','fr','menu',0,0,3,1,''),
('teacher','Professeur','fr','label',0,0,4,1,''),
('teacherAlt','Professeur','fr','label',0,0,5,1,''),
('student','Étudiant','fr','label',0,0,6,1,''),
('lesson','Cours','fr','label',0,0,7,1,''),
('lessonTime','Heure de cours','fr','label',0,0,8,1,''),
('lessonUnit','Séance','fr','label',0,0,9,1,''),
('teaching','Enseignement','fr','label',0,0,10,1,''),
('lessonNumber','N° de séance','fr','label',0,0,11,1,''),
('courseName','Nom du cours','fr','label',0,0,12,1,''),
('leave','Absence','fr','label',0,0,13,1,''),
('lessonFee','Frais de séance','fr','label',0,0,14,1,''),
('content','Contenu','fr','label',0,0,15,1,''),
('classForm','Format de classe','fr','label',0,0,16,1,''),
('classForm1p1','Individuel','fr','label',0,0,17,1,''),
('classForm1pN','Petit groupe','fr','label',0,0,18,1,''),
('classForm1p2N','Grand groupe','fr','label',0,0,19,1,''),
('classLevel','Niveau','fr','label',0,0,20,1,''),
('classLevelB1','B1 Débutant','fr','label',0,0,21,1,''),
('classLevelB2','B2 Élémentaire','fr','label',0,0,22,1,''),
('classLevelB3','B3 Intermédiaire','fr','label',0,0,23,1,''),
('classLevelB4','B4 Avancé','fr','label',0,0,24,1,''),
('classType','Type de langue','fr','label',0,0,25,1,''),
('classType1','Français','fr','label',0,0,26,1,''),
('classType2','Anglais','fr','label',0,0,27,1,''),
('classType3','Chinois','fr','label',0,0,28,1,''),
('classType4','Espagnol','fr','label',0,0,29,1,''),
('lessonDuration','Durée (min)','fr','label',0,0,30,1,'')
ON DUPLICATE KEY UPDATE term_name=VALUES(term_name), status=1, remark=VALUES(remark);

-- ③ 法律咨询行业词（industry_id 动态取，code='legal') 英语
INSERT INTO sys_term (term_key, term_name, language, term_type, industry_id, tenant_id, sort_order, status, remark)
SELECT t.term_key, t.term_name, 'en', t.term_type, ind.id, 0, t.sort_order, 1, 'legal industry(en)'
FROM (
  SELECT 'lessonSystem' term_key,'Legal Consultation Booking System' term_name,'label' term_type,1 sort_order UNION ALL
  SELECT 'course','Consultation Topic','label',2 UNION ALL
  SELECT 'teacher','Lawyer','label',4 UNION ALL
  SELECT 'teacherAlt','Lawyer','label',5 UNION ALL
  SELECT 'student','Client','label',6 UNION ALL
  SELECT 'lesson','Consultation','label',7 UNION ALL
  SELECT 'lessonTime','Consultation Time','label',8 UNION ALL
  SELECT 'lessonUnit','Consultation Duration','label',9 UNION ALL
  SELECT 'teaching','Practice','label',10 UNION ALL
  SELECT 'lessonNumber','Consultation No.','label',11 UNION ALL
  SELECT 'courseName','Consultation Topic','label',12 UNION ALL
  SELECT 'leave','Reschedule','label',13 UNION ALL
  SELECT 'lessonFee','Consultation Fee','label',14 UNION ALL
  SELECT 'content','Consultation Content','label',15 UNION ALL
  SELECT 'classForm','Service Format','label',16 UNION ALL
  SELECT 'classForm1p1','Case Consultation','label',17 UNION ALL
  SELECT 'classForm1pN','Group Consultation','label',18 UNION ALL
  SELECT 'classForm1p2N','Seminar','label',19 UNION ALL
  SELECT 'classLevel','Consultation Level','label',20 UNION ALL
  SELECT 'classType','Consultation Area','label',25 UNION ALL
  SELECT 'classType1','Marriage','label',26 UNION ALL
  SELECT 'classType2','Labor','label',27 UNION ALL
  SELECT 'classType3','Criminal','label',28 UNION ALL
  SELECT 'classType4','Administrative','label',29 UNION ALL
  SELECT 'lessonDuration','Duration (min)','label',30
) t
CROSS JOIN sys_industry ind
WHERE ind.code = 'legal'
ON DUPLICATE KEY UPDATE term_name=VALUES(term_name), status=1, remark=VALUES(remark);

-- ④ 法律咨询行业词（code='legal') 法语
INSERT INTO sys_term (term_key, term_name, language, term_type, industry_id, tenant_id, sort_order, status, remark)
SELECT t.term_key, t.term_name, 'fr', t.term_type, ind.id, 0, t.sort_order, 1, 'legal industry(fr)'
FROM (
  SELECT 'lessonSystem' term_key,'Système de réservation de consultation juridique' term_name,'label' term_type,1 sort_order UNION ALL
  SELECT 'course','Sujet de consultation','label',2 UNION ALL
  SELECT 'teacher','Avocat','label',4 UNION ALL
  SELECT 'teacherAlt','Avocat','label',5 UNION ALL
  SELECT 'student','Client','label',6 UNION ALL
  SELECT 'lesson','Consultation','label',7 UNION ALL
  SELECT 'lessonTime','Heure de consultation','label',8 UNION ALL
  SELECT 'lessonUnit','Durée de consultation','label',9 UNION ALL
  SELECT 'teaching','Pratique','label',10 UNION ALL
  SELECT 'lessonNumber','N° de consultation','label',11 UNION ALL
  SELECT 'courseName','Sujet de consultation','label',12 UNION ALL
  SELECT 'leave','Report','label',13 UNION ALL
  SELECT 'lessonFee','Frais de consultation','label',14 UNION ALL
  SELECT 'content','Contenu de consultation','label',15 UNION ALL
  SELECT 'classForm','Format de service','label',16 UNION ALL
  SELECT 'classForm1p1','Consultation individuelle','label',17 UNION ALL
  SELECT 'classForm1pN','Consultation de groupe','label',18 UNION ALL
  SELECT 'classForm1p2N','Séminaire','label',19 UNION ALL
  SELECT 'classLevel','Niveau de consultation','label',20 UNION ALL
  SELECT 'classType','Domaine de consultation','label',25 UNION ALL
  SELECT 'classType1','Mariage','label',26 UNION ALL
  SELECT 'classType2','Travail','label',27 UNION ALL
  SELECT 'classType3','Pénal','label',28 UNION ALL
  SELECT 'classType4','Administratif','label',29 UNION ALL
  SELECT 'lessonDuration','Durée (min)','label',30
) t
CROSS JOIN sys_industry ind
WHERE ind.code = 'legal'
ON DUPLICATE KEY UPDATE term_name=VALUES(term_name), status=1, remark=VALUES(remark);

-- ⑤ 心理咨询行业词（industry_id 动态取，code='counseling') 英语
INSERT INTO sys_term (term_key, term_name, language, term_type, industry_id, tenant_id, sort_order, status, remark)
SELECT t.term_key, t.term_name, 'en', t.term_type, ind.id, 0, t.sort_order, 1, 'counseling industry(en)'
FROM (
  SELECT 'lessonSystem' term_key,'Psychological Counseling Booking System' term_name,'label' term_type,1 sort_order UNION ALL
  SELECT 'course','Counseling Program','label',2 UNION ALL
  SELECT 'teacher','Counselor','label',4 UNION ALL
  SELECT 'teacherAlt','Counselor','label',5 UNION ALL
  SELECT 'student','Client','label',6 UNION ALL
  SELECT 'lesson','Counseling','label',7 UNION ALL
  SELECT 'lessonTime','Counseling Time','label',8 UNION ALL
  SELECT 'lessonUnit','Counseling Duration','label',9 UNION ALL
  SELECT 'teaching','Provide Counseling','label',10 UNION ALL
  SELECT 'lessonNumber','Counseling No.','label',11 UNION ALL
  SELECT 'courseName','Counseling Program','label',12 UNION ALL
  SELECT 'leave','Reschedule','label',13 UNION ALL
  SELECT 'lessonFee','Counseling Fee','label',14 UNION ALL
  SELECT 'content','Content','label',15 UNION ALL
  SELECT 'classForm','Service Format','label',16 UNION ALL
  SELECT 'classForm1p1','1-on-1 Counseling','label',17 UNION ALL
  SELECT 'classForm1pN','Group Counseling','label',18 UNION ALL
  SELECT 'classForm1p2N','Group Therapy','label',19 UNION ALL
  SELECT 'classLevel','Counseling Level','label',20 UNION ALL
  SELECT 'classType','Counseling Type','label',25 UNION ALL
  SELECT 'classType1','Marriage','label',26 UNION ALL
  SELECT 'classType2','Emotion','label',27 UNION ALL
  SELECT 'classType3','Growth','label',28 UNION ALL
  SELECT 'classType4','Parenting','label',29 UNION ALL
  SELECT 'lessonDuration','Duration (min)','label',30
) t
CROSS JOIN sys_industry ind
WHERE ind.code = 'counseling'
ON DUPLICATE KEY UPDATE term_name=VALUES(term_name), status=1, remark=VALUES(remark);

-- ⑥ 心理咨询行业词（code='counseling') 法语
INSERT INTO sys_term (term_key, term_name, language, term_type, industry_id, tenant_id, sort_order, status, remark)
SELECT t.term_key, t.term_name, 'fr', t.term_type, ind.id, 0, t.sort_order, 1, 'counseling industry(fr)'
FROM (
  SELECT 'lessonSystem' term_key,'Système de réservation de conseil psychologique' term_name,'label' term_type,1 sort_order UNION ALL
  SELECT 'course','Programme de conseil','label',2 UNION ALL
  SELECT 'teacher','Conseiller','label',4 UNION ALL
  SELECT 'teacherAlt','Conseiller','label',5 UNION ALL
  SELECT 'student','Client','label',6 UNION ALL
  SELECT 'lesson','Conseil','label',7 UNION ALL
  SELECT 'lessonTime','Heure de conseil','label',8 UNION ALL
  SELECT 'lessonUnit','Durée de conseil','label',9 UNION ALL
  SELECT 'teaching','Fournir un conseil','label',10 UNION ALL
  SELECT 'lessonNumber','N° de conseil','label',11 UNION ALL
  SELECT 'courseName','Programme de conseil','label',12 UNION ALL
  SELECT 'leave','Report','label',13 UNION ALL
  SELECT 'lessonFee','Frais de conseil','label',14 UNION ALL
  SELECT 'content','Contenu','label',15 UNION ALL
  SELECT 'classForm','Format de service','label',16 UNION ALL
  SELECT 'classForm1p1','Conseil individuel','label',17 UNION ALL
  SELECT 'classForm1pN','Conseil de groupe','label',18 UNION ALL
  SELECT 'classForm1p2N','Thérapie de groupe','label',19 UNION ALL
  SELECT 'classLevel','Niveau de conseil','label',20 UNION ALL
  SELECT 'classType','Type de conseil','label',25 UNION ALL
  SELECT 'classType1','Mariage','label',26 UNION ALL
  SELECT 'classType2','Émotion','label',27 UNION ALL
  SELECT 'classType3','Croissance','label',28 UNION ALL
  SELECT 'classType4','Parentalité','label',29 UNION ALL
  SELECT 'lessonDuration','Durée (min)','label',30
) t
CROSS JOIN sys_industry ind
WHERE ind.code = 'counseling'
ON DUPLICATE KEY UPDATE term_name=VALUES(term_name), status=1, remark=VALUES(remark);
