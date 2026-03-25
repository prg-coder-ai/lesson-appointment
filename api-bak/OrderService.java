package src.main.java.com.reservation.service;

import src.main.java.com.reservation.entity.*;
import src.main.java.com.reservation.exception.BusinessException;
import src.main.java.com.reservation.exception.ResourceNotFoundException;
import src.main.java.com.reservation.mapper.CourseMapper;
import src.main.java.com.reservation.mapper.OrderMapper;
import src.main.java.com.reservation.mapper.ScheduleMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.text.ParseException;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * 学生预约模块服务层，对应设计2.2.3 学生预约模块所有接口的业务逻辑，严格贴合校验规则和功能说明
 */
@Service
public class OrderService {

    @Autowired
    private CourseMapper courseMapper;
    @Autowired
    private ScheduleMapper scheduleMapper;
    @Autowired
    private OrderMapper orderMapper;

    // 日期格式化工具（对应通用校验规则-时间参数）
    private static final SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss");
    // 订单取消时间限制：课程开始前1小时（对应设计2.2.3 专属校验规则）
    private static final long CANCEL_LIMIT = 3600000; // 毫秒

    /**
     * 学生查询课程列表，对应设计2.2.3 接口：/api/v1/course/student/list
     */
    public List<Map<String, Object>> getCourseList(CourseQueryParam queryParam) {
        // 校验时间参数（若有），对应通用校验规则-时间参数
        if (queryParam.getStartTime() != null && queryParam.getEndTime() != null) {
            try {
                Date start = sdf.parse(queryParam.getStartTime());
                Date end = sdf.parse(queryParam.getEndTime());
                if (start.after(end)) {
                    throw new BusinessException("开始时间不能晚于结束时间");
                }
            } catch (ParseException e) {
                throw new BusinessException("时间格式错误，需为YYYY-MM-DD HH:mm:ss");
            }
        }
        // 调用mapper查询课程列表，关联课程、教师、排期信息（对应设计2.2.3 功能说明）
        return courseMapper.selectCourseListByStudent(queryParam);
    }

    /**
     * 学生创建预约订单，对应设计2.2.3 接口：/api/v1/order/create
     */
    @Transactional
    public Map<String, String> createOrder(String courseId, String studentId) {
        // 1. 校验排期是否存在（对应通用校验规则-ID类参数）
        Course schedule = CourseMapper.selectById(courseId);
        if (schedule == null) {
            throw new ResourceNotFoundException("排期不存在");
        }
        // 2. 校验排期状态是否可用（对应设计2.2.3 专属校验规则）
        if (!"available".equals(schedule.getStatus())) {
            throw new BusinessException("该排期已不可预约");
        }
        // 3. 校验排期时间是否有效（开始时间不能早于当前时间）
        try {
            Date startTime = sdf.parse(schedule.getStartTime());
            if (startTime.before(new Date())) {
                throw new BusinessException("排期已过期，无法预约");
            }
        } catch (ParseException e) {
            throw new BusinessException("排期时间格式错误");
        }
        // 4. 校验学生是否已预约该排期（避免重复预约，对应设计2.2.3 业务逻辑）
        Integer count = orderMapper.countByStudentAndSchedule(studentId, scheduleId);
        if (count != null && count > 0) {
            throw new BusinessException("您已预约该排期，无需重复预约");
        }
        // 5. 查询课程模板，获取课时费（订单金额=课时费）
        Map<String, BigDecimal> courseFeeMap = courseMapper.selectClassFeeByScheduleId(scheduleId);
        if (courseFeeMap == null || courseFeeMap.get("classFee") == null) {
            throw new ResourceNotFoundException("课程信息异常，无法创建订单");
        }
        // 6. 创建订单
        Order order = new Order();
        order.setOrderId(UUID.randomUUID().toString()); // 生成唯一订单ID
        order.setScheduleId(scheduleId);
        order.setStudentId(studentId);
        order.setOrderAmount(courseFeeMap.get("classFee"));
        order.setOrderStatus("pending_pay"); // 初始状态：待支付
        order.setCreateTime(new Date());
        // 7. 插入订单数据
        orderMapper.insert(order);
        // 8. 组装返回数据（仅返回orderId，对应设计2.2.3 预约接口返回数据）
        Map<String, String> resultMap = new HashMap<>();
        resultMap.put("orderId", order.getOrderId());
        return resultMap;
    }

