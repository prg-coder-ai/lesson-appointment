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
      * 根据手机号查询用户
      * @param hmac 手机号的 HMAC 搜索索引
      * @param plain 明文手机号（兼容旧数据）
      * @return 用户信息
      */
      @Select("select * from user where phone LIKE CONCAT(#{hmac}, ':%') OR phone = #{plain}")
    List<User> selectByPhone(@Param("hmac") String hmac, @Param("plain") String plain);

    /**
      * 根据邮箱查询用户
      * @param hmac 邮箱的 HMAC 搜索索引
      * @param plain 明文邮箱（兼容旧数据）
      * @return 用户信息
      */
        @Select("select * from user where email LIKE CONCAT(#{hmac}, ':%') OR email = #{plain}")
      List<User> selectByEmail(@Param("hmac") String hmac, @Param("plain") String plain);

    /**
      * 根据手机号或邮箱查询用户（用于登录）
      * @param hmac 手机号或邮箱的 HMAC 搜索索引
      * @param plain 明文账号（兼容旧数据）
      * @return 用户信息
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
     * 统计截至某一天指定角色的用户数量
     * @param role 用户角色（如 "teacher", "student"）
     * @param until 截止时间（含，java.util.Date）
     * @return 截止该时间点的累计指定角色用户数
     */
    @Select("SELECT COUNT(*) FROM user WHERE role = #{role} AND create_time <= #{until}")
    int countByRoleAtDate(@Param("role") String role, @Param("until") java.util.Date until); 
    
        /** listByCondition暂时报错
         * 根据条件查询用户列表
         * 支持条件字段：userId, role, status, orgId, name, email, phone, account
         * @param condition 查询条件
         * @return 用户列表 
        // 语法问题：
        // 1. MyBatis 的 @Select 注解不支持 XML 元素（如 <where>、<if>）。
        // 2. 若需动态 SQL（如 if、where），必须把 SQL 写在 Mapper.xml (推荐做法) 或用 @SelectProvider。
        // 3. 如果坚持用注解，则只能写静态 SQL，无法 in-line 动态条件。

        // 推荐写法（此接口必须在 UserMapper.xml 里用 <select> + <where> + <if> 实现），否则此注解会报错。
 */   
      
       public  List<User> listByCondition(Map<String, Object>  condition); 
       public  List<User> listByConditionPage(UserQueryPage  condition);
       public  List<User> listByConditionAll(UserQueryPage  condition);
       public  int selectCountByContion(UserQueryPage  condition);

      @Select("SELECT * FROM user WHERE role = #{role}")
       List<User> listByRole(@Param("role") String role);
 
    
}
