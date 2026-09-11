package com.reservation.service;

import com.reservation.common.RoleConst;
import com.reservation.entity.Appointment;
import com.reservation.entity.Booking;
import com.reservation.entity.User;
import com.reservation.mapper.BookingMapper;
import com.reservation.utils.JwtUtil;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import jakarta.annotation.PostConstruct;
import jakarta.annotation.Resource;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 消息中心自动发送（业务钩子调用）。
 *
 * 通过 HTTP 调用 message-service(默认 http://localhost:8090)，发送方身份用与 message-service
 * 共享的 jwt.secret 现签一个令牌（sub=发送者userId, role, tenantId），message-service 校验通过后
 * 据此落库并投递。所有发送均为 best-effort：失败仅记录日志，不影响主业务流程。
 */
@Slf4j
@Service
public class MessageNotifyService {

    @Value("${message.service.base-url:http://localhost:8090}")
    private String baseUrl;

    private final JwtUtil jwtUtil;
    private final UserService userService;
    private final BookingMapper bookingMapper;

    /** 递补通知要带首节课时间，故读取课次表 */
    @Resource
    private AppointmentService appointmentService;

    /** 通知正文要按租户行业词渲染（法律咨询租户应看到「咨询话题/预约时间/咨询」而不是「课程/上课时间/上课」） */
    @Resource
    private TermService termService;

    /* ==================================================================
     * 通知文案模板（集中在此，便于一眼看清"哪些词是行业相关的"）
     *
     * {key} 是**术语占位符**，发送时按「租户词 > 行业词 > 平台词」逐级取词渲染
     * （见 {@link TermService#renderTemplate}）。三条写作规矩：
     *
     *   ① 凡行业相关名词一律写 {key}，**绝不写死「课程/上课/学生/排期/教师」**——
     *      写死等于把教育行业的话术原样发给律所、心理咨询、健身房租户。
     *   ② 只有模板里**显式写出**的 {key} 才取词；动态数据（课次时间、人名）不走占位符，
     *      否则数据里恰好含锚点词（排期名就叫「课程A」）会被误改。
     *   ③ 所有作用域都查不到的 key **原样保留 {key}**，拼错在测试期即暴露
     *      （e2e 第 15 组静态护栏会直接红），不静默清空。
     *
     * 可用 key 清单见 frontend/js/public/terms.js 的 TERM_KEYS；新增 key 需同步
     * 平台词(industry_id=0,tenant_id=0)，否则行业租户会回退到平台词或裸露 {key}。
     *
     * 之所以不在发送后由前端替换：消息正文落库即静态文本，且 message-service 的库
     * （message_center）根本没有 sys_term 表，只有业务端取得到词。
     * 代价是词表后续调整不会回溯改写历史消息——通知作为"当时发生了什么"的凭证，
     * 保持不可变更合理。
     * ================================================================== */

    /** 学生预订 → 教师 + 管理员 */
    private static final String BOOKING_CREATED_TITLE = "新的{course}预约";
    private static final String BOOKING_CREATED_BODY = "您有一笔新的{course}预约待处理。";

    /** 学生候补（名额已满）→ 教师 + 管理员。标题与预订不同，用于在同一分类下区分两类待处理项 */
    private static final String WAITLIST_CREATED_TITLE = "新的候补申请";
    private static final String WAITLIST_CREATED_BODY =
            "有名额已满的{schedule}收到候补申请，请留意名额释放后的补位处理。";

    /** 学生请假（法律/心理咨询行业词为「改期」）→ 教师 + 管理员 */
    private static final String LEAVE_CREATED_TITLE = "{student}{leave}申请";
    private static final String LEAVE_CREATED_BODY = "{student}提交了{leave}申请，请及时处理。";

    /** 管理员确认通知的标题（预订与请假共用） */
    private static final String STUDENT_CONFIRMED_TITLE = "预约已确认";
    /** 管理员确认预订 → 学生 */
    private static final String STUDENT_CONFIRMED_BOOKING_BODY = "您的{course}预约已被管理员确认。";
    /** 管理员确认请假（法律/心理咨询行业词为「改期」）→ 学生 */
    private static final String STUDENT_CONFIRMED_LEAVE_BODY = "您的{leave}已被管理员确认。";

    /**
     * 「确认了什么」的动作码，由 Controller 传入。
     *
     * <p>刻意不传中文短语：文案常量全部留在本类，控制层只表达语义，
     * 否则「课程预约」这类行业相关词就会散落到 Controller 里——
     * 写死一处漏一处，静态护栏（e2e 第 15 组）也扫不到。
     */
    public static final String ACTION_BOOKING = "BOOKING";
    public static final String ACTION_LEAVE = "LEAVE";

    /**
     * 递补成功通知正文，分三段拼装（首节课那句在查不到课次时整段省略）。
     *
     * <p>与上面几条的区别：正文含动态数据（首节课时间），故术语词与数据合并成
     * 一个 Map 一次渲染（详见 {@link TermService#renderTemplate(String, Map)}）。
     */
    private static final String WAITLIST_PROMOTED_HEAD =
            "恭喜！你申请的候补已递补成功，正式获得该{course}名额，系统已为你生成时间表。";
    private static final String WAITLIST_PROMOTED_FIRST =
            "首次{lessonTime}：{firstLesson}。";
    private static final String WAITLIST_PROMOTED_TAIL =
            "请在「今日{course}」中查看并按时{lesson}。";

    private RestTemplate restTemplate;

    public MessageNotifyService(JwtUtil jwtUtil, UserService userService, BookingMapper bookingMapper) {
        this.jwtUtil = jwtUtil;
        this.userService = userService;
        this.bookingMapper = bookingMapper;
    }

    @PostConstruct
    private void init() {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(2000);
        factory.setReadTimeout(3000);
        this.restTemplate = new RestTemplate(factory);
    }

    // ============ 业务钩子入口 ============

    /** 学生预订课程 → 通知教师 + 本租户管理员（发送者=学生）。文案按该租户的行业词渲染 */
    public void notifyBookingCreated(String bookingId) {
        Booking b = bookingMapper.selectByIdIgnoreTenant(bookingId);
        if (b == null || b.getStudentId() == null || b.getTeacherId() == null) return;
        Long tenantId = b.getTenantId();
        notifyTeacherAndAdmin(b.getStudentId(), b.getTeacherId(), tenantId,
                render(tenantId, BOOKING_CREATED_TITLE), render(tenantId, BOOKING_CREATED_BODY),
                "BOOKING_CREATED");
    }

    /** 学生候补预订（排期名额已满）→ 通知教师 + 本租户管理员（发送者=学生）
     *  分类与正常预订同为 BOOKING_CREATED：管理员在同一分类下看到预约与候补两类待处理项，
     *  靠「新的候补申请」这一标题区分，不额外增加分类维度。 */
    public void notifyWaitlistCreated(String bookingId) {
        Booking b = bookingMapper.selectByIdIgnoreTenant(bookingId);
        if (b == null || b.getStudentId() == null || b.getTeacherId() == null) return;
        Long tenantId = b.getTenantId();
        notifyTeacherAndAdmin(b.getStudentId(), b.getTeacherId(), tenantId,
                render(tenantId, WAITLIST_CREATED_TITLE), render(tenantId, WAITLIST_CREATED_BODY),
                "BOOKING_CREATED");
    }

    /** 学生请假（appointment）→ 通知教师 + 本租户管理员（发送者=学生）。
     *  教育行业话术是「学生请假申请」，法律/心理咨询行业词取「客户改期申请」，
     *  故标题与正文的「学生」「请假」都必须走术语占位符。 */
    public void notifyLeaveCreated(String bookingId) {
        if (bookingId == null) return;
        Booking b = bookingMapper.selectByIdIgnoreTenant(bookingId);
        if (b == null || b.getStudentId() == null || b.getTeacherId() == null) return;
        Long tenantId = b.getTenantId();
        notifyTeacherAndAdmin(b.getStudentId(), b.getTeacherId(), tenantId,
                render(tenantId, LEAVE_CREATED_TITLE), render(tenantId, LEAVE_CREATED_BODY),
                "LEAVE_CREATED");
    }

    /**
     * 管理员确认预订/请假 → 通知学生（发送者=当前登录管理员）。
     *
     * @param actionCode 确认了什么：{@link #ACTION_BOOKING} 或 {@link #ACTION_LEAVE}；
     *                   其余值一律按「确认预订」处理（与旧的默认行为一致）。
     */
    public void notifyStudentConfirmed(String bookingId, String actionCode) {
        Booking b = bookingMapper.selectByIdIgnoreTenant(bookingId);
        if (b == null || b.getStudentId() == null) return;
        AuthInfo ai = currentAuthFromRequest();
        if (ai == null) return;
        String tpl = ACTION_LEAVE.equals(actionCode)
                ? STUDENT_CONFIRMED_LEAVE_BODY : STUDENT_CONFIRMED_BOOKING_BODY;
        send(ai.userId, ai.role, ai.tenantId, Collections.singletonList(b.getStudentId()),
                STUDENT_CONFIRMED_TITLE, render(b.getTenantId(), tpl),
                "MEDIUM", "BOOKING_CONFIRMED");
    }

    /**
     * 管理员把候补递补为正式预订（waiting → booked）→ 通知该学生（发送者=当前登录管理员）。
     *
     * <p>与「预约已确认」用不同标题/正文，因为学生此时在候补队列里等过，
     * 需要的是一条明确的"你被选上了"的消息，而不是通用确认话术。
     * 正文带上首节课时间（递补时课次已生成），让消息本身可行动。
     *
     * <p>正文按**该租户的行业词**渲染（见 WAITLIST_PROMOTED_* 模板）：
     * 法律咨询租户的学生收到的是「正式获得该咨询话题名额…首次预约时间…按时咨询」，
     * 而不是教育行业的「课程/上课时间/上课」。
     */
    public void notifyWaitlistPromoted(String bookingId) {
        Booking b = bookingMapper.selectByIdIgnoreTenant(bookingId);
        if (b == null || b.getStudentId() == null) return;
        AuthInfo ai = currentAuthFromRequest();
        if (ai == null) return;

        // 取词用 booking 所属租户（兜底用当前操作者的租户）：两者正常一致，
        // 但 booking 上的 tenant_id 才是这条消息真正归属的租户，语义更准确。
        Long tenantId = b.getTenantId() != null ? b.getTenantId() : ai.tenantId;

        // 术语词与动态数据合并成一张 Map 一次性渲染：
        // 数据值里即使含 {xxx} 也不会被二次展开，且不会与术语 key 冲突。
        Map<String, String> vars = new LinkedHashMap<>(termService.getTermMap(tenantId, null));
        String firstLesson = firstAppointmentText(bookingId);
        if (firstLesson != null) {
            vars.put("firstLesson", firstLesson);
        }

        StringBuilder content = new StringBuilder();
        content.append(termService.renderTemplate(WAITLIST_PROMOTED_HEAD, vars));
        if (firstLesson != null) {           // 查不到课次时整句省略，避免出现"首次上课时间：。"
            content.append(termService.renderTemplate(WAITLIST_PROMOTED_FIRST, vars));
        }
        content.append(termService.renderTemplate(WAITLIST_PROMOTED_TAIL, vars));

        send(ai.userId, ai.role, ai.tenantId, Collections.singletonList(b.getStudentId()),
                "候补递补成功", content.toString(), "MEDIUM", "BOOKING_CONFIRMED");
    }

    /** 取该 booking 最早一次课的时间文案，用于通知正文；查不到返回 null（不影响消息发送） */
    private String firstAppointmentText(String bookingId) {
        try {
            List<Appointment> list = appointmentService.getByBookingId(bookingId);
            if (list == null || list.isEmpty()) return null;
            for (Appointment a : list) {
                if (a != null && a.getAppointmentDatetime() != null) {
                    return a.getAppointmentDatetime().toString().replace("T", " ");
                }
            }
            return null;
        } catch (Exception e) {
            log.debug("取首节课时间失败（忽略）: bookingId={}, {}", bookingId, e.getMessage());
            return null;
        }
    }

    /** 平台管理员修改租户套餐配额 → 通知该租户管理员（发送者=当前平台管理员） */
    public void notifyTenantPackageChanged(Long tenantId, String actionLabel) {
        if (tenantId == null) return;
        AuthInfo ai = currentAuthFromRequest();
        if (ai == null) return;
        List<User> admins = userService.resolveMessageRecipients("tenant_admin", null, null, tenantId, null);
        List<String> ids = new ArrayList<>();
        if (admins != null) for (User u : admins) if (u.getUserId() != null) ids.add(u.getUserId());
        if (ids.isEmpty()) return;
        send(ai.userId, ai.role, ai.tenantId, ids,
                "套餐配额已更新", "您的租户套餐配额已被平台管理员" + (actionLabel == null ? "更新" : actionLabel) + "。",
                "MEDIUM", "TENANT_PACKAGE_CHANGED");
    }

    // ============ 内部工具 ============

    /**
     * 按目标租户的词表渲染通知文案（{@code {course}} / {@code {lesson}} / {@code {student}}
     * / {@code {leave}} / {@code {schedule}} 等占位符，租户词 &gt; 行业词 &gt; 平台词）。
     *
     * <p>tenantId 为 null/0 时只用平台词——这是刻意的兜底：宁可给出教育行业的通用说法，
     * 也不让消息内容变成空的或裸露的占位符。
     */
    private String render(Long tenantId, String template) {
        return termService.renderTemplate(template, tenantId, null);
    }

    /** 学生 → 教师 + 本租户管理员（合并为一条群发） */
    private void notifyTeacherAndAdmin(String studentId, String teacherId, Long tenantId,
                                       String title, String content, String category) {
        List<String> ids = new ArrayList<>();
        ids.add(teacherId);
        List<User> admins = userService.resolveMessageRecipients("tenant_admin", null, null, tenantId, null);
        if (admins != null) for (User u : admins) if (u.getUserId() != null) ids.add(u.getUserId());
        send(studentId, RoleConst.STUDENT, tenantId, ids, title, content, "MEDIUM", category);
    }

    /** 从当前 HTTP 请求头解析发送者身份（供管理员/平台管理员钩子使用） */
    private AuthInfo currentAuthFromRequest() {
        try {
            ServletRequestAttributes attrs = (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();
            if (attrs == null) return null;
            String auth = attrs.getRequest().getHeader("Authorization");
            return parseToken(auth);
        } catch (Exception e) {
            return null;
        }
    }

    private AuthInfo parseToken(String token) {
        if (token == null) return null;
        String t = token.startsWith("Bearer ") ? token.substring(7) : token;
        try {
            if (!jwtUtil.verifyAccessToken(t)) return null;
            return new AuthInfo(jwtUtil.getUserIdFromToken(t), jwtUtil.getRoleFromToken(t), jwtUtil.getTenantId(t));
        } catch (Exception e) {
            return null;
        }
    }

    /** 生成发送者令牌并调用 message-service /api/v1/messages/send（best-effort） */
    private void send(String senderUserId, String senderRole, Long senderTenantId, List<String> recipientIds,
                      String title, String content, String priority, String categoryCode) {
        if (recipientIds == null || recipientIds.isEmpty() || senderUserId == null) return;
        try {
            String token = jwtUtil.generateToken(senderTenantId, senderUserId, senderRole);
            Map<String, Object> body = new HashMap<>();
            body.put("title", title);
            body.put("content", content == null ? "" : content);
            body.put("priority", priority == null ? "MEDIUM" : priority);
            if (categoryCode != null) body.put("categoryCode", categoryCode);
            body.put("recipientUserIds", recipientIds);
            body.put("broadcast", Boolean.FALSE);
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.setBearerAuth(token);
            HttpEntity<Map<String, Object>> entity = new HttpEntity<>(body, headers);
            ResponseEntity<Map> resp = restTemplate.postForEntity(baseUrl + "/api/v1/messages/send", entity, Map.class);
            // message-service 业务失败时 HTTP 状态仍是 200，真实结果只在 body.code 里。
            // 早期只看「HTTP 没抛异常」就记成功，导致 msg_category 缺编码时静默失败很久无人察觉。
            Map<?, ?> rb = resp.getBody();
            Object code = rb == null ? null : rb.get("code");
            if (code != null && !"200".equals(String.valueOf(code))) {
                log.warn("消息自动发送被拒 -> code={}, message={} | 接收人={}, 场景={}",
                        code, rb.get("message"), recipientIds, categoryCode);
                return;
            }
            log.info("消息自动发送成功 -> 接收人{}, 场景{}", recipientIds, categoryCode);
        } catch (Exception e) {
            log.warn("消息自动发送失败(已忽略): {} | 接收人={}, 场景={}", e.getMessage(), recipientIds, categoryCode);
        }
    }

    private static class AuthInfo {
        String userId;
        String role;
        Long tenantId;

        AuthInfo(String userId, String role, Long tenantId) {
            this.userId = userId;
            this.role = role;
            this.tenantId = tenantId;
        }
    }
}
