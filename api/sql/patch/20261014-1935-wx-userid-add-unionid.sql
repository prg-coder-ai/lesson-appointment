-- wx_userid 增加 wx_unionid 列（P1：跨端统一身份）
--
-- 背景：openid 在小程序 / 网站应用（PC 扫码）/ 公众号（H5）三个微信应用里互不相同，
-- 只有三者都绑定到同一个微信开放平台账号时，unionid 才一致。浏览器侧登录/绑定
-- 与小程序打通的前提，就是把 unionid 落库并以它为第一匹配键。
--
-- 匹配规则（WxUseridService.findByIdentity）：
--   1) 有 unionid → 先按 uk_wx_unionid 匹配；
--   2) 未命中 → 按 uk_wx_openid 匹配（兼容纯小程序存量数据）；
--   3) 都未命中 → 未绑定（1001 或引导注册）。
--
-- 注意：
--   · uk_wx_unionid 允许 NULL 多行是 MySQL 唯一索引的正常语义，存量无 unionid 行不受影响；
--   · 存量行的 unionid 不做批量回填，而是在下次登录/绑定时按同账号幂等路径自动补齐；
--   · 本 patch 执行后需同步刷新 api/sql/schema 基线（ddl-align 守卫按行首 CREATE TABLE 解析基线）。

ALTER TABLE `wx_userid`
  ADD COLUMN `wx_unionid` varchar(64) NULL COMMENT '跨端统一身份（开放平台 unionid，缺失回退 openid）' AFTER `wx_openid`,
  ADD UNIQUE KEY `uk_wx_unionid` (`wx_unionid`);
