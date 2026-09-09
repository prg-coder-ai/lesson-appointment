package com.reservation.mapper;
//     "com.reservation.mapper.UserMapper"
import com.baomidou.mybatisplus.annotation.InterceptorIgnore;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.reservation.entity.User;
import com.reservation.query.UserQueryPage;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.util.List;
import java.util.Map;

/**  account--不再加密
 * UserMapper接口，对应user表CRUD操作，匹配UserService中的方法
 * 按项目约定继承 BaseMapper，复用 MyBatis-Plus 内置 insert/selectById/deleteById/updateById 等方法
 */
@Mapper
public interface UserMapper extends BaseMapper<User> {

    // account 不再加密（纯明文存储），登录/查重按账号精确匹配即可。
    // 登录场景还不知道用户属于哪个租户，必须跳过租户插件过滤，归属由 UserService.login 显式校验。
    // 注意：必须【精确匹配】账号(account = ?)，不能 LIKE 模糊——否则同租户下存在两个含相同子串的账号
    // （如 T002 与 T002@def.com）时，selectOne 会因命中 2 条而抛 TooManyResultsException。
    @InterceptorIgnore(tenantLine = "true")
   @Select("select * from user where account = #{account} AND tenant_id = #{tenantId}")
   User getUserByAccount( @Param("account") String account, @Param("tenantId") Long tenantId);

    /**
     * 绑定用户到指定租户（存量数据迁移：迁移前创建的用户 tenant_id 为 0）
     * 同样需跳过租户过滤，否则会被拼上兜底条件而更新不到目标用户
     */
    @InterceptorIgnore(tenantLine = "true")
    @Update("UPDATE user SET tenant_id = #{tenantId} WHERE user_id = #{userId}")
    int bindTenant(@Param("userId") String userId, @Param("tenantId") Long tenantId);
    /**
      * 根据手机号查询用户（一对多：同一手机号可对应多个账号/用户）
      * @param hmac 手机号的 HMAC 搜索索引
      * @param plain 明文手机号（兼容旧数据）
      * @return 命中该手机号的用户列表（按业务约定可返回多条）
      */
      @Select("select * from user where phone LIKE CONCAT(#{hmac}, ':%') OR phone = #{plain}")
    List<User> selectByPhone(@Param("hmac") String hmac, @Param("plain") String plain);

    /**
      * 根据邮箱查询用户（一对多：同一邮箱可对应多个账号/用户）
      * @param hmac 邮箱的 HMAC 搜索索引
      * @param plain 明文邮箱（兼容旧数据）
      * @return 命中该邮箱的用户列表（按业务约定可返回多条）
      */
        @Select("select * from user where email LIKE CONCAT(#{hmac}, ':%') OR email = #{plain}")
      List<User> selectByEmail(@Param("hmac") String hmac, @Param("plain") String plain);

    /**
      * 根据手机号或邮箱查询用户（用于登录，一对多：同一联系方式可对应多个账号/用户）
      * @param hmac 手机号或邮箱的 HMAC 搜索索引
      * @param plain 明文账号（兼容旧数据）
      * @return 命中该手机号/邮箱的用户列表（按业务约定可返回多条）
      */
      @Select("SELECT * FROM user WHERE phone LIKE CONCAT(#{hmac}, ':%') OR email LIKE CONCAT(#{hmac}, ':%') OR phone = #{plain} OR email = #{plain}")
    List<User> selectByPhoneOrEmail(@Param("hmac") String hmac, @Param("plain") String plain);

    /**
     * 根据用户ID查询用户
     * @param userId 用户ID
     * @return 用户信息 baseMapper已实现
     */ 
    /**
     * 更新用户密码（用于密码重置）
     * @param user 用户实体（含userId和新密码以及其它参数）
     * @return 影响行数
     */

     @Update("UPDATE user SET password = #{password} WHERE user_id = #{userId}")
    public int updatePassword(@Param("userId") String userId ,@Param("password") String password);

   @Update("UPDATE user SET status = #{status} WHERE user_id = #{userId}")
    public int updateStatus(@Param("userId") String userId ,@Param("status") String status); 

    /**
     * 更新用户基本资料（姓名/手机号/邮箱/状态）。
     *
     * 注意两点：
     * 1) 只更新传入的非空字段，未传的保持原值 —— 便于前端做局部修改；
     * 2) 不含 account：账号是登录标识，一旦生成不允许通过本接口修改；
     * 3) 不在此处加密 phone/email/name —— 加密属于业务层职责（UserService 统一调用
     *    cryptUtil.encryptWithIndex），Mapper 只负责原样落库，避免加解密逻辑分散。
     *
     * 租户隔离：user 表不在 MyBatisPlusConfig.IGNORE_TABLES 中，
     * TenantLineInnerInterceptor 会自动在 WHERE 后追加 tenant_id 条件。
     *
     * @return 影响行数
     */
    @Update("<script>"
          + "UPDATE user "
          + "<set>"
          + "  <if test='name != null'>name = #{name},</if>"
          + "  <if test='phone != null'>phone = #{phone},</if>"
          + "  <if test='email != null'>email = #{email},</if>"
          + "  <if test='status != null'>status = #{status},</if>"
          + "  update_time = NOW()"
          + "</set>"
          + "WHERE user_id = #{userId}"
          + "</script>")
    int updateUserInfo(@Param("userId") String userId,
                       @Param("name") String name,
                       @Param("phone") String phone,
                       @Param("email") String email,
                       @Param("status") String status);
    /**
     * 统计截至某一天指定角色的用户数量
     * @param role 用户角色（如 "teacher", "student"）
     * @param until 截止时间（含，java.util.Date）
     * @return 截止该时间点的累计指定角色用户数
     */
    @Select("SELECT COUNT(*) FROM user WHERE role = #{role} AND create_time <= #{until}")
    int countByRoleAtDate(@Param("role") String role, @Param("until") java.util.Date until);

    public List<User> listByCondition(Map<String, Object> condition);

    public List<User> listByConditionPage(UserQueryPage condition);

    public List<User> listByConditionAll(UserQueryPage condition);

    int selectCountByContion(UserQueryPage condition);

      @Select("SELECT * FROM user WHERE role = #{role}")
       List<User> listByRole(@Param("role") String role);

    /**
     * 忽略租户插件过滤，按角色查询全量用户（用于消息中心接收人解析：跨租户查平台管理员 / 指定租户管理员）。
     * 注意：返回结果仍含 tenant_id，调用方需按业务租户自行过滤。
     */
    @InterceptorIgnore(tenantLine = "true")
    @Select("SELECT * FROM user WHERE role = #{role}")
    List<User> listByRoleIgnoreTenant(@Param("role") String role);
 
    
}
