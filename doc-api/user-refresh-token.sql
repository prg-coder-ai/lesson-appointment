CREATE TABLE `user_refresh_token` (
  id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键',
  user_id  varchar(36) NOT NULL COMMENT '登录用户ID',
  refresh_token VARCHAR(512) NOT NULL COMMENT '刷新凭证',
  expire_time DATETIME NOT NULL COMMENT '过期时间',
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_user_id (user_id),
  INDEX idx_refresh_token (refresh_token)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT '用户刷新user_refresh_tokenToken持久化表'; 