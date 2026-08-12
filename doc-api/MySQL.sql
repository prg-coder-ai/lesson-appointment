create database lesson_appointment ;
use lesson_appointment;

-- 用户表：存储学生、教师、管理员信息，对应User实体
CREATE TABLE if not exists  user (
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
 

-- 1.2 课程模板表（course_template）- 对应CourseTemplate实体
 
-- 课程模板表：存储统一的课程模板信息，对应CourseTemplate实体
CREATE TABLE if not exists  course_template (
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
 

-- 1.3 教师课程表（course）- 对应Course实体

-- 教师课程表：存储教师基于模板创建的具体课程，对应Course实体
CREATE TABLE if not exists course (
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
 

-- 1.4 课程排期表（schedule）- 对应Schedule实体

-- 课程排期表：存储教师课程的具体排期信息，对应Schedule实体
CREATE TABLE if not exists schedule (
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
 

 CREATE TABLE if not exists  user_refresh_token (
  id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键',
  user_id  varchar(36) NOT NULL COMMENT '登录用户ID',
  refresh_token VARCHAR(512) NOT NULL COMMENT '刷新凭证',
  expire_time DATETIME NOT NULL COMMENT '过期时间',
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_user_id (user_id),
  INDEX idx_refresh_token (refresh_token)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT '用户刷新user_refresh_tokenToken持久化表'; 


create table if not exists booking (
    id varchar(36) not null primary key,
    schedule_id varchar(36),
    student_id varchar(36) not null,
    teacher_id varchar(36) not null,
    status varchar(10) not null default 'PENDING',
    -- 待处理、已处理、已取消
    create_time datetime not null default current_timestamp,
    update_time datetime not null default current_timestamp on update current_timestamp
);
create table if not exists appointment (
      id int auto_increment comment '唯一编号'
        primary key,
    booking_id varchar(36)                  null comment '预约id',
    class_index int         default 1        null comment '课时序号',
    appointmemnt_datetime datetime       default null comment '排期预约中的一个课时时间',
    last_datetime datetime       default null comment '可能修改前的日期时间',
    status varchar(16) default 'active' not null comment '本预约时间的状态:active生效/noted已发通知1/2/cancelled/s-cancelling/t-cancelling/completed已完成（自动移到历史库中，实时库中删除，降低数据量）/已改期changed'
 
 ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT '预约时间列表';
    