-- ============================================================
-- message_center 消息中心微服务建表脚本 (MySQL 8.0+)
-- 微服务隔离：独立 schema。JWT/AES 与主系统共享密钥域；本服务不直连主库用户表，
-- sender/recipient 以 userId/tenantId 业务标识承载（由上游鉴权保证合法）。
-- ============================================================
CREATE DATABASE IF NOT EXISTS message_center DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
USE message_center;

-- 1) 消息分类表（三级分类：level1=按发起角色，level2=业务场景；优先级由消息级 priority 承载）
DROP TABLE IF EXISTS msg_category;
CREATE TABLE msg_category (
  category_id      BIGINT       NOT NULL COMMENT '主键(雪花)',
  tenant_id        BIGINT       NOT NULL DEFAULT 0 COMMENT '租户id; 0=平台预置(全局可用)',
  category_code    VARCHAR(64)  NOT NULL COMMENT '分类编码(租户内唯一)',
  category_name    VARCHAR(128) NOT NULL COMMENT '分类名称',
  category_level   TINYINT      NOT NULL DEFAULT 1 COMMENT '层级:1=发起角色维度 2=业务场景维度',
  parent_id        BIGINT       NOT NULL DEFAULT 0 COMMENT '父级id,0=顶层',
  sort             INT          NOT NULL DEFAULT 0 COMMENT '排序',
  is_system_predefined TINYINT  NOT NULL DEFAULT 0 COMMENT '1=系统预置(不可删)',
  is_deleted       TINYINT      NOT NULL DEFAULT 0 COMMENT '逻辑删除',
  create_time      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (category_id),
  UNIQUE KEY uk_code_tenant (category_code, tenant_id)
) ENGINE=InnoDB COMMENT='消息分类(三级体系)';

-- 2) 消息模板表
DROP TABLE IF EXISTS msg_template;
CREATE TABLE msg_template (
  template_id       BIGINT       NOT NULL COMMENT '主键(雪花)',
  tenant_id         BIGINT       NOT NULL DEFAULT 0,
  template_code     VARCHAR(64)  NOT NULL COMMENT '模板编码(租户内唯一)',
  template_name     VARCHAR(128) NOT NULL,
  category_code     VARCHAR(64)  NULL COMMENT '关联消息分类编码',
  title_template    VARCHAR(255) NULL COMMENT '标题模板,支持{占位}',
  content_template  TEXT         NULL COMMENT '内容模板,支持{占位}(AES加密)',
  sender_type       VARCHAR(32)  NOT NULL DEFAULT 'admin' COMMENT '发送方角色类型',
  priority          VARCHAR(16)  NOT NULL DEFAULT 'MEDIUM' COMMENT 'HIGH/MEDIUM/LOW',
  is_enabled        TINYINT      NOT NULL DEFAULT 1,
  is_deleted        TINYINT      NOT NULL DEFAULT 0,
  create_time       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (template_id),
  KEY idx_tenant (tenant_id)
) ENGINE=InnoDB COMMENT='消息模板';

-- 3) 消息主表
DROP TABLE IF EXISTS msg_message;
CREATE TABLE msg_message (
  message_id      BIGINT       NOT NULL COMMENT '主键(雪花)',
  tenant_id       BIGINT       NOT NULL DEFAULT 0 COMMENT '租户id',
  sender_id       VARCHAR(64)  NOT NULL COMMENT '发送方用户id(或system)',
  sender_type     VARCHAR(32)  NOT NULL COMMENT '发送方类型 teacher/admin/platform_admin/student/system',
  category_code   VARCHAR(64)  NULL COMMENT '消息分类编码(场景)',
  sender_dim_code VARCHAR(64)  NULL COMMENT '一级维度:发起角色(来源归集)',
  priority        VARCHAR(16)  NOT NULL DEFAULT 'MEDIUM' COMMENT 'HIGH紧急/MEDIUM普通/LOW低',
  title           VARCHAR(255) NOT NULL COMMENT '消息标题(AES加密)',
  content         TEXT         NULL COMMENT '消息内容(AES加密)',
  payload         TEXT         NULL COMMENT '附加元数据JSON,如跳转地址(AES加密)',
  is_broadcast    TINYINT      NOT NULL DEFAULT 0 COMMENT '是否广播(全体/角色投递)',
  status          VARCHAR(16)  NOT NULL DEFAULT 'sent' COMMENT 'sent/withdrawn(已撤回)',
  send_time       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  create_time     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (message_id),
  KEY idx_sender (sender_id, sender_type),
  KEY idx_tenant_time (tenant_id, send_time)
) ENGINE=InnoDB COMMENT='消息主表';

