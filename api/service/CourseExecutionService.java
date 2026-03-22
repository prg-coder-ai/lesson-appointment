package com.language.reservation.service;

import com.language.reservation.entity.*;
import com.language.reservation.exception.BusinessException;
import com.language.reservation.exception.ResourceNotFoundException;
import com.language.reservation.mapper.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.text.ParseException;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * 课程执行与后续流程服务层，对应设计2.4 课程执行与后续流程模块所有接口的业务逻辑
 * 涵盖签到、评价、反馈等功能，严格遵循权限校验和业务规则
 */
@Service
public class CourseExecutionService {

    @Autowired
    private CourseCheckInMapper checkInMapper;
    @Autowired
    private CourseEvaluationMapper evaluationMapper;
    @Autowired
    private CourseFeedbackMapper feedbackMapper;
    @Autowired
    private ReservationOrderMapper orderMapper;
    @Autowired
    private ScheduleMapper scheduleMapper;
    @Autowired
    private CourseMapper courseMapper;

    // 日期格式化工具，对应通用校验规则-时间格式
    private static final SimpleDateFormat DATE_FORMAT = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss");

    /**
     * 学生签到，对应设计2.4 签到功能
     */
    @Transactional
    public void studentCheckIn(CourseCheckIn checkIn) {
        // 1. 校验订单是否存在且已支付
        ReservationOrder order = orderMapper.selectOrderById(checkIn.getOrderId());
        if (order == null) {
            throw new ResourceNotFoundException("订单不存在，无法签到");
        }
        if (!"paid".equals(order.getOrderStatus())) {
            throw new BusinessException("订单未支付，无法签到");
        }

        // 2. 校验排期是否存在
        Schedule schedule = scheduleMapper.selectScheduleById(checkIn.getScheduleId());
        if (schedule == null) {
            throw new ResourceNotFoundException("排期不存在，无法签到");
        }

        // 3. 校验签到时间（课程开始后30分钟内可签到，对应设计2.4 签到规则）
        try {
            Date startTime = DATE_FORMAT.parse(schedule.getStartTime());
            Date currentTime = new Date();
            Date endCheckInTime = new Date(startTime.getTime() + 30 * 60 * 1000);
            if (currentTime.before(startTime)) {
                throw new BusinessException("课程未开始，无法签到");
            }
            if (currentTime.after(endCheckInTime)) {
                throw new BusinessException("签到时间已过，无法签到");
            }
        } catch (ParseException e) {
            throw new BusinessException("时间格式错误，无法签到");
        }

        // 4. 校验是否已签到（避免重复签到）
        if (checkInMapper.selectByOrderAndStudent(checkIn.getOrderId(), checkIn.getStudentId()) != null) {
            throw new BusinessException("您已完成签到，无需重复操作");
        }

        // 5. 补充教师ID（从课程中获取）
        Course course = courseMapper.selectCourseById(order.getCourseId());
        checkIn.setTeacherId(course.getTeacherId());

        // 6. 生成签到ID，设置签到状态和时间
        String checkInId = UUID.randomUUID().toString();
        checkIn.setCheckInId(checkInId);
        checkIn.setCheckInStatus("checked");
        checkIn.setCheckInTime(DATE_FORMAT.format(new Date()));

        // 7. 插入签到记录到数据库
        checkInMapper.insertCheckIn(checkIn);
    }

    /**
     * 教师查询签到列表，对应设计2.4 签到查询功能
     */
    public List<CourseCheckIn> getCheckInList(String scheduleId) {
        // 校验排期是否存在
        if (scheduleMapper.selectScheduleById(scheduleId) == null) {
            throw new ResourceNotFoundException("排期不存在");
        }
        // 查询该排期下的所有签到记录
        return checkInMapper.selectByScheduleId(scheduleId);
    }

