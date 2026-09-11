package com.reservation.service;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.UpdateWrapper;
import com.reservation.common.Result;
import com.reservation.dto.TeacherPublishedProfileDTO;
import com.reservation.entity.TeacherPublishedProfile;
import com.reservation.exception.BusinessException;
import com.reservation.mapper.TeacherPublishedProfileMapper;
import com.reservation.utils.TenantContext;
import com.reservation.utils.TermMsg;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.List;

@Service
public class TeacherPublishedProfileService {

    @Autowired
    private TeacherPublishedProfileMapper mapper;
    @Autowired
    private TenantQuotaService tenantQuotaService;

    /** 列表：按 teacherId 查所有发布记录（最近更新在前） */
    public Result<List<TeacherPublishedProfile>> listByTeacherId(String teacherId) {
        if (!StringUtils.hasText(teacherId)) {
            return Result.fail(400, "teacherId 不能为空");
        }
        List<TeacherPublishedProfile> list = mapper.selectList(
                new QueryWrapper<TeacherPublishedProfile>()
                        .eq("teacher_id", teacherId)
                        .orderByDesc("update_time")
        );
        return Result.success(list, "查询成功");
    }

    /** 单条查询 */
    public Result<TeacherPublishedProfile> getById(String publishedProfileId) {
        if (!StringUtils.hasText(publishedProfileId)) {
            return Result.fail(400, "publishedProfileId 不能为空");
        }
        TeacherPublishedProfile entity = mapper.selectById(publishedProfileId);
        if (entity == null) {
            return Result.fail(404, "记录不存在");
        }
        return Result.success(entity, "查询成功");
    }

    /**
     * 查询当前教师已发布的最新版本（公开页 /latest-public，免登录）。
     *
     * <p><b>必须走 ignoreTenant 方法</b>：免登录请求没有租户上下文，
     * 走普通 selectOne 会被租户插件追加 {@code tenant_id = -1} 而恒不命中。
     * 详见 {@link TeacherPublishedProfileMapper#selectLatestPublishedIgnoreTenant(String)}。
     */
    public Result<TeacherPublishedProfile> getLatestPublished(String teacherId) {
        if (!StringUtils.hasText(teacherId)) {
            return Result.fail(400, "teacherId 不能为空");
        }
        TeacherPublishedProfile entity = mapper.selectLatestPublishedIgnoreTenant(teacherId);
        if (entity == null) {
            return Result.fail(404, TermMsg.t("该{teacher}暂无已发布的个人介绍"));
        }
        return Result.success(toPublicView(entity), "查询成功");
    }

    /**
     * 公开按 ID 查询（公开页 /public-get，免登录；仅 published 状态可对外）。
     *
     * <p>同样必须 ignoreTenant，理由见上一个方法。
     */
    public Result<TeacherPublishedProfile> getPublishedById(String publishedProfileId) {
        if (!StringUtils.hasText(publishedProfileId)) {
            return Result.fail(400, "id 不能为空");
        }
        TeacherPublishedProfile entity = mapper.selectByIdIgnoreTenant(publishedProfileId);
        if (entity == null) {
            return Result.fail(404, "该版本不存在");
        }
        if (!"published".equalsIgnoreCase(entity.getStatus())) {
            return Result.fail(404, "该版本暂未对外发布");
        }
        return Result.success(toPublicView(entity), "查询成功");
    }

    /**
     * 裁剪成「对外可见视图」：清空 draftData。
     *
     * <p>draft_data 是发布页的**全量数据快照**（JSON.stringify(originalData)），
     * 里面包含**未被勾选发布**的字段——手机号、账号、邮箱、图片 base64 等。
     * 公开链路的访问者只应看到已发布的 staticHtml，绝不能拿到这份原始快照：
     * 否则获得链接的人可以绕过页面上的字段勾选，直接从接口把教师未公开的信息读走。
     *
     * <p>只置空不改结构，避免影响前端已依赖的 JSON 形状（公开页仅消费 staticHtml）。
     */
    private TeacherPublishedProfile toPublicView(TeacherPublishedProfile entity) {
        if (entity != null) {
            entity.setDraftData(null);
        }
        return entity;
    }

