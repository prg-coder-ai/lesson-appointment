package com.messagecenter.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.messagecenter.common.PageResult;
import com.messagecenter.entity.MessageInbox;
import com.messagecenter.exception.MessageBizException;
import com.messagecenter.mapper.MessageInboxMapper;
import com.messagecenter.security.MessageAuthContext;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/** 收件箱状态服务：列表 / 详情 / 已读未读 / 收藏 / 删除恢复 / 未读数 */
@Service
public class InboxService {

    private final MessageInboxMapper inboxMapper;
    private final MessageService messageService;

    public InboxService(MessageInboxMapper inboxMapper, MessageService messageService) {
        this.inboxMapper = inboxMapper;
        this.messageService = messageService;
    }

    /** 校验收件箱行访问权：本人 或 管理员(admin/platform_admin，运营代查/代管)；非平台管理员限本租户 */
    private void assertAccess(MessageInbox in) {
        if (in == null) throw new MessageBizException(404, "消息不存在");
        String curUser = MessageAuthContext.currentUserId();
        boolean self = curUser != null && curUser.equals(in.getUserId());
        boolean manager = MessageAuthContext.isManager();
        if (!self && !manager) throw new MessageBizException(403, "无权访问他人消息");
        if (!MessageAuthContext.isPlatformAdmin()) {
            Long curTenant = MessageAuthContext.currentTenantId();
            if (curTenant != null && curTenant > 0 && !curTenant.equals(in.getTenantId())) {
                throw new MessageBizException(403, "无权访问其他租户的消息");
            }
        }
    }

    private LambdaQueryWrapper<MessageInbox> scopedWrapper(String userId) {
        LambdaQueryWrapper<MessageInbox> w = new LambdaQueryWrapper<>();
        w.eq(MessageInbox::getUserId, userId);
        if (!MessageAuthContext.isPlatformAdmin()) {
            Long curTenant = MessageAuthContext.currentTenantId();
            if (curTenant != null && curTenant > 0) w.eq(MessageInbox::getTenantId, curTenant);
        }
        return w;
    }

    public MessageInbox findByUserIdAndMessageId(String userId, Long messageId) {
        return inboxMapper.selectOne(scopedWrapper(userId).eq(MessageInbox::getMessageId, messageId).last("limit 1"));
    }

    // ------- 详情 -------
    public Map<String, Object> detail(String userId, Long messageId) {
        MessageInbox in = require(userId, messageId);
        MessageInbox c = messageService.composeInbox(in);
        if (c == null || c.getMessage() == null) throw new MessageBizException(404, "消息详情不存在");
        Map<String, Object> out = new java.util.HashMap<>();
        out.put("inboxId", c.getId());
        out.put("messageId", messageId);
        out.put("userId", c.getUserId());
        out.put("title", c.getTitle());
        // 解密正文与 payload
        com.messagecenter.entity.Message m = c.getMessage();
        out.put("content", messageService.decryptContent(m));
        out.put("priority", m.getPriority());
        out.put("senderId", m.getSenderId());
        out.put("senderType", m.getSenderType());
        out.put("categoryCode", m.getCategoryCode());
        out.put("categoryName", c.getCategoryName());
        out.put("payload", messageService.decryptPayload(m));
        out.put("sendTime", m.getSendTime() == null ? null : m.getSendTime().toString());
        out.put("isRead", c.getIsRead());
        out.put("isStarred", c.getIsStarred());
        out.put("isDeleted", c.getIsDeleted());
        out.put("readTime", c.getReadTime() == null ? null : c.getReadTime().toString());
        return out;
    }