    /**
     * 学生支付订单，对应设计2.2.3 接口：/api/v1/pay/process
     */
    @Transactional
    public Map<String, String> processPay(PayInfo payInfo, String studentId) {
        // 1. 校验订单是否存在（对应通用校验规则-ID类参数）
        Order order = orderMapper.selectById(payInfo.getOrderId());
        if (order == null) {
            throw new ResourceNotFoundException("订单不存在");
        }
        // 2. 校验订单归属（仅订单所属学生可支付）
        if (!studentId.equals(order.getStudentId())) {
            throw new BusinessException("您无权支付该订单");
        }
        // 3. 校验订单状态（仅待支付订单可支付）
        if (!"pending_pay".equals(order.getOrderStatus())) {
            throw new BusinessException("订单状态异常，无法支付（仅待支付订单可支付）");
        }
        // 4. 校验支付方式（对应设计2.2.3 专属校验规则）
        if (!"wechat".equals(payInfo.getPayType()) && !"alipay".equals(payInfo.getPayType()) && !"balance".equals(payInfo.getPayType())) {
            throw new BusinessException("支付方式错误，仅支持微信、支付宝、余额支付");
        }
        // 5. 校验支付签名（模拟校验，实际需对接第三方支付接口校验签名，对应设计2.3 安全设计）
        if (!checkPaySign(payInfo)) {
            throw new BusinessException("支付签名无效，支付失败");
        }
        // 6. 模拟支付处理（实际需调用第三方支付接口/余额支付逻辑）
        boolean paySuccess = true; // 模拟支付成功
        if (!paySuccess) {
            throw new BusinessException("支付失败，请重试");
        }
        // 7. 更新订单状态
        order.setOrderStatus("paid");
        order.setPayTime(new Date());
        order.setPayType(payInfo.getPayType());
        orderMapper.updateById(order);
        // 8. 更新排期状态（一对一课程支付后，排期设为不可用；小班/大班课减少可预约名额，此处简化处理）
        Schedule schedule = scheduleMapper.selectById(order.getScheduleId());
        if ("一对一".equals(courseMapper.selectClassFormByScheduleId(schedule.getCourseId()))) {
            schedule.setStatus("unavailable");
            scheduleMapper.updateById(schedule);
        }
        // 9. 组装返回数据（返回支付状态和订单ID，对应设计2.2.3 支付接口返回数据）
        Map<String, String> resultMap = new HashMap<>();
        resultMap.put("orderId", order.getOrderId());
        resultMap.put("payStatus", "paid");
        resultMap.put("message", "支付成功");
        return resultMap;
    }

    /**
     * 学生查询个人预约订单列表，对应设计2.2.3 接口：/api/v1/order/student/list
     */
    public List<Order> getStudentOrderList(String studentId, String orderStatus) {
        // 若传入订单状态，校验状态合法性（对应设计2.2.3 专属校验规则）
        if (orderStatus != null && !"pending_pay".equals(orderStatus) && !"paid".equals(orderStatus) && !"cancelled".equals(orderStatus) && !"completed".equals(orderStatus)) {
            throw new BusinessException("订单状态错误，可选状态：pending_pay、paid、cancelled、completed");
        }
        // 调用mapper查询订单列表，按创建时间倒序排列
        return orderMapper.selectByStudentIdAndStatus(studentId, orderStatus);
    }

