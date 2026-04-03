package com.reservation.mapper;
//     "com.reservation.mapper.UserMapper"
import com.reservation.entity.User;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.util.List;
import java.util.Map;
import java.util.Optional;
/**
 * UserMapper接口，对应user表CRUD操作，匹配UserService中的方法
 */
@Mapper
public interface UserMapper {

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
    /*Optional<User>*/  User selectById(@Param("userId") String userId);
    @Select("SELECT * FROM user WHERE user_id = #{userId}")
    List<User> list( ) ;
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
    public int updatePassword(User user);

     @Update("UPDATE user SET password = #{password} WHERE user_id = #{userId}")
    public int update(User user);

        // INSERT_YOUR_CODE
        /**
         * 根据条件查询用户列表
         * 支持条件字段：userId, role, status, orgId, name, email, phone, account
         * @param condition 查询条件
         * @return 用户列表
         *   "  <if test='condition.orgId != null'>",
            "    AND org_id LIKE CONCAT('%', #{condition.orgId}, '%')",
            "  </if>",
         */
        // INSERT_YOUR_CODE
        @org.apache.ibatis.annotations.Select({ 
            "SELECT * FROM user",
            "<where>",
            "  <if test='condition.userId != null'>",
            "    AND user_id LIKE CONCAT('%', #{condition.userId}, '%')",
            "  </if>",
            "  <if test='condition.role != null'>",
            "    AND role = #{condition.role}",
            "  </if>",
            "  <if test='condition.status != null'>",
            "    AND status LIKE CONCAT('%', #{condition.status}, '%')",
            "  </if>",
          
            "  <if test='condition.name != null'>",
            "    AND name LIKE CONCAT('%', #{condition.name}, '%')",
            "  </if>",
            "  <if test='condition.email != null'>",
            "    AND email LIKE CONCAT('%', #{condition.email}, '%')",
            "  </if>",
            "  <if test='condition.phone != null'>",
            "    AND phone LIKE CONCAT('%', #{condition.phone}, '%')",
            "  </if>",
            "  <if test='condition.account != null'>",
            "    AND account LIKE CONCAT('%', #{condition.account}, '%')",
            "  </if>",
            "</where>" 
        })
        List<User> listByCondition(@Param("condition") Map<String, Object> condition);
 
}
