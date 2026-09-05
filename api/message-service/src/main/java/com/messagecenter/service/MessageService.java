package com.messagecenter.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.messagecenter.common.PageResult;
import com.messagecenter.dto.SendMessageReq;
import com.messagecenter.entity.*;
import com.messagecenter.exception.MessageBizException;
import com.messagecenter.mapper.*;
import com.messagecenter.security.MessageAuthContext;
import com.messagecenter.utils.CryptoUtil;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 消息核心业务服务：发送 / 广播 / 收件箱(写扩散) / 投递状态 / 批量任务。
 * 本微服务不直连用户库：接收人以 userId 业务标识给出（上游鉴权保证合法）。
 * 消息标题/内容/payload 用 AES-256-GCM 加密落库，读时解密。
 */
@Slf4j
@Service
public class MessageService {

    private final MessageMapper messageMapper;
    private final MessageInboxMapper inboxMapper;
    private final MessageDeliveryMapper deliveryMapper;
    private final MessageBatchTaskMapper taskMapper;
    private final MessageCategoryMapper categoryMapper;
    private final CryptoUtil crypto;
    private final SsePushService ssePushService;

    // 发送方角色 -> 一级来源维度编码
    private static final Map<String, String> ROLE_DIM = new HashMap<>();
    static {
        ROLE_DIM.put("teacher", "SENDER_TEACHER_ADMIN");
        ROLE_DIM.put("admin", "SENDER_TEACHER_ADMIN");
        ROLE_DIM.put("platform_admin", "SENDER_TEACHER_ADMIN");
        ROLE_DIM.put("student", "SENDER_STUDENT");
        ROLE_DIM.put("system", "SENDER_SYSTEM");
    }

    public MessageService(MessageMapper messageMapper, MessageInboxMapper inboxMapper,
                          MessageDeliveryMapper deliveryMapper, MessageBatchTaskMapper taskMapper,
                          MessageCategoryMapper categoryMapper, CryptoUtil crypto,
                          SsePushService ssePushService) {
        this.messageMapper = messageMapper;
        this.inboxMapper = inboxMapper;
        this.deliveryMapper = deliveryMapper;
        this.taskMapper = taskMapper;
        this.categoryMapper = categoryMapper;
        this.crypto = crypto;
        this.ssePushService = ssePushService;
    }

    // ==================== 发送 ====================

    /**
     * 发送单条/群发(指定用户)。写扩散到收件箱 + 建投递记录 + SSE 推送在线用户。
     */
    @Transactional
    public Map<String, Object> sendToUsers(SendMessageReq req, Long tenantId, String senderId, String senderRole) {
        validateCommon(req, tenantId, senderRole);
        List<String> recipients = req.getRecipientUserIds() == null ? new ArrayList<>() : req.getRecipientUserIds();
        recipients = recipients.stream().filter(s -> s != null && !s.isBlank()).distinct().collect(Collectors.toList());
        if (recipients.isEmpty()) {
            throw new MessageBizException(400, "接收用户列表为空");
        }

        Message msg = buildMessage(req, tenantId, senderId, senderRole);
        boolean broadcast = Boolean.TRUE.equals(req.getBroadcast());
        msg.setIsBroadcast(broadcast ? 1 : 0);
        msg.setStatus("sent");
        msg.setSendTime(LocalDateTime.now());
        messageMapper.insert(msg);

        // 写扩散收件箱 + 投递记录
        int unreadCount = recipients.size();
        for (String uid : recipients) {
            insertInbox(msg.getTenantId(), uid, msg.getMessageId());
            insertDelivery(msg.getTenantId(), msg.getMessageId(), uid, 1);
        }
        // SSE 实时推给在线接收者
        ssePushService.pushToUsers(recipients, msg);
        return resultMap(msg.getMessageId(), msg, recipients.size(), unreadCount);
    }