    /**
     * 学生取消预约订单，对应设计2.2.3 接口：/api/v1/order/cancel/student
     */
    @Transactional
    public void cancelOrder(String studentId, String orderId) {
        // 1. 校验订单是否存在
        Order order = orderMapper.selectById(orderId);
        if (order == null) {
            throw new ResourceNotFoundException("订单不存在");
        }
        // 2. 校验订单归属
        if (!studentId.equals(order.getStudentId())) {
            throw new BusinessException("您无权取消该订单");
        }
        // 3. 校验订单状态（仅待支付、已支付订单可取消，已取消、已完成订单不可取消）
        if ("cancelled".equals(order.getOrderStatus())) {
            throw new BusinessException("订单已取消，无需重复操作");
        }
        if ("completed".equals(order.getOrderStatus())) {
            throw new BusinessException("课程已完成，无法取消订单");
        }
        // 4. 校验取消时间（课程开始前1小时可取消，对应设计2.2.3 专属校验规则）
        Schedule schedule = scheduleMapper.selectById(order.getScheduleId());
        try {
            Date startTime = sdf.parse(schedule.getStartTime());
            Date now = new Date();
            if (startTime.getTime() - now.getTime() < CANCEL_LIMIT) {
                throw new BusinessException("距离课程开始不足1小时，无法取消订单");
            }
        } catch (ParseException e) {
            throw new BusinessException("排期时间格式错误，无法取消订单");
        }
        // 5. 更新订单状态为已取消
        order.setOrderStatus("cancelled");
        orderMapper.updateById(order);
        // 6. 恢复排期状态（一对一课程取消后，排期恢复可用；小班/大班课增加可预约名额，此处简化处理）
        if ("paid".equals(order.getOrderStatus()) && "一对一".equals(courseMapper.selectClassFormByScheduleId(schedule.getCourseId()))) {
            schedule.setStatus("available");
            scheduleMapper.updateById(schedule);
        }
        // 7. 模拟退款逻辑（已支付订单取消后需退款，实际需对接第三方支付接口）
        if ("paid".equals(order.getOrderStatus())) {
            // 此处省略退款逻辑，实际项目中需实现退款并记录退款信息
        }
    }

    /**
     * 学生查询订单详情，对应设计2.2.3 接口：/api/v1/order/student/detail
     */
    public Map<String, Object> getOrderDetail(String studentId, String orderId) {
        // 1. 校验订单是否存在
        Order order = orderMapper.selectById(orderId);
        if (order == null) {
            throw new ResourceNotFoundException("订单不存在");
        }
        // 2. 校验订单归属
        if (!studentId.equals(order.getStudentId())) {
            throw new BusinessException("您无权查看该订单详情");
        }
        // 3. 查询订单关联信息（课程、排期、教师）
        Map<String, Object> detailMap = orderMapper.selectOrderDetailById(orderId);
        if (detailMap == null) {
            throw new ResourceNotFoundException("订单详情异常");
        }
        // 4. 格式化时间参数（便于前端展示）
        if (detailMap.get("createTime") != null) {
            detailMap.put("createTime", sdf.format((Date) detailMap.get("createTime")));
        }
        if (detailMap.get("payTime") != null) {
            detailMap.put("payTime", sdf.format((Date) detailMap.get("payTime")));
        }
        return detailMap;
    }

    /**
     * 校验支付签名（模拟，对应设计2.3 安全设计-支付签名校验）
     */
    private boolean checkPaySign(PayInfo payInfo) {
        // 实际逻辑：根据支付参数、密钥生成签名，与传入的paySign对比
        // 此处简化处理，模拟签名校验通过（实际项目需严格实现）
        String secret = "language_pay_secret_2026";
        String generateSign = payInfo.getOrderId() + payInfo.getPayType() + secret;
        // 模拟签名加密（实际需用MD5/SHA256加密）
        return generateSign.hashCode() + "".equals(payInfo.getPaySign());
    }
}