    /**
     * 学生提交课程评价，对应设计2.4 评价功能
     */
    @Transactional
    public Map<String, String> addEvaluation(CourseEvaluation evaluation) {
        // 1. 校验订单是否存在且已支付、课程已结束
        ReservationOrder order = orderMapper.selectOrderById(evaluation.getOrderId());
        if (order == null) {
            throw new ResourceNotFoundException("订单不存在，无法提交评价");
        }
        if (!"paid".equals(order.getOrderStatus())) {
            throw new BusinessException("订单未支付，无法提交评价");
        }

        // 2. 校验课程是否已结束（仅课程结束后可评价，对应设计2.4 评价规则）
        Schedule schedule = scheduleMapper.selectScheduleById(order.getScheduleId());
        try {
            Date endTime = DATE_FORMAT.parse(schedule.getEndTime());
            Date currentTime = new Date();
            if (currentTime.before(endTime)) {
                throw new BusinessException("课程未结束，无法提交评价");
            }
        } catch (ParseException e) {
            throw new BusinessException("时间格式错误，无法提交评价");
        }

        // 3. 校验是否已提交评价（避免重复评价）
        if (evaluationMapper.selectByOrderAndStudent(evaluation.getOrderId(), evaluation.getStudentId()) != null) {
            throw new BusinessException("您已提交评价，无需重复操作");
        }

        // 4. 校验评价分数（1-5分，对应设计2.4 评价规则）
        if (evaluation.getScore() < 1 || evaluation.getScore() > 5) {
            throw new BusinessException("评价分数需为1-5分");
        }

        // 5. 生成评价ID，设置评价时间
        String evaluationId = UUID.randomUUID().toString();
        evaluation.setEvaluationId(evaluationId);
        evaluation.setCreateTime(DATE_FORMAT.format(new Date()));

        // 6. 插入评价到数据库
        evaluationMapper.insertEvaluation(evaluation);

        // 7. 组装返回数据
        Map<String, String> resultMap = Map.of("evaluationId", evaluationId);
        return resultMap;
    }

    /**
     * 教师查询评价列表，对应设计2.4 评价查询功能
     */
    public List<CourseEvaluation> getEvaluationList(String teacherId) {
        // 查询该教师收到的所有评价
        return evaluationMapper.selectByTeacherId(teacherId);
    }

    /**
     * 提交课程反馈，对应设计2.4 反馈功能
     */
    @Transactional
    public Map<String, String> addFeedback(CourseFeedback feedback) {
        // 1. 校验订单是否存在
        ReservationOrder order = orderMapper.selectOrderById(feedback.getOrderId());
        if (order == null) {
            throw new ResourceNotFoundException("订单不存在，无法提交反馈");
        }

        // 2. 校验提交人角色（仅学生/教师可提交）
        if (!"student".equals(feedback.getSubmitterRole()) && !"teacher".equals(feedback.getSubmitterRole())) {
            throw new BusinessException("仅学生和教师可提交反馈");
        }

        // 3. 生成反馈ID，设置默认状态和反馈时间
        String feedbackId = UUID.randomUUID().toString();
        feedback.setFeedbackId(feedbackId);
        feedback.setHandleStatus("pending");
        feedback.setCreateTime(DATE_FORMAT.format(new Date()));

        // 4. 插入反馈到数据库
        feedbackMapper.insertFeedback(feedback);

        // 5. 组装返回数据
        Map<String, String> resultMap = Map.of("feedbackId", feedbackId);
        return resultMap;
    }

    /**
     * 管理员处理反馈，对应设计2.4 反馈处理功能
     */
    @Transactional
    public void handleFeedback(String feedbackId, String handleContent) {
        // 1. 校验反馈是否存在
        CourseFeedback feedback = feedbackMapper.selectFeedbackById(feedbackId);
        if (feedback == null) {
            throw new ResourceNotFoundException("反馈不存在，无法处理");
        }

        // 2. 校验反馈状态（仅待处理反馈可处理）
        if (!"pending".equals(feedback.getHandleStatus())) {
            throw new BusinessException("反馈已处理，无需重复操作");
        }

        // 3. 更新反馈处理状态、内容和时间
        feedback.setHandleStatus("handled");
        feedback.setHandleContent(handleContent);
        feedback.setHandleTime(DATE_FORMAT.format(new Date()));
        feedbackMapper.updateFeedback(feedback);
    }

    /**
     * 管理员查询反馈列表，对应设计2.4 反馈查询功能
     */
    public List<CourseFeedback> getFeedbackList(String handleStatus) {
        // 按处理状态查询反馈（handleStatus为空则查询所有）
        return feedbackMapper.selectFeedbackList(handleStatus);
    }

    /**
     * 校验排期归属（辅助方法），对应设计2.4 权限控制
     */
    public void checkScheduleOwner(String scheduleId, String teacherId) {
        Schedule schedule = scheduleMapper.selectScheduleById(scheduleId);
        if (schedule == null) {
            throw new ResourceNotFoundException("排期不存在");
        }
        Course course = courseMapper.selectCourseById(schedule.getCourseId());
        if (!course.getTeacherId().equals(teacherId)) {
            throw    new BusinessException("您无权操作该排期");
        } else {// 校验通过，教师是该排期所属课程的教师
            return;  
    }
    }
}