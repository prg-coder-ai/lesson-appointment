
-- saas改造，未原有数据库表添加 租户id字段 
-- SOURCE H:/2026/lesson-appointment/api/migration-20260830-saas-add_tenantid.sql;
  USE lesson_appointment;

ALTER TABLE `user`
  ADD COLUMN `tenant_id` BIGINT NOT NULL DEFAULT 0 COMMENT '租户ID（0=平台/历史单租户数据）' AFTER `user_id`,
  ADD KEY `idx_tenant_id` (`tenant_id`); 
 
 ALTER  TABLE `course_template`
    ADD COLUMN `tenant_id` BIGINT NOT NULL DEFAULT 0 COMMENT '租户ID（0=平台/历史单租户数据）' AFTER `template_id`,
  ADD KEY `idx_tenant_id` (`tenant_id`);


  ALTER  TABLE `course`
ADD COLUMN `tenant_id` BIGINT NOT NULL DEFAULT 0 COMMENT '租户ID（0=平台/历史单租户数据）' AFTER `course_id`,
  ADD KEY `idx_tenant_id` (`tenant_id`);

ALTER  TABLE `course_schedule`
ADD COLUMN `tenant_id` BIGINT NOT NULL DEFAULT 0 COMMENT '租户ID（0=平台/历史单租户数据）' AFTER `schedule_id`,
  ADD KEY `idx_tenant_id` (`tenant_id`);

ALTER TABLE `booking`
ADD COLUMN `tenant_id` BIGINT NOT NULL DEFAULT 0 COMMENT '租户ID（0=平台/历史单租户数据）' AFTER `booking_id`,
  ADD KEY `idx_tenant_id` (`tenant_id`);

 ALTER TABLE  `appointment`
  ADD COLUMN `tenant_id` BIGINT NOT NULL DEFAULT 0 COMMENT '租户ID（0=平台/历史单租户数据）' AFTER `id`,
  ADD KEY `idx_tenant_id` (`tenant_id`);  
  

ALTER  TABLE   `course_check_in`
  ADD COLUMN `tenant_id` BIGINT NOT NULL DEFAULT 0 COMMENT '租户ID（0=平台/历史单租户数据）' AFTER `check_in_id`,
  ADD KEY `idx_tenant_id` (`tenant_id`);

   ALTER  TABLE `course_evaluation`
    ADD COLUMN `tenant_id` BIGINT NOT NULL DEFAULT 0 COMMENT '租户ID（0=平台/历史单租户数据）' AFTER `evaluation_id`,
  ADD KEY `idx_tenant_id` (`tenant_id`);

   ALTER  TABLE `course_feedback`
    ADD COLUMN `tenant_id` BIGINT NOT NULL DEFAULT 0 COMMENT '租户ID（0=平台/历史单租户数据）' AFTER `feedback_id`,
  ADD KEY `idx_tenant_id` (`tenant_id`);   
   

   ALTER  TABLE `teacher_available_time`
    ADD COLUMN `tenant_id` BIGINT NOT NULL DEFAULT 0 COMMENT '租户ID（0=平台/历史单租户数据）' AFTER `available_id`,
  ADD KEY `idx_tenant_id` (`tenant_id`);

   ALTER  TABLE `teacher_professional`
    ADD COLUMN `tenant_id` BIGINT NOT NULL DEFAULT 0 COMMENT '租户ID（0=平台/历史单租户数据）' AFTER `teacher_professional_id`,
  ADD KEY `idx_tenant_id` (`tenant_id`);

   ALTER  TABLE `teacher_published_profile`
    ADD COLUMN `tenant_id` BIGINT NOT NULL DEFAULT 0 COMMENT '租户ID（0=平台/历史单租户数据）' AFTER `published_profile_id`,
  ADD KEY `idx_tenant_id` (`tenant_id`);


ALTER  TABLE `teacher_certificate`
    ADD COLUMN `tenant_id` BIGINT NOT NULL DEFAULT 0 COMMENT '租户ID（0=平台/历史单租户数据）' AFTER `certificate_id`,
  ADD KEY `idx_tenant_id` (`tenant_id`);

 ALTER  TABLE `audit_log`
    ADD COLUMN `tenant_id` BIGINT NOT NULL DEFAULT 0 COMMENT '租户ID（0=平台/历史单租户数据）' AFTER `id`,
  ADD KEY `idx_tenant_id` (`tenant_id`);
 