-- ============================================================================
-- migration-20260902-term-lang-data-exercise.sql  exercise 行业多语言翻译
-- 依赖 migration-20260902-term-lang-data.sql（平台/法律/心理咨询已补）。
-- exercise 为演示行业（ORG05 五人行健身俱乐部），补 en/fr 使健身租户切语言生效。
-- 幂等：ON DUPLICATE KEY UPDATE 仅更新 term_name。
-- ============================================================================

-- ① exercise 行业词（code='exercise') 英语
INSERT INTO sys_term (term_key, term_name, language, term_type, industry_id, tenant_id, sort_order, status, remark)
SELECT t.term_key, t.term_name, 'en', t.term_type, ind.id, 0, t.sort_order, 1, 'exercise industry(en)'
FROM (
  SELECT 'lessonSystem' term_key,'Fitness Coach Booking System' term_name,'label' term_type,1 sort_order UNION ALL
  SELECT 'course','Fitness Program','label',2 UNION ALL
  SELECT 'schedule','Schedule','label',3 UNION ALL
  SELECT 'teacher','Coach','label',4 UNION ALL
  SELECT 'teacherAlt','Coach','label',5 UNION ALL
  SELECT 'student','Trainee','label',6 UNION ALL
  SELECT 'lesson','Training Session','label',7 UNION ALL
  SELECT 'lessonTime','Booking Time','label',8 UNION ALL
  SELECT 'lessonUnit','Training Duration','label',9 UNION ALL
  SELECT 'teaching','Practice','label',10 UNION ALL
  SELECT 'lessonNumber','Session No.','label',11 UNION ALL
  SELECT 'courseName','Program Name','label',12 UNION ALL
  SELECT 'leave','Reschedule','label',13 UNION ALL
  SELECT 'lessonFee','Session Fee','label',14 UNION ALL
  SELECT 'content','Training Content','label',15 UNION ALL
  SELECT 'classForm','Service Format','label',16 UNION ALL
  SELECT 'classForm1p1','1-on-1','label',17 UNION ALL
  SELECT 'classForm1pN','Small Group','label',18 UNION ALL
  SELECT 'classForm1p2N','Special Training','label',19 UNION ALL
  SELECT 'classLevel','Level','label',20 UNION ALL
  SELECT 'classType','Fitness Type','label',25 UNION ALL
  SELECT 'classType1','Strength','label',26 UNION ALL
  SELECT 'classType2','Agility','label',27 UNION ALL
  SELECT 'classType3','Muscle','label',28 UNION ALL
  SELECT 'classType4','Explosiveness','label',29 UNION ALL
  SELECT 'lessonDuration','Duration (min)','label',30
) t
CROSS JOIN sys_industry ind
WHERE ind.code = 'exercise'
ON DUPLICATE KEY UPDATE term_name=VALUES(term_name), status=1, remark=VALUES(remark);

-- ② exercise 行业词（code='exercise') 法语
INSERT INTO sys_term (term_key, term_name, language, term_type, industry_id, tenant_id, sort_order, status, remark)
SELECT t.term_key, t.term_name, 'fr', t.term_type, ind.id, 0, t.sort_order, 1, 'exercise industry(fr)'
FROM (
  SELECT 'lessonSystem' term_key,'Système de réservation de coach de fitness' term_name,'label' term_type,1 sort_order UNION ALL
  SELECT 'course','Programme de fitness','label',2 UNION ALL
  SELECT 'schedule','Horaire','label',3 UNION ALL
  SELECT 'teacher','Coach','label',4 UNION ALL
  SELECT 'teacherAlt','Coach','label',5 UNION ALL
  SELECT 'student','Participant','label',6 UNION ALL
  SELECT 'lesson','Séance d''entraînement','label',7 UNION ALL
  SELECT 'lessonTime','Heure de réservation','label',8 UNION ALL
  SELECT 'lessonUnit','Durée d''entraînement','label',9 UNION ALL
  SELECT 'teaching','Pratique','label',10 UNION ALL
  SELECT 'lessonNumber','N° de séance','label',11 UNION ALL
  SELECT 'courseName','Nom du programme','label',12 UNION ALL
  SELECT 'leave','Report','label',13 UNION ALL
  SELECT 'lessonFee','Frais de séance','label',14 UNION ALL
  SELECT 'content','Contenu d''entraînement','label',15 UNION ALL
  SELECT 'classForm','Format de service','label',16 UNION ALL
  SELECT 'classForm1p1','Individuel','label',17 UNION ALL
  SELECT 'classForm1pN','Petit groupe','label',18 UNION ALL
  SELECT 'classForm1p2N','Entraînement spécialisé','label',19 UNION ALL
  SELECT 'classLevel','Niveau','label',20 UNION ALL
  SELECT 'classType','Type de fitness','label',25 UNION ALL
  SELECT 'classType1','Force','label',26 UNION ALL
  SELECT 'classType2','Agilité','label',27 UNION ALL
  SELECT 'classType3','Muscle','label',28 UNION ALL
  SELECT 'classType4','Explosivité','label',29 UNION ALL
  SELECT 'lessonDuration','Durée (min)','label',30
) t
CROSS JOIN sys_industry ind
WHERE ind.code = 'exercise'
ON DUPLICATE KEY UPDATE term_name=VALUES(term_name), status=1, remark=VALUES(remark);
