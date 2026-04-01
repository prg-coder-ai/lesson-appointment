package com.reservation.mapper;
//     "com.reservation.mapper.UserMapper"
import com.reservation.entity.User;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;
import java.util.Optional;
/**
 * UserMapper接口，对应user表CRUD操作，匹配UserService中的方法
 */
@Mapper
public interface UserMapper {
    /**
     * 根据手机号查询用户
     * @param phone 手机号
     * @return 用户信息
     */
    // 注解版正确写法（无XML时）
    @Select("select * from user where phone = #{phone}")
    public User selectByPhone(@Param("phone") String phone);
    //public User selectByPhone(@Param("phone") String phone);

    /**
     * 根据邮箱查询用户
     * @param email 邮箱
     * @return 用户信息
     */
    /*Optional<User>*/  public User selectByEmail(@Param("email") String email);

    /**
     * 根据手机号或邮箱查询用户（用于登录）
     * @param account 手机号或邮箱
     * @return 用户信息
     */
    /*Optional<User>*/ public  User selectByPhoneOrEmail(@Param("account") String account);

    /**
     * 根据用户ID查询用户
     * @param userId 用户ID
     * @return 用户信息
     */
    /*Optional<User>*/  User selectById(@Param("userId") String userId);
    List<User> list( ) ;
    /**
     * 插入用户（用于学生、教师注册）
     * @param user 用户实体
     * @return 影响行数
     */
    public  int insert(User user);

    /**
     * 更新用户密码（用于密码重置）
     * @param user 用户实体（含userId和新密码以及其它参数）
     * @return 影响行数
     */
    public int updatePassword(User user);
    public int update(User user);


}
