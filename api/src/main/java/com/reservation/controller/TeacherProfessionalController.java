package com.reservation.controller;

import com.reservation.common.PageResult;
import com.reservation.common.Result;
import com.reservation.dto.TeacherProfessionalDTO;
import com.reservation.query.TeacherProfessionalQueryPage;
import com.reservation.service.TeacherProfessionalService;
import com.reservation.utils.PermissionCheck;
import com.reservation.vo.TeacherProfessionalDetailVO;
import com.reservation.vo.TeacherProfessionalListVO;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Autowired;
import java.io.File;
import java.util.Map;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseBody;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/**
 * 教师职业信息维护控制器
 * 对应 notes §3 接口定义
 * 基础路径：/teacher/professional
 * 所有接口均需登录（不在 SecurityConfig 白名单），业务层可用 PermissionCheck.checkAdmin 加角色校验
 */
@RestController
@RequestMapping("/api/v1/teacher/professional")
public class TeacherProfessionalController {

    @Autowired
    private TeacherProfessionalService teacherProfessionalService;

    @Autowired
    private PermissionCheck permissionCheck;

    // 1. 添加教师职业信息
    @PostMapping("/addTeacherProfessionalInfo")
    @ResponseBody
    public Result<Object> addTeacherProfessionalInfo(@RequestBody TeacherProfessionalDTO dto,
                                                     @RequestHeader("Authorization") String token) {
        // 方法级兜底（2026-10-10 P1-4）：对齐 AuthzRules 声明 TEACHER_OR_ADMIN
        permissionCheck.checkTeacherOrAdmin(token);
        return teacherProfessionalService.addTeacherProfessionalInfo(dto);
    }

    // 2. 删除教师职业信息（按 teacherProfessionalId）
    @PostMapping("/deleteTeacherProfessionalInfo")
    @ResponseBody
    public Result<Object> deleteTeacherProfessionalInfo(@RequestParam("teacherProfessionalId") String teacherProfessionalId,
                                                        @RequestHeader("Authorization") String token) {
        permissionCheck.checkTeacherOrAdmin(token);
        return teacherProfessionalService.deleteTeacherProfessionalInfo(teacherProfessionalId);
    }

    // 3. 修改教师职业信息
    @PostMapping("/updateTeacherProfessionalInfo")
    @ResponseBody
    public Result<Object> updateTeacherProfessionalInfo(@RequestBody TeacherProfessionalDTO dto,
                                                        @RequestHeader("Authorization") String token) {
        permissionCheck.checkTeacherOrAdmin(token);
        return teacherProfessionalService.updateTeacherProfessionalInfo(dto);
    }

    // 4. 查询教师职业信息（单条，按 teacherProfessionalId 或 teacherId）
    @GetMapping("/queryTeacherProfessionalInfo")
    @ResponseBody
    public Result<TeacherProfessionalDetailVO> queryTeacherProfessionalInfo(
            @RequestParam(value = "teacherProfessionalId", required = false) String teacherProfessionalId,
            @RequestParam(value = "teacherId", required = false) String teacherId,
            @RequestHeader("Authorization") String token) {
        // 方法级兜底：对齐 AuthzRules 声明 ALL_ROLES（学生浏览教师资料）
        permissionCheck.checkAnyLogin(token);
        return teacherProfessionalService.queryTeacherProfessionalInfo(teacherProfessionalId, teacherId);
    }

    // 5. 分页查询教师职业信息列表
    @GetMapping("/listByPage")
    @ResponseBody
    public Result<PageResult<TeacherProfessionalListVO>> listByPage(
            TeacherProfessionalQueryPage query,
            @RequestHeader("Authorization") String token) {
        permissionCheck.checkAnyLogin(token);
        return teacherProfessionalService.listByPage(query);
    }

    // 6. 上传教师图片（头像 photo / 证书 cert），返回可访问 URL（需登录 TEACHER_OR_ADMIN）
    //    与 AuthzRules 声明 TEACHER_OR_ADMIN 对齐；方法级兜底 permissionCheck.checkTeacherOrAdmin。
    @PostMapping("/upload")
    @ResponseBody
    public Result<Map<String, String>> uploadTeacherImage(
            @RequestParam("file") MultipartFile file,
            @RequestParam("fileType") String fileType,
            @RequestParam(value = "teacherId", required = false) String teacherId,
            @RequestHeader("Authorization") String token) {
        permissionCheck.checkTeacherOrAdmin(token);
        return teacherProfessionalService.uploadImage(file, fileType, teacherId);
    }

    // 7. 公开伺服已上传的教师图片（免登录，供发布页/编辑页匿名展示）
    //    路径形态 GET /file/** —— 与 SecurityConfig permitAll / JwtFilter WHITELIST_PREFIXES /
    //    WebMvcConfig EXCLUDE_PATTERNS / 守卫 PERMIT_ALL 四处同步，缺一处匿名访问即 401/403。
    //    相对路径取自 URL 去掉 FILE_URL_PREFIX 的部分，resolveUploadFile 内做目录穿越防护。
    @GetMapping("/file/**")
    public ResponseEntity<Resource> serveTeacherFile(HttpServletRequest request) {
        String uri = request.getRequestURI();
        String prefix = "/api/v1/teacher/professional/file/";
        if (!uri.startsWith(prefix)) {
            return ResponseEntity.status(404).build();
        }
        String relativePath = uri.substring(prefix.length());
        if (relativePath.isEmpty()) {
            return ResponseEntity.status(404).build();
        }
        File file;
        try {
            file = teacherProfessionalService.resolveUploadFile(relativePath);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.status(403).build();
        }
        if (file == null) {
            return ResponseEntity.status(404).build();
        }
        try {
            Resource resource = new FileSystemResource(file);
            return ResponseEntity.ok()
                    .contentType(resolveImageMediaType(file.getName()))
                    .body(resource);
        } catch (Exception e) {
            return ResponseEntity.status(500).build();
        }
    }

    /** 按扩展名推断图片 Content-Type（FileSystemResource 不会自动判定） */
    private static MediaType resolveImageMediaType(String name) {
        String lower = name.toLowerCase();
        if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return MediaType.IMAGE_JPEG;
        if (lower.endsWith(".png")) return MediaType.IMAGE_PNG;
        if (lower.endsWith(".gif")) return MediaType.IMAGE_GIF;
        if (lower.endsWith(".webp")) return MediaType.parseMediaType("image/webp");
        return MediaType.APPLICATION_OCTET_STREAM;
    }
}
