package com.reservation.service;

import com.reservation.common.PageResult;
import com.reservation.common.Result;
import com.reservation.utils.CryptoUtil;
import com.reservation.utils.TenantContext;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 「接收台账」——**平台方发出的消息，投递到了本租户哪些用户**（接收方视角的台账）。
 *
 * <h3>为什么这个视图必须由主系统提供，而不是 message-service</h3>
 * 消息库里 {@code msg_message.tenant_id} / {@code msg_delivery.tenant_id} / {@code msg_inbox.tenant_id}
 * 记的都是**发送方租户**（写扩散时原样带入），三张表里**没有任何一列是「接收方租户」**。
 * 所以"这条消息进了本租户哪些用户"这个判断，消息库自己算不出来：
 *   <ul>
 *   <li>按 {@code tenant_id} 过滤 = 按发送方过滤，语义完全错位（这正是 2026-10-12 修掉的收件箱缺陷）；</li>
 *   <li>接收人归属租户只存在于主库 {@code lesson_appointment.user.tenant_id}。</li>
 *   </ul>
 * 主系统同时拥有「本租户用户」与（同 MySQL 实例下的）消息库表，故在本服务做跨 schema 只读聚合，
 * 租户边界由 {@link #resolveScope} 在服务端判定，**不接受前端传入的 userId 清单**（那等于把越权判断交给调用方）。
 *
 * <h3>为什么用 JdbcTemplate 而不是 Mapper + 租户插件</h3>
 * 本项目 MyBatis-Plus 的 {@code TenantLineInnerInterceptor} 会给 SQL 里每张未被忽略的表追加
 * {@code tenant_id = 本租户}。这些消息表**列名相同、语义不同**，被插件一追加就会：
 *   <ul>
 *   <li>{@code msg_message.tenant_id = 2} → 平台方发出的消息（tenant_id=0）全部消失，查出 0 条；</li>
 *   <li>{@code msg_inbox.tenant_id = 2} → 同理（该列是发送方租户）。</li>
 *   </ul>
 * 故这里走原生 SQL：既绕开语义错位的自动条件，又让「本租户」这个约束以**显式 SQL 条件**出现，
 * 可被审阅、可被测试。user 表仍由本服务显式加 {@code u.tenant_id = ?} 过滤（不依赖插件）。
 *
 * <h3>两个必须交代的口径</h3>
 *   <ol>
 *   <li><b>接收人必须能在主库定位到真实用户</b>：孤儿 userId（真库存量测试脏数据）不计入台账，
 *       故本服务对 user 表用 **INNER JOIN**，列表的「接收人数」等于「能落到人的接收人数」。</li>
 *   <li><b>时间一律出 {@code yyyy-MM-ddTHH:mm:ss} 裸串（不带 Z）</b>：{@code send_time} 是发送时的
 *       **本地墙钟**（{@code LocalDateTime.now()}），而主系统 JacksonConfig 会给 LocalDateTime 补 Z
 *       （按其"值即 UTC"的既有约定）。这里若走 Jackson 序列化，前端会按 UTC 解读而静默偏 8 小时，
 *       故在 SQL 层用 {@code DATE_FORMAT} 直接产串，与 message-service 的时间出参形态保持一致。</li>
 *   </ol>
 */
@Service
public class MessageLedgerService {

    /**
     * 跨 schema JOIN 必须显式统一 collation：message_center 是 utf8mb4_0900_ai_ci，
     * lesson_appointment 是 utf8mb4_general_ci，直接 {@code u.user_id = d.user_id}
     * 会报 {@code ERROR 1267 Illegal mix of collations}。
     */
    private static final String USER_ID_COLLATE = " COLLATE utf8mb4_general_ci ";

    /** 台账只列「平台方发出」的消息：发送方租户 = 0（平台自身）。 */
    private static final String PLATFORM_SENT_CONDITION = " m.tenant_id = 0 ";

    private static final String INBOUND_FROM =
            " FROM message_center.msg_message m "
          + " JOIN message_center.msg_delivery d ON d.message_id = m.message_id "
          + " JOIN lesson_appointment.user u ON u.user_id = d.user_id" + USER_ID_COLLATE
          + " LEFT JOIN message_center.msg_inbox i ON i.message_id = m.message_id AND i.user_id = d.user_id ";

    private static final String RECIPIENTS_FROM =
            " FROM message_center.msg_delivery d "
          + " JOIN message_center.msg_message m ON m.message_id = d.message_id "
          + " JOIN lesson_appointment.user u ON u.user_id = d.user_id" + USER_ID_COLLATE
          + " LEFT JOIN message_center.msg_inbox i ON i.message_id = d.message_id AND i.user_id = d.user_id ";

    private final JdbcTemplate jdbcTemplate;
    private final CryptoUtil cryptoUtil;

    public MessageLedgerService(JdbcTemplate jdbcTemplate, CryptoUtil cryptoUtil) {
        this.jdbcTemplate = jdbcTemplate;
        this.cryptoUtil = cryptoUtil;
    }

    /**
     * 平台方消息 → 本租户用户的接收台账（分页）。
     *
     * @param readState all（默认/null）/ unread（只看"还有本租户用户没读"）/ read
     * @param messageId 传了则只查这一条（小程序接收台账详情复用本端点取消息头）
     * @param tenantIdParam 仅**平台管理员**可用：指定看哪个租户；租户管理员传了也被忽略（强制本租户）
     * @param platformAdmin 调用者是否平台管理员（由控制器从令牌判定后传入，服务层不信任入参）
     */
    public Result<PageResult<Map<String, Object>>> platformInbound(int pageNum, int pageSize, String readState,
                                                                  Long messageId, Long tenantIdParam,
                                                                  boolean platformAdmin) {
        int p = pageNum <= 0 ? 1 : pageNum;
        int s = (pageSize <= 0 || pageSize > 100) ? 10 : pageSize;

        Long scope;
        try {
            scope = resolveScope(tenantIdParam, platformAdmin);
        } catch (IllegalStateException e) {
            return Result.fail(403, e.getMessage());
        }

        List<Object> args = new ArrayList<>();
        String where = buildWhere(scope, readState, messageId, args);

        Long total = jdbcTemplate.queryForObject(
                "SELECT COUNT(DISTINCT m.message_id)" + INBOUND_FROM + where,
                Long.class, args.toArray());
        long totalRows = total == null ? 0L : total;

        List<Object> pageArgs = new ArrayList<>(args);
        pageArgs.add((p - 1) * s);
        pageArgs.add(s);

        // GROUP BY 列出全部非聚合列：MySQL 8 默认 ONLY_FULL_GROUP_BY 会拒绝省略
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                "SELECT m.message_id AS messageId, m.title AS title, m.content AS content,"
              + " m.sender_id AS senderId,"
              + " m.sender_type AS senderType, m.priority AS priority, m.status AS status,"
              + " DATE_FORMAT(m.send_time, '%Y-%m-%dT%H:%i:%s') AS sendTime,"
              + " COUNT(d.delivery_id) AS recipientCount,"
              + " SUM(CASE WHEN i.is_read = 1 THEN 1 ELSE 0 END) AS readCount"
              + INBOUND_FROM + where
              + " GROUP BY m.message_id, m.title, m.content, m.sender_id, m.sender_type, m.priority, m.status, m.send_time"
              + " ORDER BY m.send_time DESC, m.message_id DESC LIMIT ?, ?",
                pageArgs.toArray());

        for (Map<String, Object> r : rows) {
            r.put("title", decrypt(r.get("title")));
            // 正文同样入库加密；租户管理员在 message-service 侧读不到这条消息（发送方租户≠本租户，会 403），
            // 台账是唯一能看到"平台方到底发了什么"的入口，故正文一并在本接口给出。
            r.put("content", decrypt(r.get("content")));
            r.put("recipientCount", toLong(r.get("recipientCount")));
            r.put("readCount", toLong(r.get("readCount")));
        }
        return Result.success(page(rows, totalRows, p, s), "查询成功");
    }

    /**
     * 某条平台方消息在**本租户**的接收人明细（姓名/账号/是否已读/时间），未读优先。
     *
     * @param readState all（默认/null）/ read / unread
     */
    public Result<PageResult<Map<String, Object>>> inboundRecipients(long messageId, int pageNum, int pageSize,
                                                                     String readState,
                                                                     Long tenantIdParam, boolean platformAdmin) {
        int p = pageNum <= 0 ? 1 : pageNum;
        int s = (pageSize <= 0 || pageSize > 200) ? 20 : pageSize;

        Long scope;
        try {
            scope = resolveScope(tenantIdParam, platformAdmin);
        } catch (IllegalStateException e) {
            return Result.fail(403, e.getMessage());
        }

        Integer exists = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM message_center.msg_message WHERE message_id = ? AND" + PLATFORM_SENT_CONDITION,
                Integer.class, messageId);
        if (exists == null || exists == 0) {
            return Result.fail(404, "消息不存在或非平台方发出");
        }

        List<Object> args = new ArrayList<>();
        args.add(messageId);
        StringBuilder where = new StringBuilder(" WHERE d.message_id = ? AND " + PLATFORM_SENT_CONDITION);
        if (scope != null) {
            where.append(" AND u.tenant_id = ? ");
            args.add(scope);
        }
        String readCond = readCondition(readState);
        if (readCond != null) where.append(readCond);

        Long total = jdbcTemplate.queryForObject(
                "SELECT COUNT(*)" + RECIPIENTS_FROM + where, Long.class, args.toArray());
        long totalRows = total == null ? 0L : total;

        List<Object> pageArgs = new ArrayList<>(args);
        pageArgs.add((p - 1) * s);
        pageArgs.add(s);

        // 未读优先（台账最关心「谁还没看」），组内保持投递顺序 delivery_id，便于分页拼接
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                "SELECT d.user_id AS userId, u.name AS name, u.account AS account,"
              + " d.delivery_status AS deliveryStatus,"
              + " DATE_FORMAT(d.delivery_time, '%Y-%m-%dT%H:%i:%s') AS deliveryTime,"
              + " DATE_FORMAT(d.ack_time, '%Y-%m-%dT%H:%i:%s') AS ackTime,"
              + " COALESCE(i.is_read, 0) AS isRead,"
              + " DATE_FORMAT(i.read_time, '%Y-%m-%dT%H:%i:%s') AS readTime,"
              + " COALESCE(i.is_deleted, 0) AS isDeleted"
              + RECIPIENTS_FROM + where
              + " ORDER BY COALESCE(i.is_read, 0) ASC, d.delivery_id ASC LIMIT ?, ?",
                pageArgs.toArray());

        List<Map<String, Object>> out = new ArrayList<>(rows.size());
        for (Map<String, Object> r : rows) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("userId", r.get("userId"));
            // 姓名入库是 AES 密文、账号是明文；decrypt 对非密文原样返回
            row.put("name", decrypt(r.get("name")));
            row.put("account", decrypt(r.get("account")));
            row.put("deliveryStatus", toLong(r.get("deliveryStatus")));
            row.put("deliveryTime", r.get("deliveryTime"));
            row.put("ackTime", r.get("ackTime"));
            row.put("isRead", toLong(r.get("isRead")) != null && toLong(r.get("isRead")) == 1L);
            row.put("readTime", r.get("readTime"));
            row.put("isDeleted", toLong(r.get("isDeleted")) != null && toLong(r.get("isDeleted")) == 1L);
            out.add(row);
        }
        return Result.success(page(out, totalRows, p, s), "查询成功");
    }

    // ==================== 内部 ====================

    /**
     * 解析本次查询的「接收方租户」作用域。
     *
     * <ul>
     *   <li>平台管理员（token tenantId=0）：未指定 tenantId → {@code null}（看全平台接收情况）；指定 → 只看该租户。</li>
     *   <li>租户管理员：**强制本租户**，入参 tenantId 一律忽略 —— 否则前端随手改个参数就能读到别家租户的收件台账。</li>
     * </ul>
     * 返回 {@code null} 表示不加接收方租户条件。
     */
    private Long resolveScope(Long tenantIdParam, boolean platformAdmin) {
        if (platformAdmin) {
            return (tenantIdParam != null && tenantIdParam > 0) ? tenantIdParam : null;
        }
        Long cur = TenantContext.getTenantId();
        if (cur == null || cur <= 0) {
            // 租户管理员却没有租户上下文：宁可拒绝，也不能退化成"查全量"
            throw new IllegalStateException("当前账号没有租户上下文，无法查看接收台账");
        }
        return cur;
    }

    /**
     * 列表的 WHERE：平台方发出 + 接收方租户（若有）+ 读状态（若有）。
     *
     * <p>读状态筛选作用于**投递行**（msg_delivery ⋈ msg_inbox），因此：
     *   <ul>
     *   <li>{@code unread} —— 接收人数即"本租户还有几个人没读"，读满的消息自然被过滤掉；</li>
     *   <li>{@code read}   —— 反之。</li>
     *   </ul>
     * {@code COALESCE(i.is_read, 0)}：投递存在但收件箱副本缺失时视为「未读」（与
     * {@code recipientStateText} 的判定一致），故左连接的 NULL 必须按 0 处理。
     */
    private String buildWhere(Long scope, String readState, Long messageId, List<Object> args) {
        String where = " WHERE " + PLATFORM_SENT_CONDITION;
        if (messageId != null) {
            // 单条查询：小程序「接收台账」详情需要消息头（标题/正文/发送者/时间/状态/本租户计数）。
            // 复用同一端点而非另开 /inbound/{mid}，省一条新路由与一条授权声明，语义也一致
            // （同一套租户作用域与只读约束）。
            where += " AND m.message_id = ? ";
            args.add(messageId);
        }
        if (scope != null) {
            where += " AND u.tenant_id = ? ";
            args.add(scope);
        }
        String readCond = readCondition(readState);
        if (readCond != null) where += readCond;
        return where;
    }

    private String readCondition(String readState) {
        if ("read".equalsIgnoreCase(readState)) return " AND COALESCE(i.is_read, 0) = 1 ";
        if ("unread".equalsIgnoreCase(readState)) return " AND COALESCE(i.is_read, 0) = 0 ";
        return null;
    }

    private <T> PageResult<T> page(List<T> rows, long total, int pageNum, int pageSize) {
        int totalPages = pageSize <= 0 ? 0 : (int) ((total + pageSize - 1) / pageSize);
        return new PageResult<>(rows, total, pageNum, pageSize, totalPages);
    }

    private String decrypt(Object v) {
        return v == null ? null : cryptoUtil.decrypt(String.valueOf(v));
    }

    private Long toLong(Object v) {
        if (v == null) return null;
        if (v instanceof Number) return ((Number) v).longValue();
        try {
            return Long.valueOf(String.valueOf(v));
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