    // ------- 列表 -------
    public PageResult<MessageInbox> listInbox(String userId, int pageNum, int pageSize, String folder,
                                              String keyword, Integer unreadOnly, String categoryCode,
                                              String priority, String start, String end) {
        LambdaQueryWrapper<MessageInbox> w = scopedWrapper(userId);
        if (folder != null && !folder.isBlank()) {
            if ("trash".equalsIgnoreCase(folder)) w.eq(MessageInbox::getIsDeleted, 1);
            else if ("starred".equalsIgnoreCase(folder)) w.eq(MessageInbox::getIsStarred, 1).eq(MessageInbox::getIsDeleted, 0);
            else w.eq(MessageInbox::getIsDeleted, 0);
        } else {
            w.eq(MessageInbox::getIsDeleted, 0);
        }
        if (unreadOnly != null && unreadOnly == 1) w.eq(MessageInbox::getIsRead, 0);
        w.orderByDesc(MessageInbox::getCreatedAt);

        // 先取全量(收件箱量级可接受)做内存筛选，简化关键词/分类/优先级联表
        List<MessageInbox> all = inboxMapper.selectList(w);
        List<MessageInbox> filtered = new ArrayList<>();
        for (MessageInbox in : all) {
            MessageInbox c = messageService.composeInbox(in);
            if (c == null) continue;
            boolean hit = true;
            if (keyword != null && !keyword.isBlank()) {
                String kw = keyword.toLowerCase();
                boolean inTitle = c.getTitle() != null && c.getTitle().toLowerCase().contains(kw);
                if (!inTitle) continue;
            }
            if (categoryCode != null && !categoryCode.isBlank()) {
                if (c.getCategoryCode() == null || !categoryCode.equalsIgnoreCase(c.getCategoryCode())) continue;
            }
            if (priority != null && !priority.isBlank() && c.getPriority() != null && !priority.equalsIgnoreCase(c.getPriority())) continue;
            if (start != null && !start.isBlank() && c.getSendTime() != null && c.getSendTime().isBefore(LocalDateTime.parse(start))) continue;
            if (end != null && !end.isBlank() && c.getSendTime() != null && c.getSendTime().isAfter(LocalDateTime.parse(end))) continue;
            if (hit) filtered.add(c);
        }
        int total = filtered.size();
        int from = (pageNum - 1) * pageSize;
        int to = Math.min(from + pageSize, total);
        List<MessageInbox> page = from < total ? filtered.subList(from, to) : new ArrayList<>();
        return PageResult.of(page, total, pageNum, pageSize);
    }

    // ------- 状态 -------
    @Transactional
    public void setRead(String userId, Long messageId, boolean read) {
        MessageInbox in = require(userId, messageId);
        in.setIsRead(read ? 1 : 0);
        in.setReadTime(read ? LocalDateTime.now() : null);
        inboxMapper.updateById(in);
    }

    @Transactional
    public void batchRead(String userId, List<Long> messageIds, boolean read) {
        for (Long mid : messageIds) {
            try { setRead(userId, mid, read); } catch (Exception ignored) {}
        }
    }

    @Transactional
    public void setStar(String userId, Long messageId, boolean star) {
        MessageInbox in = require(userId, messageId);
        in.setIsStarred(star ? 1 : 0);
        if (star) in.setFolder("starred");
        inboxMapper.updateById(in);
    }

    @Transactional
    public void deleteOne(String userId, Long messageId) {
        MessageInbox in = require(userId, messageId);
        in.setIsDeleted(1);
        in.setFolder("trash");
        inboxMapper.updateById(in);
    }

    @Transactional
    public void batchDelete(String userId, List<Long> messageIds) {
        for (Long mid : messageIds) {
            try { deleteOne(userId, mid); } catch (Exception ignored) {}
        }
    }

    @Transactional
    public void restore(String userId, Long messageId) {
        MessageInbox in = require(userId, messageId);
        in.setIsDeleted(0);
        in.setFolder("inbox");
        inboxMapper.updateById(in);
    }

    public long unreadCount(String userId) {
        LambdaQueryWrapper<MessageInbox> w = scopedWrapper(userId)
                .eq(MessageInbox::getIsDeleted, 0).eq(MessageInbox::getIsRead, 0);
        return inboxMapper.selectCount(w);
    }

    public List<Long> listMessageIds(String userId, Integer isDeleted) {
        LambdaQueryWrapper<MessageInbox> w = scopedWrapper(userId);
        if (isDeleted != null) w.eq(MessageInbox::getIsDeleted, isDeleted);
        w.orderByDesc(MessageInbox::getCreatedAt);
        List<MessageInbox> all = inboxMapper.selectList(w);
        return all.stream().map(MessageInbox::getMessageId).collect(Collectors.toList());
    }

    private MessageInbox require(String userId, Long messageId) {
        MessageInbox in = findByUserIdAndMessageId(userId, messageId);
        assertAccess(in);
        return in;
    }
}
