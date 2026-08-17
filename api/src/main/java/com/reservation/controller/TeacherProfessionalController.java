package com.reservation.controller;

import com.reservation.common.PageResult;
import com.reservation.common.Result;
import com.reservation.dto.TeacherProfessionalDTO;
import com.reservation.query.TeacherProfessionalQueryPage;
import com.reservation.service.TeacherProfessionalService;
import com.reservation.vo.TeacherProfessionalDetailVO;
import com.reservation.vo.TeacherProfessionalListVO;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseBody;
import org.springframework.web.bind.annotation.RestController;

/**
 * 教师职业信息维护控制器
 * 对应 notes §3 接口定义
 * 基础路径：/teacher/professional
 * 所有接口均需登录（不在 SecurityConfig 白名单），业务层可用 PermissionCheck.checkAdmin 加角色校验
 */
@RestController
@RequestMapping("/teacher/professional")
public class TeacherProfessionalController {

    @Autowired
    private TeacherProfessionalService teacherProfessionalService;

    // 1. 添加教师职业信息
    @PostMapping("/addTeacherProfessionalInfo")
    @ResponseBody
    public Result<Object> addTeacherProfessionalInfo(@RequestBody TeacherProfessionalDTO dto) {
        return teacherProfessionalService.addTeacherProfessionalInfo(dto);
    }

    // 2. 删除教师职业信息（按 teacherProfessionalId）
    @PostMapping("/deleteTeacherProfessionalInfo")
    @ResponseBody
    public Result<Object> deleteTeacherProfessionalInfo(@RequestParam("teacherProfessionalId") String teacherProfessionalId) {
        return teacherProfessionalService.deleteTeacherProfessionalInfo(teacherProfessionalId);
    }

    // 3. 修改教师职业信息
    @PostMapping("/updateTeacherProfessionalInfo")
    @ResponseBody
    public Result<Object> updateTeacherProfessionalInfo(@RequestBody TeacherProfessionalDTO dto) {
        return teacherProfessionalService.updateTeacherProfessionalInfo(dto);
    }

    // 4. 查询教师职业信息（单条，按 teacherProfessionalId 或 teacherId）
    @GetMapping("/queryTeacherProfessionalInfo")
    @ResponseBody
    public Result<TeacherProfessionalDetailVO> queryTeacherProfessionalInfo(
            @RequestParam(value = "teacherProfessionalId", required = false) String teacherProfessionalId,
            @RequestParam(value = "teacherId", required = false) String teacherId) {
        return teacherProfessionalService.queryTeacherProfessionalInfo(teacherProfessionalId, teacherId);
    }

    // 5. 分页查询教师职业信息列表
    @GetMapping("/listByPage")
    @ResponseBody
    public Result<PageResult<TeacherProfessionalListVO>> listByPage(
            TeacherProfessionalQueryPage query,
            @RequestHeader("Authorization") String token) {
        return teacherProfessionalService.listByPage(query);
    }
}
