package com.reservation.controller;

import com.reservation.common.Result;
import com.reservation.dto.TeacherPublishedProfileDTO;
import com.reservation.entity.TeacherPublishedProfile;
import com.reservation.service.TeacherPublishedProfileService;
import com.reservation.utils.PermissionCheck;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseBody;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/teacher/published")
public class TeacherPublishedProfileController {

    @Autowired
    private TeacherPublishedProfileService service;

    @Autowired
    private PermissionCheck permissionCheck;

    private String extractToken(HttpServletRequest req) {
        String h = req.getHeader("Authorization");
        if (h != null && h.startsWith("Bearer ")) {
            return h.substring(7);
        }
        return null;
    }

    // 1. 列表：按 teacherId 查
    @GetMapping("/list")
    @ResponseBody
    public Result<List<TeacherPublishedProfile>> list(@RequestParam("teacherId") String teacherId,
                                                       HttpServletRequest req) {
        permissionCheck.checkAdmin(extractToken(req));
        return service.listByTeacherId(teacherId);
    }

    // 2. 单条查询
    @GetMapping("/get")
    @ResponseBody
    public Result<TeacherPublishedProfile> get(@RequestParam("publishedProfileId") String publishedProfileId,
                                                HttpServletRequest req) {
        permissionCheck.checkAdmin(extractToken(req));
        return service.getById(publishedProfileId);
    }

    // 3. 公开：查询已发布的最新版本（静态HTML展示用，白名单）
    @GetMapping("/latest-public")
    @ResponseBody
    public Result<TeacherPublishedProfile> latestPublic(@RequestParam("teacherId") String teacherId) {
        return service.getLatestPublished(teacherId);
    }

    // 3.1 公开：按 ID 查询指定已发布版本（教师可把某一历史版本固定分享给家长，白名单）
    //      仅 status=published 的记录可返回，保证草稿/归档不对外泄露
    @GetMapping("/public-get")
    @ResponseBody
    public Result<TeacherPublishedProfile> publicGet(@RequestParam("id") String publishedProfileId) {
        return service.getPublishedById(publishedProfileId);
    }

    // 4. 保存草稿 / 发布（后端唯一入口：status=published 时触发归档旧版本）
    @PostMapping("/save")
    @ResponseBody
    public Result<TeacherPublishedProfile> save(@RequestBody TeacherPublishedProfileDTO dto,
                                                 HttpServletRequest req) {
        String token = extractToken(req);
        permissionCheck.checkAdmin(token);
        String operatorUserId = permissionCheck.getUserIdFromToken(token);
        return service.save(dto, operatorUserId);
    }

    // 5. 更新标题/状态等（不触发归档）
    @PostMapping("/update")
    @ResponseBody
    public Result<TeacherPublishedProfile> update(@RequestBody TeacherPublishedProfileDTO dto,
                                                   HttpServletRequest req) {
        permissionCheck.checkAdmin(extractToken(req));
        return service.update(dto);
    }

    // 6. 删除（置为 archived）
    @PostMapping("/delete")
    @ResponseBody
    public Result<Object> delete(@RequestParam("publishedProfileId") String publishedProfileId,
                                 HttpServletRequest req) {
        permissionCheck.checkAdmin(extractToken(req));
        return service.delete(publishedProfileId);
    }
}
