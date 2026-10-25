package com.reservation.controller;

import com.reservation.common.Result;
import com.reservation.entity.WorkLanguage;
import com.reservation.service.WorkLanguageService;
import com.reservation.utils.PermissionCheck;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 授课语言枚举控制器（/work-language/*）。
 *
 * <p><b>与 sys_term 的分工</b>：这里返回的是**枚举清单**——
 * 「用哪种语言上课」的预置项（英语/法语/汉语/德语/西班牙语/土耳其语）＋租户自定义项。
 * 显示名直接取本表的 name_zh/name_en/name_fr，<b>不</b>经过 sys_term 的行业词替换：
 * 授课语言在任何行业下都叫「英语」，它不像 classType 那样会随行业变成「劳动」。
 *
 * <p><b>权限</b>：
 * <ul>
 *   <li>{@code GET /list}：任意登录角色（前端各处下拉都要用）；</li>
 *   <li>{@code POST /save}、{@code DELETE /delete/{id}}：租户管理员。
 *       平台内置项不由本接口维护（走 SQL），因此平台管理员不需要写权限。</li>
 * </ul>
 *
 * <p><b>tenantId 一律从令牌派生</b>：不接受前端传参，否则就是越权写别的租户。
 */
@RestController
@RequestMapping("/api/v1/work-language")
public class WorkLanguageController {

    @Autowired
    private WorkLanguageService workLanguageService;

    @Autowired
    private PermissionCheck permissionCheck;

    /**
     * 当前租户可见的授课语言清单（平台内置 ＋ 本租户自定义）。
     *
     * <p>前端调用: GET /work-language/list
     * <p>返回: [{id, tenantId, langCode, nameZh, nameEn, nameFr, sortOrder}, ...]
     * <p>tenantId=0 的项是内置项（前端应置灰，不允许删除）。
     */
    @GetMapping("/list")
    public Result<List<WorkLanguage>> list(@RequestHeader("Authorization") String token) {
        permissionCheck.checkAnyLogin(token);
        Long tenantId = permissionCheck.getTenantIdFromToken(token);
        return Result.success(workLanguageService.listVisible(tenantId), "查询成功");
    }

    /**
     * 新增/更新一条租户自定义的授课语言。
     *
     * <p>前端调用: POST /work-language/save
     * <p>请求体: {langCode:'italian', nameZh:'意大利语', nameEn:'Italian', nameFr:'Italien', sortOrder:900}
     * <p>同 langCode 已存在时按更新处理（不报重复），与平台内置项重复则拒绝。
     */
    @PostMapping("/save")
    public Result<WorkLanguage> save(@RequestBody WorkLanguage req,
                                     @RequestHeader("Authorization") String token) {
        permissionCheck.checkAdmin(token);
        Long tenantId = permissionCheck.getTenantIdFromToken(token);
        return Result.success(workLanguageService.saveCustom(tenantId, req), "保存成功");
    }

    /**
     * 删除本租户自定义的授课语言（内置项与"仍被引用中"的项不可删）。
     *
     * <p>前端调用: DELETE /work-language/delete/{id}
     */
    @DeleteMapping("/delete/{id}")
    public Result<String> delete(@PathVariable("id") Long id,
                                 @RequestHeader("Authorization") String token) {
        permissionCheck.checkAdmin(token);
        Long tenantId = permissionCheck.getTenantIdFromToken(token);
        workLanguageService.deleteCustom(tenantId, id);
        return Result.success(String.valueOf(id), "删除成功");
    }
}
