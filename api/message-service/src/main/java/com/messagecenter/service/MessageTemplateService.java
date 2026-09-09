package com.messagecenter.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.messagecenter.common.PageResult;
import com.messagecenter.dto.SendMessageReq;
import com.messagecenter.dto.TemplateReq;
import com.messagecenter.dto.TemplateSendReq;
import com.messagecenter.entity.Message;
import com.messagecenter.entity.MessageTemplate;
import com.messagecenter.exception.MessageBizException;
import com.messagecenter.mapper.MessageTemplateMapper;
import com.messagecenter.security.MessageAuthContext;
import com.messagecenter.utils.CryptoUtil;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * 消息模板服务：模板 CRUD(加密存储) + 基于模板 + 占位参数发送。
 */
@Service
public class MessageTemplateService {

    private final MessageTemplateMapper templateMapper;
    private final CryptoUtil crypto;
    private final MessageService messageService;

    public MessageTemplateService(MessageTemplateMapper templateMapper, CryptoUtil crypto, MessageService messageService) {
        this.templateMapper = templateMapper;
        this.crypto = crypto;
        this.messageService = messageService;
    }

    private LambdaQueryWrapper<MessageTemplate> visibleScope() {
        LambdaQueryWrapper<MessageTemplate> w = new LambdaQueryWrapper<>();
        w.eq(MessageTemplate::getIsDeleted, 0);
        if (MessageAuthContext.isPlatformAdmin()) {
            // 全部
        } else {
            Long tenant = MessageAuthContext.currentTenantId();
            if (tenant != null && tenant > 0)
                w.and(x -> x.eq(MessageTemplate::getTenantId, tenant).or().eq(MessageTemplate::getTenantId, 0L));
            else w.eq(MessageTemplate::getTenantId, 0L);
        }
        return w;
    }

    public PageResult<MessageTemplate> page(int pageNum, int pageSize, String keyword, String categoryCode) {
        LambdaQueryWrapper<MessageTemplate> w = visibleScope();
        if (keyword != null && !keyword.isBlank())
            w.and(x -> x.like(MessageTemplate::getTemplateName, keyword).or().like(MessageTemplate::getTemplateCode, keyword));
        if (categoryCode != null && !categoryCode.isBlank()) w.eq(MessageTemplate::getCategoryCode, categoryCode);
        w.orderByDesc(MessageTemplate::getUpdateTime);
        List<MessageTemplate> all = templateMapper.selectList(w);
        for (MessageTemplate t : all) { t.setTitleTemplate(dec(t.getTitleTemplate())); t.setContentTemplate(dec(t.getContentTemplate())); }
        int total = all.size();
        int from = (pageNum - 1) * pageSize;
        int to = Math.min(from + pageSize, total);
        return PageResult.of(from < total ? all.subList(from, to) : new ArrayList<>(), total, pageNum, pageSize);
    }

    public List<MessageTemplate> listEnabled() {
        LambdaQueryWrapper<MessageTemplate> w = visibleScope().eq(MessageTemplate::getIsEnabled, 1);
        List<MessageTemplate> all = templateMapper.selectList(w);
        for (MessageTemplate t : all) { t.setTitleTemplate(dec(t.getTitleTemplate())); t.setContentTemplate(dec(t.getContentTemplate())); }
        return all;
    }

    public MessageTemplate detail(Long id) {
        MessageTemplate t = templateMapper.selectById(id);
        if (t == null || t.getIsDeleted() != 0) throw new MessageBizException(404, "模板不存在");
        t.setTitleTemplate(dec(t.getTitleTemplate()));
        t.setContentTemplate(dec(t.getContentTemplate()));
        return t;
    }

    @Transactional
    public MessageTemplate create(TemplateReq req, Long tenantId) {
        MessageTemplate t = new MessageTemplate();
        t.setTenantId(tenantId);
        checkCodeUnique(req.getTemplateCode(), tenantId, null);
        t.setTemplateCode(req.getTemplateCode());
        t.setTemplateName(req.getTemplateName());
        t.setCategoryCode(req.getCategoryCode());
        t.setTitleTemplate(enc(req.getTitleTemplate()));
        t.setContentTemplate(enc(req.getContentTemplate()));
        t.setSenderType(req.getSenderType() == null ? "admin" : req.getSenderType());
        t.setPriority(req.getPriority() == null ? "MEDIUM" : req.getPriority());
        t.setIsEnabled(req.getIsEnabled() == null ? 1 : req.getIsEnabled());
        t.setIsDeleted(0);
        templateMapper.insert(t);
        return t;
    }

