package src.main.java.com.reservation.mapper;

import src.main.java.com.reservation.entity.PayInfo;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

/**
 * PayInfoMapper接口，对应pay_info表CRUD操作，匹配PayService中的方法
 */
@Mapper
public interface PayInfoMapper {

    /**
     * 根据订单ID查询支付信息（用于支付校验）
     * @param orderId 订单ID
     * @return 支付信息
     */
    PayInfo selectPayInfoByOrderId(@Param("orderId") String orderId);

    /**
     * 插入支付信息（用于发起支付请求）
     * @param payInfo 支付信息实体
     * @return 影响行数
     */
    int insertPayInfo(PayInfo payInfo);

    /**
     * 根据订单ID更新支付信息（用于支付回调后更新参数）
     * @param payInfo 支付信息实体（含orderId、payParams、paySign）
     * @return 影响行数
     */
    int updatePayInfoByOrderId(PayInfo payInfo);
}
