-- 用户表：存储学生、教师、管理员信息，对应User实体
CREATE TABLE `user` (
  `user_id` varchar(36) NOT NULL COMMENT '用户唯一标识（UUID）',
  `phone` varchar(11) NOT NULL COMMENT '手机号（11位，符合手机号格式）',
  `email` varchar(50) NOT NULL COMMENT '邮箱（符合邮箱格式）',
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
CREATE TABLE `course_template` (
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
CREATE TABLE `course` (
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
CREATE TABLE `schedule` (
  `schedule_id` varchar(36) NOT NULL COMMENT '排期唯一标识（UUID）',
  `course_id` varchar(36) NOT NULL COMMENT '关联的教师课程ID',
  `start_time` datetime NOT NULL COMMENT '排期开始时间（格式：YYYY-MM-DD HH:mm:ss）',
  `end_time` datetime NOT NULL COMMENT '排期结束时间（格式：YYYY-MM-DD HH:mm:ss）',
  `is_repeat` tinyint(1) NOT NULL COMMENT '是否重复（0：不重复，1：重复）',
  `repeat_week` int DEFAULT NULL COMMENT '重复日期（1-7，对应周一至周日，is_repeat=1时必填）',
  `status` varchar(20) NOT NULL DEFAULT 'available' COMMENT '排期状态（available：可预约，unavailable：不可预约）',
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
  CHECK ((`is_repeat` = 0 AND `repeat_week` IS NULL) OR (`is_repeat` = 1 AND `repeat_week` BETWEEN 1 AND 7))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='课程排期表';

-- 预约表：存储学生预约课程的信息，对应Booking实体
CREATE TABLE `booking` (  
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
CREATE TABLE `course_evaluation` (
  `evaluation_id` varchar(36) NOT NULL COMMENT '评价唯一标识（UUID）',
  `course_id` varchar(36) NOT NULL COMMENT '关联的课程ID',
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
--订单表：存储学生的订单信息，对应Order实体
CREATE TABLE `order` (
  `order_id` varchar(36) NOT NULL COMMENT '订单唯一标识（UUID）',
  `booking_id` varchar(36) NOT NULL COMMENT '关联的预约ID',
  `amount` decimal(10,2) NOT NULL COMMENT '订单金额（≥0，保留2位小数）',
  `status` varchar(20) NOT NULL DEFAULT 'pending' COMMENT '订单状态（pending：待支付，paid：已支付，cancelled：已取消）',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`order_id`),
  KEY `fk_booking_id` (`booking_id`) COMMENT '关联预约索引',
  KEY `idx_status` (`status`) COMMENT '状态索引，用于订单状态查询',
  CONSTRAINT `fk_order_booking` FOREIGN KEY (`booking_id`) REFERENCES `booking` (`booking_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='订单表';

-- 课程反馈实体类，对应设计2.4 后续流程-课程反馈功能
CREATE TABLE `course_feedback` (
  `feedback_id` varchar(36) NOT NULL COMMENT '反馈唯一标识（UUID）',
  `course_id` varchar(36) NOT NULL COMMENT '关联的课程ID',
  `student_id` varchar(36) NOT NULL COMMENT '关联的学生ID（对应user表的user_id）',
  `content` varchar(1000) DEFAULT NULL COMMENT '反馈内容（最多1000字）',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`feedback_id`),
  KEY `fk_course_id` (`course_id`) COMMENT '关联课程索引',
  KEY `fk_student_id` (`student_id`) COMMENT '关联学生索引',
  CONSTRAINT `fk_feedback_course` FOREIGN KEY (`course_id`) REFERENCES `course` (`course_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_feedback_student` FOREIGN KEY (`student_id`) REFERENCES `user` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='课程反馈表';

--CourseCheckIn表：存储学生的课程签到信息，对应CourseCheckIn实体
CREATE TABLE `course_check_in` (
  `check_in_id` varchar(36) NOT NULL COMMENT '签到唯一标识（UUID）',
  `booking_id` varchar(36) NOT NULL COMMENT '关联的预约ID',
  `check_in_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '签到时间',
  PRIMARY KEY (`check_in_id`),
  KEY `fk_booking_id` (`booking_id`) COMMENT '关联预约索引',
  CONSTRAINT `fk_check_in_booking` FOREIGN KEY (`booking_id`) REFERENCES `booking` (`booking_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='课程签到表';

-- 课程评价表：存储学生上完课后的评价信息，对应CourseEvaluation实体
CREATE TABLE `course_evaluation` (
  `evaluation_id` varchar(36) NOT NULL COMMENT '评价唯一标识（UUID）',
  `order_id` varchar(36) NOT NULL COMMENT '关联的订单ID（对应order表，仅订单状态为completed的可评价）',
  `student_id` varchar(36) NOT NULL COMMENT '评价学生ID（对应user表，角色为student）',
  `teacher_id` varchar(36) NOT NULL COMMENT '被评价教师ID（对应user表，角色为teacher）',
  `course_id` varchar(36) NOT NULL COMMENT '被评价课程ID（对应course表）',
  `score` int NOT NULL COMMENT '评价分数（1-5分，必填）',
  `content` varchar(500) DEFAULT NULL COMMENT '评价内容（0-500字，可选）',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '评价创建时间',
  PRIMARY KEY (`evaluation_id`),
  UNIQUE KEY `uk_order_id` (`order_id`) COMMENT '一个订单对应一条评价，避免重复评价',
  KEY `fk_student_id` (`student_id`) COMMENT '关联学生索引，用于学生评价查询',
  KEY `fk_teacher_id` (`teacher_id`) COMMENT '关联教师索引，用于教师评价统计',
  KEY `fk_course_id` (`course_id`) COMMENT '关联课程索引，用于课程评价查询',
  CONSTRAINT `fk_evaluation_order` FOREIGN KEY (`order_id`) REFERENCES `order` (`order_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_evaluation_student` FOREIGN KEY (`student_id`) REFERENCES `user` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_evaluation_teacher` FOREIGN KEY (`teacher_id`) REFERENCES `user` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_evaluation_course` FOREIGN KEY (`course_id`) REFERENCES `course` (`course_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CHECK (`score` BETWEEN 1 AND 5) -- 校验分数范围
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='课程评价表';