    /**
     * 保存（草稿）/ 发布
     * - 有 publishedProfileId 则更新
     * - 无则新建
     * - status=published 时：同 teacher 的其他 published 版本自动置为 archived
     */
    @Transactional
    public Result<TeacherPublishedProfile> save(TeacherPublishedProfileDTO dto, String operatorUserId) {
        if (!StringUtils.hasText(dto.getTeacherId())) {
            return Result.fail(400, "teacherId 不能为空");
        }
        boolean isPublish = "published".equalsIgnoreCase(dto.getStatus());
        LocalDateTime now = LocalDateTime.now();

        TeacherPublishedProfile entity;
        if (StringUtils.hasText(dto.getPublishedProfileId())) {
            entity = mapper.selectById(dto.getPublishedProfileId());
            if (entity == null) {
                return Result.fail(404, "记录不存在");
            }
        } else {
            entity = new TeacherPublishedProfile();
            entity.setTeacherId(dto.getTeacherId());
            entity.setCreateTime(now);
            entity.setStatus("draft");
        }

        entity.setTeacherProfessionalId(dto.getTeacherProfessionalId());
        entity.setTitle(StringUtils.hasText(dto.getTitle()) ? dto.getTitle() : "教师信息");
        entity.setFieldConfig(dto.getFieldConfig());
        entity.setStyleConfig(dto.getStyleConfig());
        entity.setDraftData(dto.getDraftData());
        entity.setUpdateTime(now);

        if (isPublish) {
            if (!StringUtils.hasText(dto.getStaticHtml())) {
                return Result.fail(400, "发布时 staticHtml 不能为空");
            }
            entity.setStaticHtml(dto.getStaticHtml());
            entity.setStatus("published");
            entity.setPublishedAt(now);
            entity.setPublishedByUserId(operatorUserId);

            // 自动归档同教师其他已发布版本（仅保留最新一个）
            mapper.update(null, new UpdateWrapper<TeacherPublishedProfile>()
                    .eq("teacher_id", dto.getTeacherId())
                    .eq("status", "published")
                    .ne("published_profile_id", entity.getPublishedProfileId() != null ?
                            entity.getPublishedProfileId() : "")
                    .set("status", "archived")
                    .set("update_time", now)
            );
        }

        if (entity.getPublishedProfileId() == null) {
            // 新建记录时校验租户的教师信息发布额度（原子占用，与插入同一事务）
            Long tenantId = TenantContext.getTenantId();
            try {
                tenantQuotaService.acquire(tenantId, TenantQuotaService.TEACHER_PUBLISH);
            } catch (BusinessException e) {
                return Result.fail(403, e.getMessage());
            }
            mapper.insert(entity);
        } else {
            mapper.updateById(entity);
        }
        return Result.success(entity, isPublish ? "发布成功" : "保存草稿成功");
    }

    /** 删除（逻辑删除：置为 archived） */
    @Transactional
    public Result<Object> delete(String publishedProfileId) {
        if (!StringUtils.hasText(publishedProfileId)) {
            return Result.fail(400, "publishedProfileId 不能为空");
        }
        TeacherPublishedProfile entity = mapper.selectById(publishedProfileId);
        if (entity == null) {
            return Result.fail(404, "记录不存在");
        }
        entity.setStatus("archived");
        entity.setUpdateTime(LocalDateTime.now());
        mapper.updateById(entity);
        // 归档后释放租户的教师信息发布额度
        tenantQuotaService.release(TenantContext.getTenantId(), TenantQuotaService.TEACHER_PUBLISH);
        return Result.success(null, "删除成功");
    }

    /** 按主键直接更新标题/状态等，不触发归档逻辑 */
    @Transactional
    public Result<TeacherPublishedProfile> update(TeacherPublishedProfileDTO dto) {
        if (!StringUtils.hasText(dto.getPublishedProfileId())) {
            return Result.fail(400, "publishedProfileId 不能为空");
        }
        TeacherPublishedProfile entity = mapper.selectById(dto.getPublishedProfileId());
        if (entity == null) {
            return Result.fail(404, "记录不存在");
        }
        if (StringUtils.hasText(dto.getTitle())) entity.setTitle(dto.getTitle());
        if (StringUtils.hasText(dto.getStatus())) entity.setStatus(dto.getStatus());
        entity.setUpdateTime(LocalDateTime.now());
        mapper.updateById(entity);
        return Result.success(entity, "更新成功");
    }
}
