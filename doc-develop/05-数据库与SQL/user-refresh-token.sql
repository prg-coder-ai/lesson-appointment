CREATE TABLE if not exists  `user_refresh_token` (
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