    /**
     * 广播：创建消息 + 批量任务。接收人以调用方提供的列表落地（上游用户服务提供目标名单）。
     * 支持 targetRole 语义标注。
     */
    @Transactional
    public Map<String, Object> broadcast(SendMessageReq req, Long tenantId, String senderId, String senderRole) {
        validateCommon(req, tenantId, senderRole);
        List<String> recipients = req.getRecipientUserIds() == null ? new ArrayList<>() : req.getRecipientUserIds();
        recipients = recipients.stream().filter(s -> s != null && !s.isBlank()).distinct().collect(Collectors.toList());
        String role = req.getTargetRole() == null || req.getTargetRole().isBlank() ? "all" : req.getTargetRole();

        Message msg = buildMessage(req, tenantId, senderId, senderRole);
        msg.setIsBroadcast(1);
        msg.setStatus("sent");
        msg.setSendTime(LocalDateTime.now());
        messageMapper.insert(msg);

        // 批量任务
        MessageBatchTask task = new MessageBatchTask();
        task.setTenantId(msg.getTenantId());
        task.setTaskName((req.getTitle() == null ? "广播" : req.getTitle()) + "_" + role);
        task.setMessageId(msg.getMessageId());
        task.setSenderId(senderId);
        task.setTotalRecipients(recipients.size());
        task.setProcessedCount(0);
        task.setSuccessCount(0);
        task.setFailedCount(0);
        task.setStatus(0);
        task.setExecuteTime(LocalDateTime.now());
        taskMapper.insert(task);

        if (!recipients.isEmpty()) {
            task.setStatus(1);
            task.setProcessedCount(recipients.size());
            int ok = 0;
            for (String uid : recipients) {
                try {
                    insertInbox(msg.getTenantId(), uid, msg.getMessageId());
                    insertDelivery(msg.getTenantId(), msg.getMessageId(), uid, 1);
                    ok++;
                } catch (Exception e) {
                    log.warn("广播写扩散失败 user={} msg={}", uid, msg.getMessageId());
                }
            }
            task.setSuccessCount(ok);
            task.setFailedCount(recipients.size() - ok);
            task.setStatus(ok == recipients.size() ? 2 : 3);
            task.setFinishTime(LocalDateTime.now());
            taskMapper.updateById(task);
            ssePushService.pushToUsers(recipients, msg);
        }
        Map<String, Object> result = resultMap(msg.getMessageId(), msg, recipients.size(), recipients.size());
        result.put("taskId", task.getTaskId());
        return result;
    }

    /** 系统/平台管理员以 system 或指定角色触发(供业务系统接入) */
    @Transactional
    public Map<String, Object> sendSystem(SendMessageReq req, Long tenantId, String senderId) {
        req.setBroadcast(req.getRecipientUserIds() == null || req.getRecipientUserIds().isEmpty());
        if (Boolean.TRUE.equals(req.getBroadcast())) {
            return broadcast(req, tenantId, senderId, "system");
        }
        return sendToUsers(req, tenantId, senderId, "system");
    }

    private void validateCommon(SendMessageReq req, Long tenantId, String senderRole) {
        if (req.getTitle() == null || req.getTitle().isBlank()) throw new MessageBizException(400, "消息标题不能为空");
        String priority = req.getPriority() == null ? "MEDIUM" : req.getPriority().toUpperCase();
        if (!List.of("HIGH", "MEDIUM", "LOW").contains(priority)) throw new MessageBizException(400, "优先级必须为 HIGH/MEDIUM/LOW");
        req.setPriority(priority);
        // 校验分类
        if (req.getCategoryCode() != null && !req.getCategoryCode().isBlank()) {
            MessageCategory cat = getCategoryByCode(req.getCategoryCode(), tenantId);
            if (cat == null) throw new MessageBizException(404, "消息分类编码不存在: " + req.getCategoryCode());
            if (req.getSenderDimCode() == null) {
                req.setSenderDimCode(dimOfCategory(cat, tenantId));
            }
        }
    }

    private String dimOfCategory(MessageCategory cat, Long tenantId) {
        if (cat.getCategoryLevel() != null && cat.getCategoryLevel() == 2 && cat.getParentId() != null) {
            MessageCategory parent = categoryMapper.selectById(cat.getParentId());
            if (parent != null) return parent.getCategoryCode();
        }
        return cat.getCategoryCode();
    }

