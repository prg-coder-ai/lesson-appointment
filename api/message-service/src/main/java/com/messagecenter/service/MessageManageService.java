package com.messagecenter.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.messagecenter.common.PageResult;
import com.messagecenter.entity.Message;
import com.messagecenter.entity.MessageBatchTask;
import com.messagecenter.entity.MessageDelivery;
import com.messagecenter.entity.MessageInbox;
import com.messagecenter.exception.MessageBizException;
import com.messagecenter.mapper.MessageDeliveryMapper;
import com.messagecenter.mapper.MessageMapper;
import com.messagecenter.mapper.MessageBatchTaskMapper;
import com.messagecenter.mapper.MessageInboxMapper;
import com.messagecenter.security.MessageAuthContext;
import com.messagecenter.utils.CryptoUtil;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 消息追踪与管理(管理员)：发送历史查询、单条投递状态、批量任务进度、撤回。
 */
@Service
public class MessageManageService {

    private final MessageMapper messageMapper;
    private final MessageDeliveryMapper deliveryMapper;
    private final MessageBatchTaskMapper taskMapper;
    private final MessageInboxMapper inboxMapper;
    private final CryptoUtil crypto;
    private final SsePushService ssePushService;

    public MessageManageService(MessageMapper messageMapper, MessageDeliveryMapper deliveryMapper,
                                MessageBatchTaskMapper taskMapper, MessageInboxMapper inboxMapper, CryptoUtil crypto,
                                SsePushService ssePushService) {
        this.messageMapper = messageMapper;
        this.deliveryMapper = deliveryMapper;
        this.taskMapper = taskMapper;
        this.inboxMapper = inboxMapper;
        this.crypto = crypto;
        this.ssePushService = ssePushService;
    }

    private void assertManagerOrSender(Message msg) {
        boolean manager = MessageAuthContext.isManager();
        boolean selfSender = MessageAuthContext.currentUserId() != null && MessageAuthContext.currentUserId().equals(msg.getSenderId());
        if (!manager && !selfSender) throw new MessageBizException(403, "无权限查看该消息");
        // 非平台管理员不能跨租户看
        if (!MessageAuthContext.isPlatformAdmin()) {
            Long tenant = MessageAuthContext.currentTenantId();
            if (tenant != null && tenant > 0 && !tenant.equals(msg.getTenantId()))
                throw new MessageBizException(403, "无权限查看其他租户消息");
        }
    }

    /** 发送历史分页（可按租户/角色/状态） */
    public PageResult<Message> pageMessages(int pageNum, int pageSize, Long tenantId, String senderType, String status) {
        LambdaQueryWrapper<Message> w = new LambdaQueryWrapper<>();
        if (MessageAuthContext.isPlatformAdmin()) {
            if (tenantId != null && tenantId > 0) w.eq(Message::getTenantId, tenantId);
        } else {
            Long tenant = MessageAuthContext.currentTenantId();
            w.eq(Message::getTenantId, tenant == null ? -1 : tenant);
        }
        if (senderType != null && !senderType.isBlank()) w.eq(Message::getSenderType, senderType);
        if (status != null && !status.isBlank()) w.eq(Message::getStatus, status);
        w.orderByDesc(Message::getSendTime);
        List<Message> all = messageMapper.selectList(w);
        for (Message m : all) m.setTitle(dec(m.getTitle()));
        int total = all.size();
        int from = (pageNum - 1) * pageSize;
        int to = Math.min(from + pageSize, total);
        return PageResult.of(from < total ? all.subList(from, to) : new ArrayList<>(), total, pageNum, pageSize);
    }

