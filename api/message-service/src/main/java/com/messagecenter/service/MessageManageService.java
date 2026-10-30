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
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

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
        if (status != null && !status.isBlank()) {
            // 状态筛选：支持多值（逗号分隔），并把历史值 withdrawn 并入 recalled ——
            // 建表注释声明的词汇表是 sent/withdrawn（「已撤回」），而代码只写 recalled/partial_recalled；
            // 库里 3 行早期数据是 withdrawn，若按 recalled 精确匹配会漏掉它们（前端「已收回」筛不到）。
            java.util.List<String> ss = new ArrayList<>();
            for (String s : status.split(",")) {
                String t = s.trim();
                if (!t.isEmpty() && !ss.contains(t)) ss.add(t);
            }
            if (ss.contains("recalled") && !ss.contains("withdrawn")) ss.add("withdrawn");
            if (ss.size() == 1) w.eq(Message::getStatus, ss.get(0));
            else if (!ss.isEmpty()) w.in(Message::getStatus, ss);
        }
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
        out.put("content", dec(m.getContent()));
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

    /**
     * 接收人明细（分页）：谁收到了这条消息、看没看、什么时候看的。
     *
     * <p>数据跨两张**同库**表：{@code msg_delivery}（投递状态，一次发送即一人一条）与
     * {@code msg_inbox}（已读/收藏/删除）。以 delivery 为驱动（它是「发给谁」的唯一记录，
     * 投递失败时 inbox 副本可能不存在），再按 userId 批量回捞 inbox —— 一次 IN 查询，
     * 不做 N+1。单条消息的接收人上限就是「一次发送的受众规模」，故沿用本类既有的
     * 「全量取 + 内存过滤分页」写法（与 {@link #sentMessages} 一致），不引入联表 SQL。
     *
     * <p>排序：**未读优先**（管理端最关心「谁还没看」），组内保持 deliveryId 升序（即投递顺序，
     * 用稳定排序实现，便于「加载更多」逐页拼接时顺序可预期）。
     *
     * @param readState all（默认/null）/ read / unread
     */
    public PageResult<Map<String, Object>> recipients(Long messageId, int pageNum, int pageSize, String readState) {
        Message m = messageMapper.selectById(messageId);
        if (m == null) throw new MessageBizException(404, "消息不存在");
        assertManagerOrSender(m);

        if (pageNum <= 0) pageNum = 1;
        if (pageSize <= 0 || pageSize > 200) pageSize = 20;   // 上限保护：不给前端当导出接口用

        List<MessageDelivery> deliveries = deliveryMapper.selectList(
                new LambdaQueryWrapper<MessageDelivery>()
                        .eq(MessageDelivery::getMessageId, messageId)
                        .orderByAsc(MessageDelivery::getDeliveryId));

        Map<String, MessageInbox> inboxByUser = new HashMap<>();
        if (!deliveries.isEmpty()) {
            List<String> uids = deliveries.stream()
                    .map(MessageDelivery::getUserId)
                    .filter(u -> u != null && !u.isBlank())
                    .distinct()
                    .collect(Collectors.toList());
            if (!uids.isEmpty()) {
                List<MessageInbox> boxes = inboxMapper.selectList(new LambdaQueryWrapper<MessageInbox>()
                        .eq(MessageInbox::getMessageId, messageId)
                        .in(MessageInbox::getUserId, uids));
                for (MessageInbox in : boxes) {
                    if (in != null && in.getUserId() != null) inboxByUser.put(in.getUserId(), in);
                }
            }
        }

        List<Map<String, Object>> rows = new ArrayList<>();
        for (MessageDelivery d : deliveries) {
            MessageInbox in = inboxByUser.get(d.getUserId());
            boolean isRead = in != null && in.getIsRead() != null && in.getIsRead() == 1;
            boolean isDeleted = in != null && in.getIsDeleted() != null && in.getIsDeleted() == 1;
            if ("read".equalsIgnoreCase(readState) && !isRead) continue;
            if ("unread".equalsIgnoreCase(readState) && isRead) continue;
            Map<String, Object> row = new HashMap<>();
            // 只有 userId：姓名/账号在主库（本服务是独立库），由前端按角色到 /api/v1/user/briefs 批量补齐
            row.put("userId", d.getUserId());
            row.put("deliveryStatus", d.getDeliveryStatus());
            row.put("deliveryTime", ts(d.getDeliveryTime()));
            row.put("ackTime", ts(d.getAckTime()));
            row.put("retryCount", d.getRetryCount());
            row.put("isRead", isRead);
            row.put("readTime", in == null ? null : ts(in.getReadTime()));
            row.put("isStarred", in != null && in.getIsStarred() != null && in.getIsStarred() == 1);
            // isDeleted=1：收回会把未读副本置为已删除（见 withdraw），前端要显示「已撤回」
            row.put("isDeleted", isDeleted);
            rows.add(row);
        }

        // 未读优先；List.sort 是稳定排序 → 组内保持 deliveryId 升序
        rows.sort(Comparator.comparing(r -> Boolean.TRUE.equals(r.get("isRead")) ? 1 : 0));

        int total = rows.size();
        int from = (pageNum - 1) * pageSize;
        int to = Math.min(from + pageSize, total);
        List<Map<String, Object>> page = from < total
                ? new ArrayList<>(rows.subList(from, to)) : new ArrayList<>();
        return PageResult.of(page, total, pageNum, pageSize);
    }

    /**
     * 时间出参统一为 {@code LocalDateTime.toString()}（本地墙钟串，无 Z）。
     * 刻意与 {@link #messageTrace} 等既有出口保持一致：前端按本地时间直接展示；
     * 若这里改用带 Z 的形态，前端会按 UTC 解读而静默偏移 8 小时。
     */
    private String ts(java.time.LocalDateTime t) {
        return t == null ? null : t.toString();
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

        // 推送目标按 userId 路由（2026-10-12 起会话 key 不再含租户，见 SsePushService）
        ssePushService.pushRecall(recallUids, messageId);
    }

    /**
     * 管理员全局彻底删除（moderation 工具）：
     *  - 删除主消息 + 所有收件箱索引(msg_inbox) + 所有投递记录(msg_delivery)
     *  - 向所有接收方推送 SSE 删除事件，要求在线客户端立即移除该消息
     *  - 非平台管理员仅可删除本租户消息
     *  - 幂等：消息不存在直接返回
     */
    @Transactional
    public void deleteMessageGlobal(Long messageId) {
        Message m = messageMapper.selectById(messageId);
        if (m == null) return;
        if (!MessageAuthContext.isPlatformAdmin()) {
            Long tenant = MessageAuthContext.currentTenantId();
            if (tenant != null && tenant > 0 && !tenant.equals(m.getTenantId()))
                throw new MessageBizException(403, "无权限删除其他租户消息");
        }
        // 删除前收集所有接收方（用于 SSE 通知）
        List<String> uids = inboxMapper.selectList(new LambdaQueryWrapper<MessageInbox>().eq(MessageInbox::getMessageId, messageId))
                .stream().map(MessageInbox::getUserId).distinct().collect(Collectors.toList());
        inboxMapper.delete(new LambdaQueryWrapper<MessageInbox>().eq(MessageInbox::getMessageId, messageId));
        deliveryMapper.delete(new LambdaQueryWrapper<MessageDelivery>().eq(MessageDelivery::getMessageId, messageId));
        messageMapper.deleteById(messageId);
        ssePushService.pushDelete(uids, messageId);
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