    @Transactional
    public void update(TemplateReq req) {
        if (req.getTemplateId() == null) throw new MessageBizException(400, "templateId 不能为空");
        MessageTemplate t = templateMapper.selectById(req.getTemplateId());
        if (t == null || t.getIsDeleted() != 0) throw new MessageBizException(404, "模板不存在");
        if (!canManage(t)) throw new MessageBizException(403, "无权修改该模板");
        if (req.getTemplateCode() != null && !req.getTemplateCode().isBlank() && !req.getTemplateCode().equals(t.getTemplateCode())) {
            checkCodeUnique(req.getTemplateCode(), t.getTenantId(), t.getTemplateId());
            t.setTemplateCode(req.getTemplateCode());
        }
        if (req.getTemplateName() != null && !req.getTemplateName().isBlank()) t.setTemplateName(req.getTemplateName());
        if (req.getCategoryCode() != null) t.setCategoryCode(req.getCategoryCode());
        if (req.getTitleTemplate() != null) t.setTitleTemplate(enc(req.getTitleTemplate()));
        if (req.getContentTemplate() != null) t.setContentTemplate(enc(req.getContentTemplate()));
        if (req.getSenderType() != null) t.setSenderType(req.getSenderType());
        if (req.getPriority() != null) t.setPriority(req.getPriority());
        if (req.getIsEnabled() != null) t.setIsEnabled(req.getIsEnabled());
        templateMapper.updateById(t);
    }

    @Transactional
    public void delete(Long id) {
        MessageTemplate t = templateMapper.selectById(id);
        if (t == null || t.getIsDeleted() != 0) throw new MessageBizException(404, "模板不存在");
        if (!canManage(t)) throw new MessageBizException(403, "无权删除该模板");
        t.setIsDeleted(1);
        templateMapper.updateById(t);
    }

    /** 模板占位渲染 + 发送 */
    public Map<String, Object> sendByTemplate(TemplateSendReq req, Long tenantId, String senderId, String senderRole) {
        if (req.getTemplateId() == null) throw new MessageBizException(400, "templateId 不能为空");
        MessageTemplate t = templateMapper.selectById(req.getTemplateId());
        if (t == null || t.getIsDeleted() != 0) throw new MessageBizException(404, "模板不存在");
        if (t.getIsEnabled() == null || t.getIsEnabled() != 1) throw new MessageBizException(400, "模板未启用");
        String rawTitle = dec(t.getTitleTemplate());
        String rawContent = dec(t.getContentTemplate());
        String title = render(rawTitle, req.getParams());
        String content = render(rawContent, req.getParams());

        SendMessageReq send = new SendMessageReq();
        send.setTitle(title);
        send.setContent(content);
        send.setPriority(t.getPriority());
        send.setCategoryCode(t.getCategoryCode());
        send.setRecipientUserIds(req.getRecipientUserIds());
        send.setBroadcast(Boolean.TRUE.equals(req.getBroadcast()));
        send.setTargetRole(req.getTargetRole());
        send.setTargetTenantId(req.getTargetTenantId());
        send.setSenderDimCode(senderRole);
        if (Boolean.TRUE.equals(req.getBroadcast())) {
            return messageService.broadcast(send, tenantId, senderId, senderRole);
        }
        return messageService.sendToUsers(send, tenantId, senderId, senderRole);
    }

    private String render(String template, Map<String, Object> params) {
        if (template == null || template.isBlank()) return template;
        if (params == null) return template;
        String out = template;
        for (Map.Entry<String, Object> e : params.entrySet()) {
            out = out.replace("{" + e.getKey() + "}", e.getValue() == null ? "" : String.valueOf(e.getValue()));
        }
        return out;
    }

    private String enc(String s) { return s == null || s.isBlank() ? null : crypto.encryptWithIndex(s); }
    private String dec(String s) { return crypto.decrypt(s); }

    private boolean canManage(MessageTemplate t) {
        if (MessageAuthContext.isPlatformAdmin()) return true;
        if (t.getTenantId() != null && t.getTenantId() != 0) {
            Long tenant = MessageAuthContext.currentTenantId();
            return tenant != null && tenant.equals(t.getTenantId());
        }
        return false;
    }

    private void checkCodeUnique(String code, Long tenantId, Long selfId) {
        LambdaQueryWrapper<MessageTemplate> w = new LambdaQueryWrapper<>();
        w.eq(MessageTemplate::getTemplateCode, code).eq(MessageTemplate::getIsDeleted, 0)
         .and(x -> x.eq(MessageTemplate::getTenantId, tenantId).or().eq(MessageTemplate::getTenantId, 0L));
        if (selfId != null) w.ne(MessageTemplate::getTemplateId, selfId);
        if (templateMapper.selectCount(w) > 0) throw new MessageBizException(400, "模板编码已存在: " + code);
    }
}
