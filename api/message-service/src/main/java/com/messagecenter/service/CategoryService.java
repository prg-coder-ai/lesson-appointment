package com.messagecenter.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.messagecenter.common.PageResult;
import com.messagecenter.dto.CategoryReq;
import com.messagecenter.entity.MessageCategory;
import com.messagecenter.exception.MessageBizException;
import com.messagecenter.mapper.MessageCategoryMapper;
import com.messagecenter.security.MessageAuthContext;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;

/**
 * 消息分类服务：三级体系(level1=发起角色维度，level2=业务场景)，
 * 平台预置 tenant=0 全租户可见；租户可新增私有业务场景。manager(admin/platform_admin)可维护。
 */
@Service
public class CategoryService {

    private final MessageCategoryMapper categoryMapper;

    public CategoryService(MessageCategoryMapper categoryMapper) { this.categoryMapper = categoryMapper; }

    /** 可见范围：当前租户 + 平台预置(tenant=0) */
    private LambdaQueryWrapper<MessageCategory> visibleScope() {
        LambdaQueryWrapper<MessageCategory> w = new LambdaQueryWrapper<>();
        w.eq(MessageCategory::getIsDeleted, 0);
        if (MessageAuthContext.isPlatformAdmin()) {
            // 平台管理员：可见全部租户分类（含预置 + 各租户）
        } else {
            Long tenant = MessageAuthContext.currentTenantId();
            if (tenant != null && tenant > 0) {
                w.and(x -> x.eq(MessageCategory::getTenantId, tenant).or().eq(MessageCategory::getTenantId, 0L));
            } else {
                w.eq(MessageCategory::getTenantId, 0L);
            }
        }
        return w;
    }

    public List<MessageCategory> tree() {
        LambdaQueryWrapper<MessageCategory> w = visibleScope().orderByAsc(MessageCategory::getSort).orderByAsc(MessageCategory::getCategoryId);
        List<MessageCategory> all = categoryMapper.selectList(w);
        return all;
    }

    public PageResult<MessageCategory> page(int pageNum, int pageSize, String keyword, Integer level) {
        LambdaQueryWrapper<MessageCategory> w = visibleScope();
        if (keyword != null && !keyword.isBlank())
            w.and(x -> x.like(MessageCategory::getCategoryName, keyword).or().like(MessageCategory::getCategoryCode, keyword));
        if (level != null) w.eq(MessageCategory::getCategoryLevel, level);
        w.orderByAsc(MessageCategory::getSort);
        List<MessageCategory> all = categoryMapper.selectList(w);
        int total = all.size();
        int from = (pageNum - 1) * pageSize;
        int to = Math.min(from + pageSize, total);
        return PageResult.of(from < total ? all.subList(from, to) : new ArrayList<>(), total, pageNum, pageSize);
    }

    @Transactional
    public MessageCategory create(CategoryReq req, Long tenantId) {
        MessageCategory c = new MessageCategory();
        c.setTenantId(tenantId);
        // 编码缺省则由系统生成(租户前缀+名称)
        String code = req.getCategoryCode();
        if (code == null || code.isBlank()) code = genCode(req.getCategoryName());
        // 同租户内编码唯一(含预置对比)
        checkCodeUnique(code, tenantId, null);
        c.setCategoryCode(code);
        c.setCategoryName(req.getCategoryName());
        c.setParentId(req.getParentId() == null ? 0L : req.getParentId());
        int level = req.getCategoryLevel() != null ? req.getCategoryLevel() : (c.getParentId() == 0 ? 1 : 2);
        if (level != 1 && level != 2) throw new MessageBizException(400, "分类层级只支持 1(发起维度)/2(业务场景)");
        c.setCategoryLevel(level);
        if (level == 2 && c.getParentId() != null && c.getParentId() != 0) {
            MessageCategory parent = categoryMapper.selectById(c.getParentId());
            if (parent == null || parent.getIsDeleted() != 0) throw new MessageBizException(404, "父级分类不存在");
            if (parent.getTenantId() != 0 && tenantId != null && !parent.getTenantId().equals(tenantId))
                throw new MessageBizException(403, "不能挂在其他租户分类下");
        }
        c.setSort(req.getSort() == null ? 0 : req.getSort());
        c.setIsSystemPredefined(0);
        c.setIsDeleted(0);
        categoryMapper.insert(c);
        return c;
    }

    @Transactional
    public void update(CategoryReq req) {
        if (req.getCategoryId() == null) throw new MessageBizException(400, "categoryId 不能为空");
        MessageCategory c = categoryMapper.selectById(req.getCategoryId());
        if (c == null || c.getIsDeleted() != 0) throw new MessageBizException(404, "分类不存在");
        if (!canManage(c)) throw new MessageBizException(403, "无权修改该分类");
        if (req.getCategoryName() != null && !req.getCategoryName().isBlank()) c.setCategoryName(req.getCategoryName());
        if (req.getCategoryCode() != null && !req.getCategoryCode().isBlank() && !req.getCategoryCode().equals(c.getCategoryCode())) {
            checkCodeUnique(req.getCategoryCode(), c.getTenantId(), c.getCategoryId());
            c.setCategoryCode(req.getCategoryCode());
        }
        if (req.getSort() != null) c.setSort(req.getSort());
        categoryMapper.updateById(c);
    }

    @Transactional
    public void delete(Long categoryId) {
        MessageCategory c = categoryMapper.selectById(categoryId);
        if (c == null || c.getIsDeleted() != 0) throw new MessageBizException(404, "分类不存在");
        if (!canManage(c)) throw new MessageBizException(403, "无权删除该分类");
        if (c.getIsSystemPredefined() != null && c.getIsSystemPredefined() == 1)
            throw new MessageBizException(400, "系统预置分类不可删除");
        // 有子分类不允许删
        long child = categoryMapper.selectCount(new LambdaQueryWrapper<MessageCategory>()
                .eq(MessageCategory::getParentId, categoryId).eq(MessageCategory::getIsDeleted, 0));
        if (child > 0) throw new MessageBizException(400, "存在子分类，无法删除");
        c.setIsDeleted(1);
        categoryMapper.updateById(c);
    }

    /** 租户管理员只能维护本租户私有分类；平台预置分类只有平台管理员可改 */
    private boolean canManage(MessageCategory c) {
        if (MessageAuthContext.isPlatformAdmin()) return true;
        if (c.getTenantId() != null && c.getTenantId() != 0) {
            Long tenant = MessageAuthContext.currentTenantId();
            return tenant != null && tenant.equals(c.getTenantId());
        }
        return false; // 平台预置分类非平台管理员不可改
    }

    private void checkCodeUnique(String code, Long tenantId, Long selfId) {
        // 编码需在 该租户 与 平台预置 两个维度都不冲突(对租户而言预置也算占用)
        LambdaQueryWrapper<MessageCategory> w = new LambdaQueryWrapper<>();
        w.eq(MessageCategory::getCategoryCode, code).eq(MessageCategory::getIsDeleted, 0)
         .and(x -> x.eq(MessageCategory::getTenantId, tenantId).or().eq(MessageCategory::getTenantId, 0L));
        if (selfId != null) w.ne(MessageCategory::getCategoryId, selfId);
        if (categoryMapper.selectCount(w) > 0) throw new MessageBizException(400, "分类编码已存在: " + code);
    }

    private String genCode(String name) {
        return "CAT_" + Integer.toHexString(name == null ? 0 : name.hashCode()) + "_" + (System.currentTimeMillis() % 100000);
    }
}