    /**
     * 当前用户「已发」消息（发送者视角），附带接收人数/已读数/是否可收回。
     * 任意已登录用户均可调用，结果严格按 senderId=当前用户 过滤。
     */
    public PageResult<Map<String, Object>> sentMessages(int pageNum, int pageSize) {
        String sender = MessageAuthContext.currentUserId();
        if (sender == null) throw new MessageBizException(401, "未登录");
        LambdaQueryWrapper<Message> w = new LambdaQueryWrapper<>();
        w.eq(Message::getSenderId, sender);
        if (!MessageAuthContext.isPlatformAdmin()) {
            Long tenant = MessageAuthContext.currentTenantId();
            if (tenant != null && tenant > 0) w.eq(Message::getTenantId, tenant);
        }
        w.orderByDesc(Message::getSendTime);
        List<Message> all = messageMapper.selectList(w);
        int total = all.size();
        int from = (pageNum - 1) * pageSize;
        int to = Math.min(from + pageSize, total);
        List<Message> page = from < total ? all.subList(from, to) : new ArrayList<>();
        List<Map<String, Object>> rows = new ArrayList<>();
        for (Message m : page) {
            Map<String, Object> row = new HashMap<>();
            row.put("messageId", m.getMessageId());
            row.put("title", dec(m.getTitle()));
            row.put("content", dec(m.getContent()));
            row.put("priority", m.getPriority());
            row.put("categoryCode", m.getCategoryCode());
            row.put("senderType", m.getSenderType());
            row.put("isBroadcast", m.getIsBroadcast());
            row.put("status", m.getStatus());
            row.put("sendTime", m.getSendTime() == null ? null : m.getSendTime().toString());
            long recipientCount = deliveryMapper.selectCount(new LambdaQueryWrapper<MessageDelivery>().eq(MessageDelivery::getMessageId, m.getMessageId()));
            long readCount = inboxMapper.selectCount(new LambdaQueryWrapper<MessageInbox>()
                    .eq(MessageInbox::getMessageId, m.getMessageId()).eq(MessageInbox::getIsRead, 1).eq(MessageInbox::getIsDeleted, 0));
            row.put("recipientCount", recipientCount);
            row.put("readCount", readCount);
            row.put("recallable", recipientCount > readCount);
            rows.add(row);
        }
        return PageResult.of(rows, total, pageNum, pageSize);
    }

    public Map<String, Object> messageTrace(Long messageId) {
        Message m = messageMapper.selectById(messageId);
        if (m == null) throw new MessageBizException(404, "消息不存在");
        assertManagerOrSender(m);
        Map<String, Object> out = new HashMap<>();
        out.put("messageId", m.getMessageId());
        out.put("title", dec(m.getTitle()));
        out.put("priority", m.getPriority());
        out.put("senderId", m.getSenderId());
        out.put("senderType", m.getSenderType());
        out.put("status", m.getStatus());
        out.put("isBroadcast", m.getIsBroadcast());
        out.put("sendTime", m.getSendTime() == null ? null : m.getSendTime().toString());

        long total = deliveryMapper.selectCount(new LambdaQueryWrapper<MessageDelivery>().eq(MessageDelivery::getMessageId, messageId));
        long delivered = deliveryMapper.selectCount(new LambdaQueryWrapper<MessageDelivery>()
                .eq(MessageDelivery::getMessageId, messageId).ge(MessageDelivery::getDeliveryStatus, 1));
        long read = inboxMapper.selectCount(new LambdaQueryWrapper<MessageInbox>()
                .eq(MessageInbox::getMessageId, messageId).eq(MessageInbox::getIsRead, 1));
        long starred = inboxMapper.selectCount(new LambdaQueryWrapper<MessageInbox>()
                .eq(MessageInbox::getMessageId, messageId).eq(MessageInbox::getIsStarred, 1));
        long deleted = inboxMapper.selectCount(new LambdaQueryWrapper<MessageInbox>()
                .eq(MessageInbox::getMessageId, messageId).eq(MessageInbox::getIsDeleted, 1));
        out.put("recipientCount", total);
        out.put("deliveredCount", delivered);
        out.put("readCount", read);
        out.put("starredCount", starred);
        out.put("deletedCount", deleted);
        return out;
    }

    public Map<String, Object> taskStatus(Long taskId) {
        MessageBatchTask t = taskMapper.selectById(taskId);
        if (t == null) throw new MessageBizException(404, "任务不存在");
        Map<String, Object> out = new HashMap<>();
        out.put("taskId", t.getTaskId());
        out.put("messageId", t.getMessageId());
        out.put("taskName", t.getTaskName());
        out.put("totalRecipients", t.getTotalRecipients());
        out.put("processedCount", t.getProcessedCount());
        out.put("successCount", t.getSuccessCount());
        out.put("failedCount", t.getFailedCount());
        out.put("status", t.getStatus());
        out.put("finishTime", t.getFinishTime() == null ? null : t.getFinishTime().toString());
        return out;
    }

