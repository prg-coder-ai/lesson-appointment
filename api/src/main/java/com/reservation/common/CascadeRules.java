package com.reservation.common;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 父子表级联规则表 —— <b>删除/软删除时"关联表该怎么办"的唯一权威口径</b>
 * （薄弱环节分析报告根因 C：数据完整性兜底）。
 *
 * <h3>为什么不用数据库级联</h3>
 * 本项目的定性是<b>不用数据库的级联，而在程序中完成级联</b>。这不是偏好问题，是实测结论：
 * <ul>
 *   <li>库里 14 个外键的 {@code DELETE_RULE} <b>全是 CASCADE</b>。也就是说
 *       {@code DELETE FROM course_schedule} 会由数据库连带删掉该排期的 booking，
 *       而 appointment 没有指向 booking 的外键——booking 一被连带删掉，
 *       课次行就成了悬空引用（实测 149 行课次里 109 行 booking_id 指向不存在的预订）。
 *       <b>悬空不是"漏了约束"，正是"级联删了父却没人管子"造成的。</b></li>
 *   <li>数据库级联是<b>隐式</b>的：读 {@code DELETE FROM course_schedule} 这行 SQL 的人，
 *       不会知道它顺手删掉了整排预订，更不会想到那些预订的课次会变成孤儿。
 *       这与根因 A/B 同源——规则只存在于某个地方，换个客户端/换个维护者就失效。</li>
 *   <li>级联删除<b>不可观测、不可审计</b>：应用层拿不到"连带删了几条"这个数字，
 *       也就无法在删除前告诉用户"这会连带影响 7 条预订和 21 个课次"。</li>
 * </ul>
 *
 * <h3>替代方案：显式规则表 + 程序内执行</h3>
 * 本类只<b>声明</b>规则，真正执行见
 * {@code com.reservation.service.ReferentialCascadeService}。这样做换来四件事：
 * <ol>
 *   <li>级联<b>可读</b>：一张表看清全部父子关系，不用在十几个 Mapper 之间推断。</li>
 *   <li>级联<b>可预估</b>：删除前可先跑 {@code dryRun} 拿到影响面给用户确认。</li>
 *   <li>软删除与物理删除<b>分开表达</b>：软删除置子表状态（可恢复），
 *       物理删除才真删——DB 级联只有一种语义，无法区分。</li>
 *   <li>可被<b>守卫脚本</b>校验（见 {@code tools/check-cascade-rules.mjs}）：
 *       新增表或改删除路径时能自动判红。</li>
 * </ol>
 *
 * <h3>处置方式（{@link Action}）</h3>
 * <ul>
 *   <li>{@link Action#FREEZE} —— 软删除：把子表状态列置为给定值（如 {@code frozen}），
 *       <b>保留行</b>。可恢复，且不丢历史。</li>
 *   <li>{@link Action#SOFT_STATUS} —— 软删除：把子表状态列置为<b>指定</b>状态
 *       （如课程下架时把排期置 {@code inactive} 而非 {@code frozen}）。</li>
 *   <li>{@link Action#DELETE} —— 物理删除：真删子表行。仅用于"父删了子留着就是垃圾"的场景。</li>
     *   <li>{@link Action#CLEAR_REF} —— 置空外键列（{@code NULL}）而非删行，
     *       用于"子行本身仍有效，只是失去父引用"。</li>
     *   <li>{@link Action#KEEP} —— <b>显式决定不动</b>。与 {@link #SKIP} 的区别是：
     *       KEEP 是"想清楚了不动"（必须写清理由，守卫会校验非空），
     *       例如"课程下架不应静默取消已付款的预订"；SKIP 是"做不到"（缺关联列）。</li>
     *   <li>{@link Action#SKIP} —— 技术上无法级联（缺列/缺关联路径），
     *       仅作说明性占位，不产生任何写操作。占位存在的意义是
     *       <b>让"为什么这里不做级联"变成必须回答的问题，而不是沉默的缺口</b>。</li>
     * </ul>
 *
 * <p><b>为什么要区分 FREEZE 与 DELETE</b>：booking 被删时它的课次是
 * {@code DELETE}（课次脱离 booking 就没有意义，且 booking_id 是它的唯一来源），
 * 但排期被冻结时它下面的 booking 是 {@code FREEZE} 而非 DELETE
 * （"这个排期暂停了"不等于"这些预订从未存在"，恢复排期后它们还要能用）。
 */
public final class CascadeRules {

    private CascadeRules() {
    }

    /** 级联处置方式 */
    public enum Action {
        /** 软删除：子表状态列置为规则指定值，保留行 */
        FREEZE,
        /** 软删除：子表状态列置为规则指定状态值，保留行 */
        SOFT_STATUS,
        /** 物理删除：真删子表行 */
        DELETE,
        /** 置空外键列，不删行 */
        CLEAR_REF,
        /**
         * 恢复：把「原状态在指定集合内」的行置为目标状态（{@code fromStatuses} 必填）。
         *
         * <p>与 FREEZE 的方向相反，但同样需要"只改特定原状态的行"这个能力——
         * 恢复租户时只能解冻 {@code frozen} 的账号，
         * {@code inactive}（待审核）/ {@code pending}（待审批）是审批结论，
         * 不该被"恢复租户"这个动作顺手抹掉。
         */
        RESTORE_STATUS,
        /** 显式决定不动子表（须写明理由，守卫校验非空） */
        KEEP,
        /** 技术上无法级联（缺关联列/路径），仅作说明性占位，不产生写操作 */
        SKIP
    }

    /** 一条级联规则：父表某列 → 子表某列，命中即按 action 处置 */
    public static class Rule {
        private final String parentTable;
        private final String parentKeyColumn;
        private final String childTable;
        private final String childKeyColumn;
        private final Action action;
        private final String targetStatus;
        /** 仅 {@link Action#RESTORE_STATUS} 使用：只改原状态在此集合内的行 */
        private final List<String> fromStatuses;
        private final String note;

        Rule(String parentTable, String parentKeyColumn, String childTable, String childKeyColumn,
             Action action, String targetStatus, String note) {
            this(parentTable, parentKeyColumn, childTable, childKeyColumn, action, targetStatus, null, note);
        }

        Rule(String parentTable, String parentKeyColumn, String childTable, String childKeyColumn,
             Action action, String targetStatus, List<String> fromStatuses, String note) {
            this.parentTable = parentTable;
            this.parentKeyColumn = parentKeyColumn;
            this.childTable = childTable;
            this.childKeyColumn = childKeyColumn;
            this.action = action;
            this.targetStatus = targetStatus;
            this.fromStatuses = fromStatuses == null ? null : Collections.unmodifiableList(fromStatuses);
            this.note = note;
        }

        public String getParentTable() { return parentTable; }
        public String getParentKeyColumn() { return parentKeyColumn; }
        public String getChildTable() { return childTable; }
        public String getChildKeyColumn() { return childKeyColumn; }
        public Action getAction() { return action; }
        public String getTargetStatus() { return targetStatus; }
        public List<String> getFromStatuses() { return fromStatuses; }
        public String getNote() { return note; }

        /** 规则的可读标识，用于日志与守卫报错 */
        public String id() {
            return parentTable + "." + parentKeyColumn + " -> " + childTable + "." + childKeyColumn;
        }

        @Override
        public String toString() {
            return id() + " [" + action + (targetStatus == null ? "" : " -> " + targetStatus) + "]";
        }
    }

    /**
     * 一个"删除场景"下的全部级联规则。
     *
     * <p>区分场景而不是一张全局表，是因为<b>同一条父子关系在不同删除动作下处置不同</b>：
     * 排期被「冻结」时其预订要置 frozen（保留），排期被「物理删除」时其预订要真删。
     */
    public static class Scenario {
        private final String scenario;
        private final String description;
        private final List<Rule> rules;

        Scenario(String scenario, String description, List<Rule> rules) {
            this.scenario = scenario;
            this.description = description;
            this.rules = Collections.unmodifiableList(rules);
        }

        public String getScenario() { return scenario; }
        public String getDescription() { return description; }
        public List<Rule> getRules() { return rules; }
    }

    // ==================== 场景常量 ====================

    /** 删除排期（物理）：课次 → 预订 → 排期，逐层由程序显式删 */
    public static final String SCENARIO_SCHEDULE_DELETE = "SCHEDULE_DELETE";
    /** 排期冻结（软删）：其下预订置 frozen；课次由调用方按 booking_id 逐条走 BOOKING_FREEZE */
    public static final String SCENARIO_SCHEDULE_FREEZE = "SCHEDULE_FREEZE";
    /** 预订冻结（软删）：该预订下的课次一并置 frozen */
    public static final String SCENARIO_BOOKING_FREEZE = "BOOKING_FREEZE";
    /** 删除课程（物理）：其下排期连带删除 → 预订 → 课次 */
    public static final String SCENARIO_COURSE_DELETE = "COURSE_DELETE";
    /** 课程冻结（软删）：课程置 frozen，其下排期置 inactive（不是删除） */
    public static final String SCENARIO_COURSE_FREEZE = "COURSE_FREEZE";
    /** 删除模板（物理）：其下课程连带删除 */
    public static final String SCENARIO_TEMPLATE_DELETE = "TEMPLATE_DELETE";
    /** 删除预订（物理）：其下课次一并删除 */
    public static final String SCENARIO_BOOKING_DELETE = "BOOKING_DELETE";
    /** 软删除租户：租户置 deleted=1，其下账号置 frozen（不可登录） */
    public static final String SCENARIO_TENANT_SOFT_DELETE = "TENANT_SOFT_DELETE";
    /** 恢复租户：把软删时被冻结的账号解冻（只解 frozen，不动 inactive/pending） */
    public static final String SCENARIO_TENANT_RESTORE = "TENANT_RESTORE";
    /** 删除课次（物理）：其下通知发送流水一并清理（唯一键会挡住重新插入） */
    public static final String SCENARIO_APPOINTMENT_DELETE = "APPOINTMENT_DELETE";
    /** 删除行业（物理）：其词条置 status=0 停用（sys_term 无外键，删父留子即孤儿词） */
    public static final String SCENARIO_INDUSTRY_DELETE = "INDUSTRY_DELETE";
    /** 删除租户套餐（物理）：其明细表无引用，随行删除 */
    public static final String SCENARIO_TENANT_PACKAGE_DELETE = "TENANT_PACKAGE_DELETE";

    /**
     * 删排期：先删其下预订，再删排期；<b>课次由调用方先按 booking_id 清</b>。
     *
     * <p><b>为什么课次不在本场景的规则里</b>：appointment 表<b>没有 schedule_id 列</b>，
     * 只能经 {@code appointment.booking_id → booking.booking_id} 两跳抵达。
     * 规则表的一条规则只认一个父键，跨这两跳需要调用方先把 booking_id 集合查出来
     * 再调 {@link #SCENARIO_BOOKING_DELETE}——这正是 {@code CourseScheduleService}
     * 里做的。写成一条"看起来能删课次"的规则反而会掩盖这个跳数，
     * 让下一个人以为排期删除自带课次清理。
     */
    private static final List<Rule> SCHEDULE_DELETE_RULES = List.of(
            new Rule("course_schedule", "schedule_id", "appointment", "schedule_id",
                    Action.SKIP, null,
                    "占位：appointment 无 schedule_id 列，无法按排期直连；"
                            + "须先取该排期下 booking_id 集合，再逐条走 SCENARIO_BOOKING_DELETE"),
            new Rule("course_schedule", "schedule_id", "booking", "schedule_id",
                    Action.DELETE, null,
                    "排期被真删，其预订失去父排期，必须随之删除——"
                            + "原先这步由数据库 ON DELETE CASCADE 隐式完成（不可观测、也不管课次）")
    );

    /**
     * 排期冻结（软删）：排期下的预订置 frozen；课次由调用方取 booking_id 集合后
     * 逐条走 {@link #SCENARIO_BOOKING_FREEZE}（appointment 无 schedule_id 列，同上）。
     */
    private static final List<Rule> SCHEDULE_FREEZE_RULES = List.of(
            new Rule("course_schedule", "schedule_id", "booking", "schedule_id",
                    Action.FREEZE, BookingStatus.FROZEN,
                    "排期暂停不等于预订从未存在：置 frozen 保留行，排期恢复后预订仍可用")
    );

    /** 预订冻结（软删）：该预订下的课次一并置 frozen，保留行 */
    private static final List<Rule> BOOKING_FREEZE_RULES = List.of(
            new Rule("booking", "booking_id", "appointment", "booking_id",
                    Action.FREEZE, AppointmentStatus.FROZEN,
                    "排期/预订被冻结 → 课次一并冻结，避免继续对已冻结的安排发上课通知；"
                            + "completed/changed 是真实上过的课，不覆写")
    );

    /**
     * 删课程：只删「排期」这一层；预订与课次由调用方先按 schedule_id 取 booking_id 集合，
     * 逐条走 {@link #SCENARIO_BOOKING_DELETE}，再回到本场景删排期，最后调用方删课程。
     * 与 {@link #SCENARIO_TEMPLATE_DELETE} 同理，链上每层父键类型不同，不在规则表里跨层展开。
     */
    private static final List<Rule> COURSE_DELETE_RULES = List.of(
            new Rule("course", "course_id", "appointment", "course_id",
                    Action.SKIP, null,
                    "占位：appointment 无 course_id 列，无法按课程直连"),
            new Rule("course", "course_id", "course_schedule", "course_id",
                    Action.DELETE, null,
                    "删课程必须先删其排期——这是排期→预订→课次整条链的入口")
    );

    private static final List<Rule> COURSE_FREEZE_RULES = List.of(
            new Rule("course", "course_id", "course_schedule", "course_id",
                    Action.SOFT_STATUS, "inactive",
                    "课程下架：排期置 inactive（不再对外可约）而非 frozen——"
                            + "课程恢复上架后排期应原样可用，置 frozen 会让教师多一次手工恢复"),
            new Rule("course_schedule", "course_id", "booking", "schedule_id",
                    Action.KEEP, null,
                    "课程下架<b>不动</b>已有预订：已付费的预约不能因课程下架被静默取消，"
                            + "退订须由管理员逐单显式处理"),
            new Rule("booking", "schedule_id", "appointment", "booking_id",
                    Action.KEEP, null,
                    "同上，课次保持原状")
    );

    /**
     * 删模板：只删「课程」这一层，课程以下（排期→预订→课次）由调用方<b>逐门课程</b>
     * 调 {@link #SCENARIO_COURSE_DELETE} 展开。
     *
     * <p><b>为什么规则表不把整条链写成一条规则</b>：链上每一层的父键类型不同
     * （template_id → course_id → schedule_id → booking_id），
     * 而一条规则只认一个父键。要在规则表里跨层展开，就得让规则支持
     * 「父键取自上一层查询结果」——那实际是在规则表里重写一遍查询引擎，
     * 复杂到不值得，且规则表会变成没人敢改的黑盒。
     * <b>调用方逐层展开反而更可控</b>：每一步该做什么在 Service 里一目了然，
     * 规则表只负责"这一步内部子表怎么处置"。
     */
    private static final List<Rule> TEMPLATE_DELETE_RULES = List.of(
            new Rule("course_template", "template_id", "course", "template_id",
                    Action.DELETE, null,
                    "删模板连带删其课程；课程以下的排期/预订/课次，"
                            + "由调用方逐门课程调 SCENARIO_COURSE_DELETE 展开")
    );

    private static final List<Rule> BOOKING_DELETE_RULES = List.of(
            new Rule("booking", "booking_id", "appointment", "booking_id",
                    Action.DELETE, null,
                    "课次的唯一父引用就是 booking_id：不删课次就必然留下悬空行")
    );

    private static final List<Rule> TENANT_SOFT_DELETE_RULES = List.of(
            new Rule("sys_tenant", "id", "user", "tenant_id",
                    Action.FREEZE, "frozen",
                    "软删租户必须冻结其账号：否则被删租户的用户仍能登录并写入新数据，"
                            + "租户数据也就没有真正停止增长"),
            new Rule("sys_tenant", "id", "sys_user_session", "tenant_id",
                    Action.SOFT_STATUS, "2",
                    "同时下线在线会话（status=2 已登出），让冻结立即生效")
    );

    private static final List<Rule> TENANT_RESTORE_RULES = List.of(
            new Rule("sys_tenant", "id", "user", "tenant_id",
                    Action.RESTORE_STATUS, "active",
                    List.of(BookingStatus.FROZEN),
                    "恢复租户时解冻其账号：只从 frozen 复原，"
                            + "inactive/pending 属审批结论，不在这次恢复的范围内")
    );

    private static final List<Rule> INDUSTRY_DELETE_RULES = List.of(
            new Rule("sys_industry", "id", "sys_term", "industry_id",
                    Action.FREEZE, "0",
                    "sys_term.industry_id 无外键指向本表：删行业而不处置词条，"
                            + "就会留下一批指向不存在行业的孤儿词条，且这些正是三级词表里"
                            + "「行业词」那一层的全部内容。置 status=0 停用而非删除——"
                            + "误删一个行业不该连带抹掉它的全部术语，停用可回退"),
            new Rule("sys_industry", "id", "sys_tenant", "industry_id",
                    Action.KEEP, null,
                    "sys_tenant.industry_id 同样无外键，会指向不存在的行业。"
                            + "此处<b>刻意不动</b>：租户归属行业是业务决策，"
                            + "不能因为删了一个行业就把租户的行业字段清空（清空后该租户会退回"
                            + "默认行业，等于静默改了它的业务归属）。正确做法是平台在删行业前"
                            + "先迁移这些租户——这属于需要人工确认的操作，不是级联能替代的")
    );

    private static final List<Rule> APPOINTMENT_DELETE_RULES = List.of(
            new Rule("appointment", "id", "notification_dispatch_log", "appointment_id",
                    Action.DELETE, null,
                    "必须先清发送流水：uk_dispatch_once 幂等键含 appointment_id，"
                            + "留着流水会让该课次此后的通知永远发不出去（撞唯一键）")
    );

    private static final Map<String, Scenario> SCENARIOS = build();

    private static Map<String, Scenario> build() {
        List<Scenario> list = new ArrayList<>();
        list.add(new Scenario(SCENARIO_SCHEDULE_DELETE,
                "删除排期（物理）：先删课次与预订，再删排期本身",
                SCHEDULE_DELETE_RULES));
        list.add(new Scenario(SCENARIO_SCHEDULE_FREEZE,
                "排期冻结（软删）：其下预订置 frozen（保留行）",
                SCHEDULE_FREEZE_RULES));
        list.add(new Scenario(SCENARIO_BOOKING_FREEZE,
                "预订冻结（软删）：该预订下的课次置 frozen（保留行）",
                BOOKING_FREEZE_RULES));
        list.add(new Scenario(SCENARIO_COURSE_DELETE,
                "删除课程（物理）：先删其排期（再展开预订与课次），最后删课程",
                COURSE_DELETE_RULES));
        list.add(new Scenario(SCENARIO_COURSE_FREEZE,
                "课程冻结（软删）：排期置 inactive；已有预订与课次保持不动",
                COURSE_FREEZE_RULES));
        list.add(new Scenario(SCENARIO_TEMPLATE_DELETE,
                "删除模板（物理）：先删其课程（再展开整条链）",
                TEMPLATE_DELETE_RULES));
        list.add(new Scenario(SCENARIO_BOOKING_DELETE,
                "删除预订（物理）：先删其课次，再删预订",
                BOOKING_DELETE_RULES));
        list.add(new Scenario(SCENARIO_TENANT_SOFT_DELETE,
                "软删除租户：账号置 frozen、在线会话置已登出",
                TENANT_SOFT_DELETE_RULES));
        list.add(new Scenario(SCENARIO_TENANT_RESTORE,
                "恢复租户：把软删时被冻结的账号解冻回 active",
                TENANT_RESTORE_RULES));
        list.add(new Scenario(SCENARIO_APPOINTMENT_DELETE,
                "删除课次（物理）：先清通知发送流水，否则幂等键会挡住后续通知",
                APPOINTMENT_DELETE_RULES));
        list.add(new Scenario(SCENARIO_INDUSTRY_DELETE,
                "删除行业（物理）：其词条先置 status=0 停用，避免留下孤儿词条",
                INDUSTRY_DELETE_RULES));

        Map<String, Scenario> map = new LinkedHashMap<>();
        for (Scenario s : list) {
            map.put(s.getScenario(), s);
        }
        return Collections.unmodifiableMap(map);
    }

    public static Scenario scenario(String name) {
        Scenario s = SCENARIOS.get(name);
        if (s == null) {
            throw new IllegalArgumentException("未登记的级联场景: " + name
                    + "（新增删除路径时必须先在 CascadeRules 登记，否则守卫会判红）");
        }
        return s;
    }

    public static Map<String, Scenario> all() {
        return SCENARIOS;
    }
}
