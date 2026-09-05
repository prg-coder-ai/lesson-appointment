package com.messagecenter.controller;

import com.messagecenter.common.PageResult;
import com.messagecenter.common.Result;
import com.messagecenter.dto.CategoryReq;
import com.messagecenter.entity.MessageCategory;
import com.messagecenter.exception.MessageBizException;
import com.messagecenter.security.MessageAuthContext;
import com.messagecenter.service.CategoryService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 消息分类管理（运营端，admin/platform_admin 维护）
 */
@RestController
@RequestMapping("/api/v1/message-categories")
public class CategoryController {

    private final CategoryService categoryService;

    public CategoryController(CategoryService categoryService) { this.categoryService = categoryService; }

    private void requireManager() {
        if (!MessageAuthContext.isManager()) throw new MessageBizException(403, "仅管理员可操作消息分类");
    }

    @GetMapping
    public Result<PageResult<MessageCategory>> page(@RequestParam(defaultValue = "1") int pageNum,
            @RequestParam(defaultValue = "10") int pageSize,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) Integer level) {
        return Result.success(categoryService.page(pageNum, pageSize, keyword, level), "查询成功");
    }

    @GetMapping("/tree")
    public Result<List<MessageCategory>> tree() {
        return Result.success(categoryService.tree(), "查询成功");
    }

    @PostMapping
    public Result<MessageCategory> create(@Valid @RequestBody CategoryReq req) {
        requireManager();
        Long tenant = MessageAuthContext.currentTenantId();
        if (tenant == null || tenant < 0) tenant = 0L;
        return Result.success(categoryService.create(req, tenant), "创建成功");
    }

    @PutMapping("/{categoryId}")
    public Result<Object> update(@PathVariable Long categoryId, @RequestBody CategoryReq req) {
        requireManager();
        req.setCategoryId(categoryId);
        categoryService.update(req);
        return Result.success();
    }

    @DeleteMapping("/{categoryId}")
    public Result<Object> delete(@PathVariable Long categoryId) {
        requireManager();
        categoryService.delete(categoryId);
        return Result.success();
    }
}