    /**
     * 收回（仅可收回「接收方未读」的已发消息）：
     *  - 全部已读 → 拒绝撤回
     *  - 仅移除未读收件箱(置 deleted/trash) + 对应投递标记失败
     *  - 向未读接收方推送 SSE recall 事件，前端即时移除
     */
    @Transactional
    public void withdraw(Long messageId) {
        Message m = messageMapper.selectById(messageId);
        if (m == null) throw new MessageBizException(404, "消息不存在");
        assertManagerOrSender(m);
        if (!"sent".equals(m.getStatus()) && !"partial_recalled".equals(m.getStatus()))
            throw new MessageBizException(400, "仅可收回已发送消息");

        List<MessageInbox> unread = inboxMapper.selectList(new LambdaQueryWrapper<MessageInbox>()
                .eq(MessageInbox::getMessageId, messageId).eq(MessageInbox::getIsRead, 0).eq(MessageInbox::getIsDeleted, 0));
        if (unread.isEmpty()) throw new MessageBizException(400, "接收方均已读，无法收回");

        List<String> recallUids = new ArrayList<>();
        for (MessageInbox in : unread) {
            in.setIsDeleted(1);
            in.setFolder("trash");
            inboxMapper.updateById(in);
            MessageDelivery updD = new MessageDelivery();
            updD.setDeliveryStatus(3);
            deliveryMapper.update(updD, new LambdaQueryWrapper<MessageDelivery>()
                    .eq(MessageDelivery::getMessageId, messageId).eq(MessageDelivery::getUserId, in.getUserId()));
            recallUids.add(in.getUserId());
        }

        long totalInbox = inboxMapper.selectCount(new LambdaQueryWrapper<MessageInbox>().eq(MessageInbox::getMessageId, messageId));
        long unreadLeft = inboxMapper.selectCount(new LambdaQueryWrapper<MessageInbox>()
                .eq(MessageInbox::getMessageId, messageId).eq(MessageInbox::getIsRead, 0).eq(MessageInbox::getIsDeleted, 0));
        if (unreadLeft == 0 && totalInbox > 0) {
            m.setStatus("recalled");
        } else {
            m.setStatus("partial_recalled");
        }
        messageMapper.updateById(m);

        ssePushService.pushRecall(m.getTenantId(), recallUids, messageId);
    }

    /** 客户端 ack：标记某用户对某消息已确认接收(投递状态2) */
    public void ack(Long messageId, String userId) {
        List<MessageDelivery> list = deliveryMapper.selectList(new LambdaQueryWrapper<MessageDelivery>()
                .eq(MessageDelivery::getMessageId, messageId).eq(MessageDelivery::getUserId, userId));
        if (list.isEmpty()) {
            MessageDelivery d = new MessageDelivery();
            d.setTenantId(MessageAuthContext.currentTenantId());
            d.setMessageId(messageId);
            d.setUserId(userId);
            d.setDeliveryStatus(2);
            d.setChannel("sse");
            d.setRetryCount(0);
            deliveryMapper.insert(d);
            return;
        }
        for (MessageDelivery d : list) { d.setDeliveryStatus(2); deliveryMapper.updateById(d); }
    }

    /** 重新投递：对投递失败(status=3)用户重置为待投递并推送给在线会话 */
    public int retryFailed(Long messageId) {
        Message m = messageMapper.selectById(messageId);
        if (m == null) throw new MessageBizException(404, "消息不存在");
        List<MessageDelivery> failed = deliveryMapper.selectList(new LambdaQueryWrapper<MessageDelivery>()
                .eq(MessageDelivery::getMessageId, messageId).eq(MessageDelivery::getDeliveryStatus, 3));
        int cnt = 0;
        for (MessageDelivery d : failed) {
            d.setDeliveryStatus(1);
            d.setRetryCount((d.getRetryCount() == null ? 0 : d.getRetryCount()) + 1);
            d.setDeliveryTime(java.time.LocalDateTime.now());
            deliveryMapper.updateById(d);
            cnt++;
        }
        return cnt;
    }

    private String dec(String s) { return crypto.decrypt(s); }
}
