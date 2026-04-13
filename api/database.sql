
CREATE DATABASE IF NOT EXISTS lesson_appointment 
DEFAULT CHARACTER SET utf8mb4   COLLATE utf8mb4_unicode_ci;
USE lesson_appointment;
-- 用户表：存储学生、教师、管理员信息，对应User实体
CREATE TABLE IF NOT EXISTS `user` (
  `user_id` varchar(36) NOT NULL COMMENT '用户唯一标识（UUID）',
  'account' varchar(50) NOT NULL   COMMENT '账号,识别为email或电话‘
  `phone` varchar(50) DEFAULT NULL COMMENT '手机号（11位，符合手机号格式）',
  `email` varchar(50) DEFAULT NULL COMMENT '邮箱（符合邮箱格式）',
  `password` varchar(100) NOT NULL COMMENT '加密后的密码（BCrypt加密，长度8-20位，含字母和数字）',
  `role` varchar(10) NOT NULL COMMENT '角色（student：学生，teacher：教师，admin：管理员）',
  `learn_goal` varchar(200) DEFAULT NULL COMMENT '学生学习目标（学生专属）',
  `language_level` varchar(20) DEFAULT NULL COMMENT '学生语言水平（枚举：入门/进阶/中级/高级/精通，学生专属）',
  `name` varchar(50) DEFAULT NULL COMMENT '教师姓名（教师专属）',
  `qualification` text DEFAULT NULL COMMENT '教师资质图片（Base64编码，教师专属）',
  `language_type` varchar(20) DEFAULT NULL COMMENT '教师教授语言类型（枚举：英语/日语/韩语/法语/德语/西班牙语，教师专属）',
  `status` varchar(10) NOT NULL COMMENT '账号状态（active：激活，inactive：待审核，frozen：冻结）',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `uk_phone` (`phone`) COMMENT '手机号唯一',
  UNIQUE KEY `uk_email` (`email`) COMMENT '邮箱唯一',
  KEY `idx_role` (`role`) COMMENT '角色索引，用于权限查询',
  KEY `idx_status` (`status`) COMMENT '状态索引，用于账号审核、冻结查询'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户表（学生、教师、管理员）';

-- 课程模板表：存储统一的课程模板信息，对应CourseTemplate实体
CREATE TABLE IF NOT EXISTS `course_template` (
  `template_id` varchar(36) NOT NULL COMMENT '模板唯一标识（UUID）',
  `language_type` varchar(20) NOT NULL COMMENT '语言类型（枚举：英语/日语/韩语/法语/德语/西班牙语）',
  `difficulty_level` varchar(20) NOT NULL COMMENT '难度等级（枚举：入门/进阶/中级/高级）',
  `class_fee` decimal(10,2) NOT NULL COMMENT '课时费（≥0，保留2位小数）',
  `class_duration` int NOT NULL COMMENT '课程时长（≥15，15的倍数，单位：分钟）',
  `class_form` varchar(20) NOT NULL COMMENT '课程形式（枚举：一对一/小班课/大班课）',
  `description` varchar(500) NOT NULL COMMENT '课程描述（10-500字）',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`template_id`),
  UNIQUE KEY `uk_lang_level` (`language_type`,`difficulty_level`) COMMENT '语言类型+难度等级唯一，避免重复模板'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='课程模板表';



-- 教师课程表：存储教师基于模板创建的具体课程，对应Course实体
CREATE TABLE IF NOT EXISTS `course` (
  `course_id` varchar(36) NOT NULL COMMENT '课程唯一标识（UUID）',
  `template_id` varchar(36) NOT NULL COMMENT '关联的课程模板ID',
  `course_name` varchar(50) NOT NULL COMMENT '课程名称（2-50字）',
  `content` varchar(1000) NOT NULL COMMENT '教学内容（10-1000字）',
  `feature` varchar(1000) NOT NULL COMMENT '课程特色（10-1000字）',
  `teacher_id` varchar(36) NOT NULL COMMENT '关联的教师ID（对应user表的user_id）',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`course_id`),
  KEY `fk_template_id` (`template_id`) COMMENT '关联课程模板索引',
  KEY `fk_teacher_id` (`teacher_id`) COMMENT '关联教师索引',
  CONSTRAINT `fk_course_template` FOREIGN KEY (`template_id`) REFERENCES `course_template` (`template_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_course_teacher` FOREIGN KEY (`teacher_id`) REFERENCES `user` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='教师课程表';

-- 课程排期表：存储教师课程的具体排期信息，对应Schedule实体
CREATE TABLE IF NOT EXISTS `schedule` (
  `schedule_id` varchar(36) NOT NULL COMMENT '排期唯一标识（UUID）',
  `course_id` varchar(36) NOT NULL COMMENT '关联的教师课程ID',
  `start_time` datetime NOT NULL COMMENT '排期开始时间（格式：YYYY-MM-DD HH:mm:ss）',
  `end_time` datetime NOT NULL COMMENT '排期结束时间（格式：YYYY-MM-DD HH:mm:ss）',

  `repeat_type` tinyint(1) DEFAULT 0 COMMENT '重复类型：0=不重复，1=每天，2=每周，3=每月',
  `repeat_interval` tinyint(1) DEFAULT 1 COMMENT '重复间隔（如每2周一次=2）',
  `repeat_days` VARCHAR(255) COMMENT '重复的星期几：1=周一，2=周二...7=周日，逗号分隔（仅repeat_type=2时有效），type=3时为1-31,当月的那几天',
  `repeat_end_date` DATETIME COMMENT '重复结束时间（精确到秒）',

   `available` varchar(20) NOT NULL DEFAULT 'available' COMMENT '可用状态（available：可预约，unavailable：不可预约,已排满）',
  `status` varchar(20) NOT NULL DEFAULT 'pending' COMMENT '排期状态（pending/active/inactive/frozen/overtime：已结束（自动更新））',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`schedule_id`),
  KEY `fk_course_id` (`course_id`) COMMENT '关联课程索引',
  KEY `idx_start_end_time` (`start_time`,`end_time`) COMMENT '时间索引，用于排期冲突校验',
  KEY `idx_status` (`status`) COMMENT '状态索引，用于可预约排期查询',
  CONSTRAINT `fk_schedule_course` FOREIGN KEY (`course_id`) REFERENCES `course` (`course_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  -- 校验结束时间大于开始时间
  CHECK (`end_time` > `start_time`),
  -- 校验重复排期时repeat_week必填且在1-7之间
  -- CHECK ((`repeat_type` = 2 AND `repeat_week` IS NULL) OR (`is_repeat` = 1 AND `repeat_week` BETWEEN 1 AND 7))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='课程排期表';
 

-- 预约表：存储学生预约课程的信息，对应Booking实体
CREATE TABLE IF NOT EXISTS `booking` (  
  `booking_id` varchar(36) NOT NULL COMMENT '预约唯一标识（UUID）',
  `schedule_id` varchar(36) NOT NULL COMMENT '关联的课程排期ID',
  `student_id` varchar(36) NOT NULL COMMENT '关联的学生ID（对应user表的user_id）',
  `status` varchar(20) NOT NULL DEFAULT 'booked' COMMENT '预约状态（booked：已预约，cancelled：已取消，completed：已完成）',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`booking_id`),
  KEY `fk_schedule_id` (`schedule_id`) COMMENT '关联排期索引',
  KEY `fk_student_id` (`student_id`) COMMENT '关联学生索引',
  KEY `idx_status` (`status`) COMMENT '状态索引，用于预约状态查询',
  CONSTRAINT `fk_booking_schedule` FOREIGN KEY (`schedule_id`) REFERENCES `schedule` (`schedule_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_booking_student` FOREIGN KEY (`student_id`) REFERENCES `user` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='预约表';

-- 课程评价：存储学生对课程的评价信息，对应CourseEvaluation实体
CREATE TABLE IF NOT EXISTS `course_evaluation` (
  `evaluation_id` varchar(36) NOT NULL COMMENT '评价唯一标识（UUID）',
  `course_id` varchar(36) NOT NULL COMMENT '关联的课程ID',
  `booking_id`  varchar(36) NOT NULL COMMENT '关联的预约ID',
  `student_id` varchar(36) NOT NULL COMMENT '关联的学生ID（对应user表的user_id）',
  `rating` int NOT NULL COMMENT '评分（1-5）',
  `comment` varchar(1000) DEFAULT NULL COMMENT '评价内容（最多1000字）',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`evaluation_id`),
  KEY `fk_course_id` (`course_id`) COMMENT '关联课程索引',
  KEY `fk_student_id` (`student_id`) COMMENT '关联学生索引',
  CONSTRAINT `fk_evaluation_course` FOREIGN KEY (`course_id`) REFERENCES `course` (`course_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_evaluation_student` FOREIGN KEY (`student_id`) REFERENCES `user` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CHECK (`rating` BETWEEN 1 AND 5)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='课程评价表'; 

-- 1 课程反馈实体类，对应设计2.4 后续流程-课程反馈功能 ---更新 mysql表结构，增加课程反馈表（course_feedback），满足学生和教师提交课程反馈的需求，包含反馈内容、处理状态和处理内容等字段，支持管理员对反馈进行处理和记录处理结果。
CREATE TABLE IF NOT EXISTS `course_feedback` (
  `feedback_id` varchar(36) NOT NULL COMMENT '反馈唯一标识（UUID）',
  `course_id` varchar(36) NOT NULL COMMENT '关联的课程ID',
  `user_id` varchar(36) NOT NULL COMMENT '关联的用户ID（对应user表的user_id）',
  `content` varchar(1000) DEFAULT NULL COMMENT '反馈内容（最多1000字）',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `handle_id` varchar(36) NOT NULL COMMENT '管理员关联的用户ID（对应user表的user_id）',
  `handle_status` varchar(36) NOT NULL COMMENT '处理状态：0 pending（待处理）/1 handled（已处理）',
  `handle_content` varchar(1000) DEFAULT NULL COMMENT '处理内容（管理员填写）',
  `handle_time` datetime DEFAULT NULL COMMENT '处理时间',

  PRIMARY KEY (`feedback_id`),
  KEY `fk_course_id` (`course_id`) COMMENT '关联课程索引',
  KEY `fk_user_id` (`user_id`) COMMENT '关联用户索引',
  CONSTRAINT `fk_feedback_course` FOREIGN KEY (`course_id`) REFERENCES `course` (`course_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_feedback_user` FOREIGN KEY (`user_id`) REFERENCES `user` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='课程反馈表';

--CourseCheckIn表：存储学生的课程签到信息，对应CourseCheckIn实体，用于确认课程是否按时参加，后续可用于统计学生出勤率等功能
CREATE TABLE IF NOT EXISTS `course_check_in` (
  `check_in_id` varchar(36) NOT NULL COMMENT '签到唯一标识（UUID）',
  `booking_id` varchar(36) NOT NULL COMMENT '关联的预约ID',
  `check_in_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '签到时间',
  PRIMARY KEY (`check_in_id`),
  KEY `fk_booking_id` (`booking_id`) COMMENT '关联预约索引',
  CONSTRAINT `fk_check_in_booking` FOREIGN KEY (`booking_id`) REFERENCES `booking` (`booking_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='课程签到表';

--2 课程评价表：存储学生上完课后的评价信息，对应CourseEvaluation实体
CREATE TABLE IF NOT EXISTS `course_evaluation` (
  `evaluation_id` varchar(36) NOT NULL COMMENT '评价唯一标识（UUID）',
  `booking_id` varchar(36) NOT NULL COMMENT '关联的预约ID（课程结束后可评价）',
  `student_id` varchar(36) NOT NULL COMMENT '评价学生ID（对应user表，角色为student）',
  `teacher_id` varchar(36) NOT NULL COMMENT '被评价教师ID（对应user表，角色为teacher）',
  `course_id` varchar(36) NOT NULL COMMENT '被评价课程ID（对应course表）',
  `score` int NOT NULL COMMENT '评价分数（1-5分，必填）',
  `content` varchar(500) DEFAULT NULL COMMENT '评价内容（0-500字，可选）',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '评价创建时间',
  PRIMARY KEY (`evaluation_id`),
  UNIQUE KEY `uk_booking_id` (`booking_id`) COMMENT '一个预约对应一条评价，避免重复评价',
  KEY `fk_student_id` (`student_id`) COMMENT '关联学生索引，用于学生评价查询',
  KEY `fk_teacher_id` (`teacher_id`) COMMENT '关联教师索引，用于教师评价统计',
  KEY `fk_course_id` (`course_id`) COMMENT '关联课程索引，用于课程评价查询',
  CONSTRAINT `fk_evaluation_booking` FOREIGN KEY (`booking_id`) REFERENCES `booking` (`booking_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_evaluation_student` FOREIGN KEY (`student_id`) REFERENCES `user` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_evaluation_teacher` FOREIGN KEY (`teacher_id`) REFERENCES `user` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_evaluation_course` FOREIGN KEY (`course_id`) REFERENCES `course` (`course_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CHECK (`score` BETWEEN 1 AND 5) -- 校验分数范围
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='课程评价表';
--数据库设计说明： 
--1. 用户表（user）：存储学生、教师、管理员的基本信息，包括手机号、邮箱、密码（加密存储）、角色、学生的学习目标和语言水平、教师的姓名、资质图片和教授语言类型，以及账号状态等。通过角色字段区分不同类型用户，满足权限控制需求。
--2. 课程模板表（course_template）：存储统一的课程模板信息，包括   语言类型、难度等级、课时费、课程时长、课程形式和课程描述等。通过语言类型和难度等级的唯一索引，避免重复创建相同类型的课程模板。
--3. 教师课程表（course）：存储教师基于模板创建的具体课程信息，包括课程名称、教学内容、课程特色和关联的教师ID等。通过外键关联课程模板和教师，确保数据一致性。
--4. 课程排期表（schedule）：存储教师课程的具体排期信息，包括排期开始时间、结束时间、是否重复、重复日期和排期状态等。通过外键关联教师课程，并设置时间索引和状态索引，方便进行排期冲突校验和可预约排期查询。
--5. 预约表（booking）：存储学生预约课程的信息，包括关联的课程排期ID、学生ID和预约状态等。通过外键关联课程排期和学生，并设置状态索引，方便进行预约状态查询。
--6. 课程评价表（course_evaluation）：存储学生对课程的评价信息，包括关联的课程ID、学生ID、评分和评价内容等。通过外键关联课程和学生，并设置订单ID的唯一索引，确保一个订单只能有一条评价记录。
--7. 课程反馈表（course_feedback）：存储学生对课程的反馈信息，包括关联的课程ID、学生ID和反馈内容等。通过外键关联课程和学生，确保数据一致性。
--8. 课程签到表（course_check_in）：存储学生的课程签到信息，包括关联的预约ID和签到时间等。通过外键关联预约，确保数据一致性。
--整体设计遵循了数据库规范化原则，确保数据的完整性和一致性，同时通过合理的索引设计提高查询效率。外键约束确保了数据之间的关联关系，避免了孤立数据的产生。、同时，字段的设计满足了业务需求，并通过注释明确了每个字段的含义和约束条件，方便后续开发和维护。  
--后续可根据业务需求增加订单表（order）来存储学生的订单信息，包括订单状态、支付信息等，以支持完整的预约和支付流程。同时，可以根据需要增加更多的索引来优化查询性能，例如在预约表中增加学生ID和课程ID的复合索引，以加快学生预约记录的查询速度。
---注意：以上SQL脚本仅为数据库设计的初步方案，实际开发中可能需要根据具体业务需求进行调整和优化，例如增加更多的字段、索引或表来满足新的功能需求。同时，在生产环境中部署数据库时，还需要考虑数据安全、备份和恢复等方面的措施。
--数据库使用mysql，字符集设置为utf8mb4以支持多语言字符，表引擎使用InnoDB以支持事务和外键约束。，运行在docker容器中，数据库连接信息（如用户名、密码、端口等）可以通过环境变量进行配置，以便在不同环境中灵活使用。
--数据库名称：lesson_appointment
--数据库版本：MySQL 8.0 
--数据库设计者：doubao
--key：123456
--docker mysql数据库保存在 docker/mysql8/data目录下，数据持久化，容器重启后数据不丢失。
