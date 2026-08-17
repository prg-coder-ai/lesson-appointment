package com.reservation.mapper;
//     "com.reservation.mapper.UserMapper"
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.reservation.entity.User;
import com.reservation.query.UserQueryPage;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.util.List;
import java.util.Map;

/**
 * UserMapper接口，对应user表CRUD操作，匹配UserService中的方法
 * 按项目约定继承 BaseMapper，复用 MyBatis-Plus 内置 insert/selectById/deleteById/updateById 等方法
 */
@Mapper
public interface UserMapper extends BaseMapper<User> {

     @Select("select * from user where account = #{account}")
    User selectByAccount(@Param("account") String account);
    /**
     * 根据手机号查询用户
     * @param phone 手机号
     * @return 用户信息
     */
    // 注解版正确写法（无XML时）
      @Select("select * from user where phone = #{phone}")
     User selectByPhone(@Param("phone") String phone);
    //public User selectByPhone(@Param("phone") String phone);

    /**
     * 根据邮箱查询用户
     * @param email 邮箱
     * @return 用户信息
     */
     @Select("select * from user where email = #{email}")
     User selectByEmail(@Param("email") String email);

    /**
     * 根据手机号或邮箱查询用户（用于登录）
     * @param account 手机号或邮箱
     * @return 用户信息
     */
     @Select("SELECT * FROM user WHERE phone = #{account} OR email = #{account}")
    User selectByPhoneOrEmail(@Param("account") String account);

    /**
     * 根据用户ID查询用户
     * @param userId 用户ID
     * @return 用户信息
     */
     @Select("SELECT * FROM user WHERE user_id = #{userId}")
     User selectById(@Param("userId") String userId);

     
    /**
     * 插入用户（用于学生、教师注册）
     * @param user 用户实体
     * @return 影响行数
     */
     @org.apache.ibatis.annotations.Insert("INSERT INTO user(user_id, account ,name, password, phone, email, role, status) "
            + "VALUES(#{userId},#{account},#{name}, #{password}, #{phone}, #{email}, #{role}, #{status})")
    int insert(User user);

    /**
     * 更新用户密码（用于密码重置）
     * @param user 用户实体（含userId和新密码以及其它参数）
     * @return 影响行数
     */

     @Update("UPDATE user SET password = #{password} WHERE user_id = #{userId}")
    public int updatePassword(@Param("userId") String userId ,@Param("password") String password);

   @Update("UPDATE user SET status = #{status} WHERE user_id = #{userId}")
    public int updateStatus(@Param("userId") String userId ,@Param("status") String status);
/*
    // INSERT_YOUR_CODE
    @Update({
        "<script>",
        "UPDATE user",
        "<set>",
        "  <if test='name != null and name != \"\"'>name = #{name},</if>",
        "  <if test='phone != null and phone != \"\"'>phone = #{phone},</if>",
        "  <if test='email != null and email != \"\"'>email = #{email},</if>",
        "  <if test='role != null and role != \"\"'>role = #{role},</if>",
        "  <if test='status != null and status != \"\"'>status = #{status},</if>",
        "  <if test='account != null and account != \"\"'>account = #{account},</if>",
        // 其他参数按需补充
        "</set>",
        "WHERE user_id = #{userId}",
        "</script>"
    })
    int update(User user);
 */
    
    
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
       public  int selectCountByContion(UserQueryPage  condition);

      @Select("SELECT * FROM user WHERE role = #{role}")
       List<User> listByRole(@Param("role") String role);

// INSERT_YOUR_CODE
    /**
     * 统计截至某一天指定角色的用户数量
     * @param role 用户角色（如 "teacher", "student"）
     * @param until 截止时间（含，java.util.Date）
     * @return 截止该时间点的累计指定角色用户数
     */
    @Select("SELECT COUNT(*) FROM user WHERE role = #{role} AND create_time <= #{until}")
    int countByRoleAtDate(@Param("role") String role, @Param("until") java.util.Date until); 
}
