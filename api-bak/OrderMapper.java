package src.main.java.com.reservation.mapper;

import src.main.java.com.reservation.entity.Order;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/**
 * OrderMapper接口，对应order表CRUD操作，匹配OrderService中的方法
 */
@Mapper
public interface OrderMapper {

    /**
     * 根据订单ID查询订单
     * @param orderId 订单ID
     * @return 订单信息
     */
    Order selectOrderById(@Param("orderId") String orderId);

    /**
     * 根据学生ID查询订单列表（用于学生查看自己的订单）
     * @param studentId 学生ID
     * @param orderStatus 订单状态（可为null，查询所有状态）
     * @return 订单列表
     */
    List<Order> selectOrderByStudentId(@Param("studentId") String studentId, @Param("orderStatus") String orderStatus);

    /**
     * 根据排期ID查询订单（校验排期是否已被预约）
     * @param scheduleId 排期ID
     * @return 订单信息（存在则说明已被预约）
     */
    Order selectOrderByScheduleId(@Param("scheduleId") String scheduleId);

    /**
     * 插入订单（用于学生预约课程）
     * @param order 订单实体
     * @return 影响行数
     */
    int insertOrder(Order order);

    /**
     * 更新订单状态（用于支付、取消订单）
     * @param order 订单实体（含orderId、orderStatus，支付时需含payTime、payType）
     * @return 影响行数
     */
    int updateOrderStatus(Order order);
}
