package src.main.java.com.reservation.controller;

import jakarta.validation.constraints.NotBlank;
import  src.main.java.com.reservation.common.Result;
import src.main.java.com.reservation.entity.CourseCheckIn;
import  src.main.java.com.reservation.entity.CourseEvaluation;
import  src.main.java.com.reservation.entity.CourseFeedback;
import  src.main.java.com.reservation.service.CourseExecutionService;
import  src.main.java.com.reservation.utils.PermissionCheck;
import  src.main.java.com.reservation.exception .BusinessException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 课程执行与后续流程控制器，对应设计2.4 课程执行与后续流程模块所有接口
 * 接口权限：学生、教师、管理员分别对应不同操作权限
 */
@RestController
@RequestMapping("/course/execution")
@Validated
public class CourseExecutionController {

    @Autowired
    private CourseExecutionService executionService;
    @Autowired
    private PermissionCheck permissionCheck;

    /**
     * 学生签到接口，对应设计2.4 接口：/api/v1/course/execution/checkIn（学生权限）
     * 功能：学生在课程开始后进行签到
     */
    @PostMapping("/checkIn")
    public Result<Void> studentCheckIn(
            @Validated @RequestBody CourseCheckIn checkIn,
            @RequestHeader("Authorization") String token) {
        // 权限校验：仅学生可操作
        permissionCheck.checkStudent(token);
        // 校验签到归属当前学生
        String studentId = permissionCheck.getUserIdFromToken(token);
        if (!studentId.equals(checkIn.getStudentId())) {
            throw new BusinessException("您无权为他人签到");
        }
        // 调用服务层完成签到
        executionService.studentCheckIn(checkIn);
        return Result.success(null, "签到成功");
    }

    /**
     * 教师查询签到列表接口，对应设计2.4 接口：/api/v1/course/execution/checkIn/list（教师权限）
     * 功能：教师查询自己课程的学生签到情况
     */
    @GetMapping("/checkIn/list")
    public Result<List<CourseCheckIn>> getCheckInList(
            @NotBlank(message = "排期ID不能为空") String scheduleId,
            @RequestHeader("Authorization") String token) {
        // 权限校验：仅教师可操作
        permissionCheck.checkTeacher(token);
        // 校验排期归属当前教师
        String teacherId = permissionCheck.getUserIdFromToken(token);
        executionService.checkScheduleOwner(scheduleId, teacherId);
        // 调用服务层查询签到列表
        List<CourseCheckIn> checkInList = executionService.getCheckInList(scheduleId);
        return Result.success(checkInList, "签到列表查询成功");
    }

    /**
     * 学生提交课程评价接口，对应设计2.4 接口：/api/v1/course/execution/evaluation/add（学生权限）
     * 功能：学生在课程结束后提交评价
     */
    @PostMapping("/evaluation/add")
    public Result<Map<String, String>> addEvaluation(
            @Validated @RequestBody CourseEvaluation evaluation,
            @RequestHeader("Authorization") String token) {
        // 权限校验：仅学生可操作
        permissionCheck.checkStudent(token);
        // 校验评价归属当前学生
        String studentId = permissionCheck.getUserIdFromToken(token);
        if (!studentId.equals(evaluation.getStudentId())) {
            throw new BusinessException("您无权为他人提交评价");
        }
        // 调用服务层提交评价
        Map<String, String> resultMap = executionService.addEvaluation(evaluation);
        return Result.success(resultMap, "评价提交成功，感谢您的反馈");
    }

    /**
     * 教师查询评价列表接口，对应设计2.4 接口：/api/v1/course/execution/evaluation/list（教师权限）
     * 功能：教师查询自己收到的所有课程评价
     */
    @GetMapping("/evaluation/list")
    public Result<List<CourseEvaluation>> getEvaluationList(
            @RequestHeader("Authorization") String token) {
        // 权限校验：仅教师可操作
        permissionCheck.checkTeacher(token);
        // 获取当前教师ID
        String teacherId = permissionCheck.getUserIdFromToken(token);
        // 调用服务层查询评价列表
        List<CourseEvaluation> evaluationList = executionService.getEvaluationList(teacherId);
        return Result.success(evaluationList, "评价列表查询成功");
    }

    /**
     * 提交课程反馈接口，对应设计2.4 接口：/api/v1/course/execution/feedback/add（学生/教师权限）
     * 功能：学生或教师提交课程相关反馈
     */
    @PostMapping("/feedback/add")
    public Result<Map<String, String>> addFeedback(
            @Validated @RequestBody CourseFeedback feedback,
            @RequestHeader("Authorization") String token) {
        // 权限校验：学生或教师可操作
      /*  String role = JwtUtil.getRoleFromToken(token);
        if (!"student".equals(role) && !"teacher".equals(role)) {
            throw new BusinessException("仅学生和教师可提交反馈");
        }*/
        // 校验反馈归属当前提交人
        String submitterId = permissionCheck.getUserIdFromToken(token);
       /* if (!submitterId.equals(feedback.getSubmitterId())) {
            throw new BusinessException("您无权提交他人反馈");
        }*/
        // 调用服务层提交反馈
        Map<String, String> resultMap = executionService.addFeedback(feedback);
        return Result.success(resultMap, "反馈提交成功，我们将尽快处理");
    }

    /**
     * 管理员处理反馈接口，对应设计2.4 接口：/api/v1/course/execution/feedback/handle（管理员权限）
     * 功能：管理员处理学生/教师提交的反馈
     */
    @PostMapping("/feedback/handle")
    public Result<Void> handleFeedback(
            @NotBlank(message = "反馈ID不能为空") String feedbackId,
            @NotBlank(message = "处理内容不能为空") String handleContent,
            @RequestHeader("Authorization") String token) {
        // 权限校验：仅管理员可操作
        permissionCheck.checkAdmin(token);
        // 调用服务层处理反馈
        executionService.handleFeedback(feedbackId, handleContent);
        return Result.success(null, "反馈处理成功");
    }

    /**
     * 管理员查询反馈列表接口，对应设计2.4 接口：/api/v1/course/execution/feedback/list（管理员权限）
     * 功能：管理员查询所有反馈，支持按处理状态筛选
     */
    @GetMapping("/feedback/list")
    public Result<List<CourseFeedback>> getFeedbackList(
            String handleStatus,
            @RequestHeader("Authorization") String token) {
        // 权限校验：仅管理员可操作
        permissionCheck.checkAdmin(token);
        // 调用服务层查询反馈列表
        List<CourseFeedback> feedbackList = executionService.getFeedbackList(handleStatus);
        return Result.success(feedbackList, "反馈列表查询成功");
    }
}