    private Message buildMessage(SendMessageReq req, Long tenantId, String senderId, String senderRole) {
        Message msg = new Message();
        msg.setTenantId(tenantId);
        msg.setSenderId(senderId);
        msg.setSenderType(senderRole);
        msg.setCategoryCode(req.getCategoryCode());
        String dim = req.getSenderDimCode();
        if (dim == null || dim.isBlank()) dim = ROLE_DIM.getOrDefault(senderRole, "SENDER_TEACHER_ADMIN");
        msg.setSenderDimCode(dim);
        msg.setPriority(req.getPriority() == null ? "MEDIUM" : req.getPriority());
        msg.setTitle(crypto.encryptWithIndex(req.getTitle()));
        msg.setContent(req.getContent() == null ? null : crypto.encryptWithIndex(req.getContent()));
        if (req.getPayload() != null && !req.getPayload().isEmpty()) {
            try {
                msg.setPayload(crypto.encryptWithIndex(toJson(req.getPayload())));
            } catch (Exception e) {
                msg.setPayload(null);
            }
        }
        return msg;
    }

    private void insertInbox(Long tenantId, String userId, Long messageId) {
        MessageInbox in = new MessageInbox();
        in.setTenantId(tenantId);
        in.setUserId(userId);
        in.setMessageId(messageId);
        in.setIsRead(0);
        in.setIsStarred(0);
        in.setIsDeleted(0);
        in.setFolder("inbox");
        inboxMapper.insert(in);
    }

    private void insertDelivery(Long tenantId, Long messageId, String userId, int status) {
        MessageDelivery d = new MessageDelivery();
        d.setTenantId(tenantId);
        d.setMessageId(messageId);
        d.setUserId(userId);
        d.setDeliveryStatus(status);
        d.setChannel("rest");
        d.setRetryCount(0);
        d.setDeliveryTime(LocalDateTime.now());
        deliveryMapper.insert(d);
    }

    private Map<String, Object> resultMap(Long messageId, Message msg, int total, int unread) {
        Map<String, Object> m = new HashMap<>();
        m.put("messageId", messageId);
        m.put("broadcast", msg.getIsBroadcast());
        m.put("recipientCount", total);
        return m;
    }

    public String toJson(Object o) {
        com.fasterxml.jackson.databind.ObjectMapper om = new com.fasterxml.jackson.databind.ObjectMapper();
        try { return om.writeValueAsString(o); } catch (Exception e) { return null; }
    }

    public String decryptContent(Message msg) {
        if (msg == null || msg.getContent() == null) return null;
        return crypto.decrypt(msg.getContent());
    }

    public Object decryptPayload(Message msg) {
        if (msg == null || msg.getPayload() == null) return null;
        String json = crypto.decrypt(msg.getPayload());
        if (json == null) return null;
        try {
            return new com.fasterxml.jackson.databind.ObjectMapper().readValue(json, Map.class);
        } catch (Exception e) { return json; }
    }

    // ==================== 收件箱 ====================

    public MessageCategory getCategoryByCode(String code, Long tenantId) {
        LambdaQueryWrapper<MessageCategory> w = new LambdaQueryWrapper<>();
        w.eq(MessageCategory::getCategoryCode, code).eq(MessageCategory::getIsDeleted, 0)
         .and(x -> x.eq(MessageCategory::getTenantId, tenantId).or().eq(MessageCategory::getTenantId, 0L));
        w.orderByDesc(MessageCategory::getTenantId).last("limit 1");
        return categoryMapper.selectOne(w);
    }

    /** 组装收件箱展示（解密消息字段） */
    public MessageInbox composeInbox(MessageInbox in) {
        if (in == null) return null;
        Message msg = messageMapper.selectById(in.getMessageId());
        in.setMessage(msg);
        if (msg != null) {
            in.setTitle(crypto.decrypt(msg.getTitle()));
            in.setPriority(msg.getPriority());
            in.setCategoryCode(msg.getCategoryCode());
            in.setIsBroadcast(msg.getIsBroadcast());
            in.setStatus(msg.getStatus());
            in.setSendTime(msg.getSendTime());
            if (msg.getCategoryCode() != null) {
                MessageCategory c = getCategoryByCode(msg.getCategoryCode(), in.getTenantId());
                in.setCategoryName(c == null ? null : c.getCategoryName());
            }
        }
        return in;
    }
}
