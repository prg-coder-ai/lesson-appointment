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

    /**
     * 校验收件箱行访问权：本人 或 平台管理员。
     *
     * <p><b>2026-10-12 修正</b>：原先还有一道「非平台管理员时 curTenant 必须等于 in.getTenantId()」。
     * 但 {@code msg_inbox.tenant_id} 记的是**发送方租户**（写扩散时原样带入 msg_message.tenant_id），
     * 不是接收人的归属租户，拿它判接收人越权会**双向失效**：
     *   ① 误伤 —— 平台方发出（tenant_id = 0）的消息，租户用户读自己的那一行也被判 403；
     *   ② 拦不住 —— 租户 A 的管理员读租户 B 用户的行时，只要该行是 A 发出的就能通过。
     * 改为不判租户；「代查他人收件箱」的边界统一由 {@link #assertUserScope(String)} 收敛为平台管理员。
     */
    private void assertAccess(MessageInbox in) {
        if (in == null) throw new MessageBizException(404, "消息不存在");
        String curUser = MessageAuthContext.currentUserId();
        boolean self = curUser != null && curUser.equals(in.getUserId());
        if (!self && !MessageAuthContext.isPlatformAdmin()) throw new MessageBizException(403, "无权访问他人消息");
    }

    /**
     * 列表/计数场景的访问权判据。
     *
     * <p>为什么不能直接用 {@link #assertAccess(MessageInbox)}：那需要先查出一行具体的收件箱记录，
     * 而 listInbox / unreadCount / listMessageIds 在鉴权前并不持有任何行；先查再判等于把
     * "能否访问 userId 的收件箱"这个判断寄托在查询结果上——越权者恰好会因为查不到行而拿到 404，
     * 语义混乱，且批量接口每行判一次会把开销放大。
     *
     * <p><b>2026-10-12 修正</b>：查询侧不再拼 tenant_id（原因见 {@link #scopedWrapper(String)}），
     * 于是这里必须自己把「能不能看这个 userId」判牢：**本人 或 平台管理员**（跨租户运营视角）。
     * 租户管理员代查本租户他人收件箱需要「目标用户所属租户」，而本服务是独立库拿不到
     * （要跨服务问主系统），故先收敛为平台管理员；两端 UI 经核查也没有代查入口，全部传本人 userId。
     */
    private void assertUserScope(String userId) {
        if (userId == null || userId.isBlank()) {
            throw new MessageBizException(400, "用户ID不能为空");
        }
        String curUser = MessageAuthContext.currentUserId();
        boolean self = curUser != null && curUser.equals(userId);
        if (!self && !MessageAuthContext.isPlatformAdmin()) {
            throw new MessageBizException(403, "无权访问他人消息");
        }
    }

    /**
     * 收件箱行查询条件。
     *
     * <p><b>2026-10-12 修正：不再拼 tenant_id。</b>该列语义是**发送方租户**
     * （写扩散时原样带 msg_message.tenant_id），却被当成接收侧过滤维度用，导致平台方发出
     * （tenant_id = 0）的消息在租户用户的列表/详情/未读数里全部消失
     * （真库受影响 13 行 / 9 个用户，且全部未读）。
     *
     * <p>收件箱的归属键就是 userId，不需要租户参与：
     *   · 唯一键 {@code uk_user_msg(user_id, message_id)} 里就没有 tenant_id；
     *   · user_id 是主键、全局唯一，{@code user_id = ?} 已精确圈定一个人的收件箱；
     *   · 同一个 userId 的行**本来就跨多个 tenant_id 值**（真库某租户2 admin：874 行跨 {0,2}），
     *     用单值 tenant_id 过滤必然丢行。
     */
    private LambdaQueryWrapper<MessageInbox> scopedWrapper(String userId) {
        LambdaQueryWrapper<MessageInbox> w = new LambdaQueryWrapper<>();
        w.eq(MessageInbox::getUserId, userId);
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
        // 发送方租户：msg_message.tenant_id 在发送时取自**发送者**的令牌租户（写扩散时原样落到 msg_inbox），
        // 所以它就是「这条消息属于哪家租户」。平台管理员（tenant_id=0）收到的租户来函，靠这个字段
        // 在前端映射成公司名（sys_tenant.org_name 在主库，本服务是独立库拿不到，故只回 ID 不回名称）。
        // 平台自身发出的消息该值为 0，前端据此省略整段展示。
        out.put("senderTenantId", m.getTenantId());
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
        assertUserScope(userId);
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

    /** 物理删除（彻底删除）：仅本人或管理员可对自己/代管的消息执行；回收站清空用它。 */
    @Transactional
    public void purgeOne(String userId, Long messageId) {
        MessageInbox in = require(userId, messageId);
        // 必须按主键 id 删自己的收件箱副本，不能用 messageId：
        // messageId 对应的是 msg_message 的主键，而 msg_inbox.id 是自增主键。
        // 传 messageId 会命中「id 恰好等于该 messageId」的任意一行（别人的收件箱副本也可能被删），
        // 症状是「A 彻底删除了自己的消息，B 的那条却凭空消失」。
        // 注意：这里只删收件箱副本，绝不碰 msg_message 主消息——
        // 主消息是全局唯一且被所有收件人共享，单独删除会让其他收件人的副本变成空白。
        inboxMapper.deleteById(in.getId());
    }

    @Transactional
    public void purgeBatch(String userId, List<Long> messageIds) {
        for (Long mid : messageIds) {
            try { purgeOne(userId, mid); } catch (Exception ignored) {}
        }
    }

    public long unreadCount(String userId) {
        assertUserScope(userId);
        LambdaQueryWrapper<MessageInbox> w = scopedWrapper(userId)
                .eq(MessageInbox::getIsDeleted, 0).eq(MessageInbox::getIsRead, 0);
        return inboxMapper.selectCount(w);
    }

    public List<Long> listMessageIds(String userId, Integer isDeleted) {
        assertUserScope(userId);
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
