package src.main.java.com.reservation.mapper;

import src.main.java.com.reservation.entity.User;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

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
    User selectByPhone(@Param("phone") String phone);

    /**
     * 根据邮箱查询用户
     * @param email 邮箱
     * @return 用户信息
     */
    User selectByEmail(@Param("email") String email);

    /**
     * 根据手机号或邮箱查询用户（用于登录）
     * @param account 手机号或邮箱
     * @return 用户信息
     */
    User selectByPhoneOrEmail(@Param("account") String account);

    /**
     * 根据用户ID查询用户
     * @param userId 用户ID
     * @return 用户信息
     */
    User selectById(@Param("userId") String userId);

    /**
     * 插入用户（用于学生、教师注册）
     * @param user 用户实体
     * @return 影响行数
     */
    int insert(User user);

    /**
     * 更新用户密码（用于密码重置）
     * @param user 用户实体（含userId和新密码）
     * @return 影响行数
     */
    int updatePassword(User user);
}