-- 4) 用户消息收件箱索引表（写扩散）
DROP TABLE IF EXISTS msg_inbox;
CREATE TABLE msg_inbox (
  id           BIGINT      NOT NULL AUTO_INCREMENT COMMENT '自增主键(物理存储)',
  tenant_id    BIGINT      NOT NULL DEFAULT 0,
  user_id      VARCHAR(64) NOT NULL COMMENT '接收用户id',
  message_id   BIGINT      NOT NULL COMMENT '消息id',
  is_read      TINYINT     NOT NULL DEFAULT 0 COMMENT '0未读 1已读',
  read_time    DATETIME    NULL,
  is_starred   TINYINT     NOT NULL DEFAULT 0 COMMENT '0未收藏 1已收藏',
  is_deleted   TINYINT     NOT NULL DEFAULT 0 COMMENT '0正常 1回收站(逻辑删除)',
  folder       VARCHAR(32) NOT NULL DEFAULT 'inbox' COMMENT 'inbox/starred/trash',
  created_at   DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_user_msg (user_id, message_id),
  KEY idx_user_time (user_id, created_at)
) ENGINE=InnoDB COMMENT='用户消息收件箱索引';

-- 5) 消息投递状态表
DROP TABLE IF EXISTS msg_delivery;
CREATE TABLE msg_delivery (
  delivery_id     BIGINT      NOT NULL COMMENT '主键(雪花)',
  tenant_id       BIGINT      NOT NULL DEFAULT 0,
  message_id      BIGINT      NOT NULL,
  user_id         VARCHAR(64) NOT NULL COMMENT '接收用户id',
  delivery_status TINYINT     NOT NULL DEFAULT 0 COMMENT '0未投递 1已投递 2已确认接收 3投递失败',
  channel         VARCHAR(32) NOT NULL DEFAULT 'rest' COMMENT 'rest/sse',
  retry_count     INT         NOT NULL DEFAULT 0,
  delivery_time   DATETIME    NULL,
  ack_time        DATETIME    NULL,
  create_time     DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time     DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (delivery_id),
  KEY idx_msg_user (message_id, user_id)
) ENGINE=InnoDB COMMENT='消息投递状态';

-- 6) 消息批处理任务表
DROP TABLE IF EXISTS msg_batch_task;
CREATE TABLE msg_batch_task (
  task_id           BIGINT      NOT NULL COMMENT '主键(雪花)',
  tenant_id         BIGINT      NOT NULL DEFAULT 0,
  task_name         VARCHAR(200) NULL,
  message_id        BIGINT      NOT NULL,
  sender_id         VARCHAR(64) NOT NULL,
  total_recipients  INT         NOT NULL DEFAULT 0,
  processed_count   INT         NOT NULL DEFAULT 0,
  success_count     INT         NOT NULL DEFAULT 0,
  failed_count      INT         NOT NULL DEFAULT 0,
  status            TINYINT     NOT NULL DEFAULT 0 COMMENT '0待执行 1执行中 2成功 3失败',
  execute_time      DATETIME    NULL,
  finish_time       DATETIME    NULL,
  create_time       DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time       DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (task_id),
  KEY idx_message (message_id)
) ENGINE=InnoDB COMMENT='消息批处理任务';

-- ============ 平台预置分类(level1 发起角色维度) ============
INSERT INTO msg_category (category_id, tenant_id, category_code, category_name, category_level, parent_id, sort, is_system_predefined) VALUES
 (1001,0,'SENDER_TEACHER_ADMIN','教师/管理员消息',1,0,1,1),
 (1002,0,'SENDER_STUDENT','学生消息',1,0,2,1),
 (1003,0,'SENDER_SYSTEM','系统通知',1,0,3,1);

-- 业务场景(level2)，挂到对应 level1 下
INSERT INTO msg_category (category_id, tenant_id, category_code, category_name, category_level, parent_id, sort, is_system_predefined) VALUES
 (2001,0,'HOMEWORK_NOTICE','作业通知',2,1001,1,1),
 (2002,0,'CLASS_NOTICE','上课/课堂调整通知',2,1001,2,1),
 (2003,0,'LEAVE_NOTICE','请假审批通知',2,1002,1,1),
 (2004,0,'RESOURCE_NOTICE','资源/报修/咨询',2,1002,2,1),
 (2005,0,'SYSTEM_SCHEDULE','排期/签到/截止提醒',2,1003,1,1);
