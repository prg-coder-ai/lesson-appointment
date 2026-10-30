package com.reservation.service;

import com.reservation.common.AppointmentStatus;
import com.reservation.common.BookingStatus;
import com.reservation.common.CascadeRules;
import com.reservation.common.CascadeRules.Action;
import com.reservation.common.CascadeRules.Rule;
import com.reservation.common.CascadeRules.Scenario;
import com.reservation.mapper.CascadeMapper;
import jakarta.annotation.Resource;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 引用完整性级联的<b>唯一执行器</b>（薄弱环节分析报告根因 C：数据完整性兜底）。
 *
 * <h3>本类解决的真实缺陷</h3>
 * 报告原先写的是"库中没有外键、约束缺失"。<b>实测与该表述不符</b>：
 * 库里有 14 个外键，且 {@code DELETE_RULE} <b>全是 CASCADE</b>。
 * 真正的问题恰恰是这些 CASCADE：
 * <ul>
 *   <li>{@code DELETE FROM course_schedule} → 数据库连带删掉该排期的 booking；</li>
 *   <li>而 appointment 表<b>没有</b>指向 booking 的外键，booking 一被连带删掉，
 *       那些课次行就成了孤儿（实测 149 行课次中 109 行 booking_id 指向不存在的预订）；</li>
 *   <li>notification_dispatch_log 同理（实测 12 行指向不存在的课次）。</li>
 * </ul>
 * 所以<b>悬空引用不是"漏加约束"，是"级联删了父却没人管子"</b>。
 * 而 DB 级联治不了它：DB 只认外键，不认"课次要保留还是要删"这种业务语义。
 *
 * <h3>本类的做法</h3>
 * 把"删某实体时关联表怎么办"从数据库的隐式行为搬进程序里的<b>显式规则表</b>
 * （{@link CascadeRules}），并由本类在<b>调用方同一事务内</b>执行：
 * <ol>
 *   <li><b>软删除</b>（置 frozen / inactive）：对子表<b>置状态、保留行</b>。
 *       用户确认删除后，关联表随之进入对应状态——这正是本类的核心价值，
 *       因为软删除本来就没有"数据库自动帮忙"这回事。</li>
 *   <li><b>物理删除</b>：由程序按依赖顺序<b>先删子再删父</b>（顺序见下），
 *       不依赖 DB 的 CASCADE。</li>
 * </ol>
 *
 * <h3>执行顺序（为什么不能颠倒）</h3>
 * 规则表里同场景的多条规则<b>按声明顺序执行</b>，这是硬要求：
 * <pre>
 *   删排期：  appointment(经 booking) → booking → [调用方删 schedule]
 *   删课程：  [规则里 course→appointment 是 SKIP 占位] → course_schedule（→ 由排期规则展开） → [调用方删 course]
 *   删预订：  appointment → [调用方删 booking]
 *   删课次：  notification_dispatch_log → [调用方删 appointment]
 * </pre>
 * 若把 booking 删在 appointment 之前，就再也无法按 booking_id 找到该删哪些课次
 * ——这正是原先"留下 102 条悬空"的机制。<b>先子后父</b>是这里唯一的正确顺序。
 *
 * <h3>租户边界</h3>
 * 本类的 SQL 一律忽略租户插件（见 {@link CascadeMapper} 类注释：级联漏删不会报错，
 * 只会静默留下悬空）。租户隔离由<b>调用入口的权限校验</b>保证。
 */
@Slf4j
@Service
public class ReferentialCascadeService {

    @Resource
    private CascadeMapper cascadeMapper;

    /**
     * 课次状态列名（appointment.status）
     */
    private static final String STATUS_COL = "status";

    /**
     * 执行一个级联场景。
     *
     * <p>以 {@code REQUIRED} 参与调用方事务：级联失败必须让父记录的删除一并回滚。
     * 若是 {@code REQUIRES_NEW}，父删成功而级联失败就会留下悬空——比不做级联更糟。
     *
     * @param scenarioName {@link CascadeRules} 中登记的场景名
     * @param parentKeys   父记录主键（单元素表示单条，多元素表示批量，如删课程时其全部排期）
     * @return 影响面摘要，供接口返回与审计日志
     */
    @Transactional(propagation = Propagation.REQUIRED, rollbackFor = Exception.class)
    public CascadeReport run(String scenarioName, List<String> parentKeys) {
        Scenario scenario = CascadeRules.scenario(scenarioName);
        CascadeReport report = new CascadeReport(scenarioName, scenario.getDescription());
        if (parentKeys == null || parentKeys.isEmpty()) {
            return report;
        }
        for (String parentKey : parentKeys) {
            if (parentKey == null || parentKey.trim().isEmpty()) {
                continue;
            }
            for (Rule rule : scenario.getRules()) {
                applyRule(rule, parentKey, report);
            }
        }
        if (report.isChanged()) {
            log.info("级联完成：{}，{}", scenarioName, report.toMap());
        } else {
            log.debug("级联无变更：{}，父键 {} 条", scenarioName, parentKeys.size());
        }
        return report;
    }

    /** 单条父记录的便捷入口 */
    public CascadeReport run(String scenarioName, String parentKey) {
        List<String> keys = new ArrayList<>();
        keys.add(parentKey);
        return run(scenarioName, keys);
    }

    /**
     * 只算不做：预估某个场景会影响多少行，用于删除前向用户确认。
     *
     * <p>软删除尤其需要——"删除该排期会同时冻结 7 条预订、21 个课次"这句话
     * 必须在用户点确认之前就告诉他，而不是删完才知道。
     */
    public CascadeReport dryRun(String scenarioName, List<String> parentKeys) {
        Scenario scenario = CascadeRules.scenario(scenarioName);
        CascadeReport report = new CascadeReport(scenarioName, scenario.getDescription());
        if (parentKeys == null || parentKeys.isEmpty()) {
            return report;
        }
        for (String parentKey : parentKeys) {
            if (parentKey == null || parentKey.trim().isEmpty()) {
                continue;
            }
            for (Rule rule : scenario.getRules()) {
                if (rule.getAction() == Action.SKIP || rule.getAction() == Action.KEEP) {
                    report.recordKeep(rule, cascadeMapper.countChild(
                            rule.getChildTable(), rule.getChildKeyColumn(), parentKey));
                    continue;
                }
                int n = cascadeMapper.countChild(rule.getChildTable(), rule.getChildKeyColumn(), parentKey);
                report.record(rule, n);
            }
        }
        return report;
    }

    public CascadeReport dryRun(String scenarioName, String parentKey) {
        List<String> keys = new ArrayList<>();
        keys.add(parentKey);
        return dryRun(scenarioName, keys);
    }

    /** 执行单条规则 */
    private void applyRule(Rule rule, String parentKey, CascadeReport report) {
        switch (rule.getAction()) {
            case SKIP:
                // 技术上做不到级联：占位说明，不产生写操作。显式登记的意义是
                // 让"这里为什么不做级联"成为必须回答的问题，而不是沉默的缺口。
                report.recordSkip(rule);
                break;
            case KEEP:
                // 显式决定不动：记下命中数，让"决定不动"也留下可审计的痕迹。
                report.recordKeep(rule, cascadeMapper.countChild(
                        rule.getChildTable(), rule.getChildKeyColumn(), parentKey));
                break;
            case FREEZE:
            case SOFT_STATUS: {
                int rows = doFreeze(rule, parentKey);
                report.record(rule, rows);
                break;
            }
            case RESTORE_STATUS: {
                int rows = cascadeMapper.restoreChildStatus(
                        rule.getChildTable(), rule.getChildKeyColumn(), STATUS_COL,
                        parentKey, rule.getTargetStatus(), rule.getFromStatuses());
                report.record(rule, rows);
                break;
            }
            case DELETE: {
                int rows = doDelete(rule, parentKey);
                report.record(rule, rows);
                break;
            }
            case CLEAR_REF: {
                int rows = cascadeMapper.clearChildRef(
                        rule.getChildTable(), rule.getChildKeyColumn(), parentKey);
                report.record(rule, rows);
                break;
            }
            default:
                throw new IllegalStateException("未处理的级联动作: " + rule.getAction());
        }
    }

    /**
     * 软删除：把子表状态置为目标值。
     *
     * <p><b>关键：不覆盖已是终态的行</b>。例如排期冻结时把课次置 frozen，
     * 但 {@code completed}/{@code changed} 是"这节课确实上完了"的事实，
     * 改成 frozen 等于抹掉上课历史。因此统一传入
     * {@link AppointmentStatus#CLOSED} 作为跳过集合。
     */
    private int doFreeze(Rule rule, String parentKey) {
        String table = rule.getChildTable();
        // 判定"终态集合"按子表语义选择：课次用 AppointmentStatus，预订用 BookingStatus。
        // 两者都要跳过的交集是 completed/changed/frozen，这里取各自更严格的集合。
        List<String> skip = terminalStatusesOf(table);
        if (skip.isEmpty()) {
            return cascadeMapper.freezeChild(
                    table, rule.getChildKeyColumn(), STATUS_COL, parentKey, rule.getTargetStatus(), null);
        }
        return cascadeMapper.freezeChild(
                table, rule.getChildKeyColumn(), STATUS_COL, parentKey, rule.getTargetStatus(), skip);
    }

    /**
     * 物理删除：先删更深层的子表，再删本层。
     *
     * <p>例如规则 {@code course_schedule → booking} 在删课次之前必须先执行
     * {@code course_schedule → appointment} 那条规则（表内按声明顺序），
     * 否则 booking 先没了就再也定位不到它的课次。
     */
    private int doDelete(Rule rule, String parentKey) {
        return cascadeMapper.deleteChild(rule.getChildTable(), rule.getChildKeyColumn(), parentKey);
    }

    /**
     * 该表在软删除时应跳过的既有状态（已落定的事实，不可被联动改写）。
     */
    private List<String> terminalStatusesOf(String table) {
        if ("appointment".equals(table)) {
            return AppointmentStatus.CLOSED;
        }
        if ("booking".equals(table)) {
            // 课次侧的 CLOSED 已含 frozen/cancelled/completed/changed；
            // 预订侧只需跳过 completed（真实上完的单）——cancelled/frozen 是软删的正常目标。
            return List.of("completed", "changed");
        }
        return List.of();
    }

    /**
     * 诊断：某条父子关系当前有多少悬空行。
     *
     * <p>用于运维巡检与清理脚本执行前的核对。悬空行数应当恒为 0；
     * 一旦非 0，说明有删除路径绕过了本执行器（守卫只能管新增路径，管不住运行中的漏网）。
     */
    public int countOrphans(String parentTable, String parentKeyColumn,
                            String childTable, String childKeyColumn) {
        return cascadeMapper.countOrphans(childTable, childKeyColumn, parentTable, parentKeyColumn);
    }

    /** 级联影响面摘要 */
    public static class CascadeReport {
        private final String scenario;
        private final String description;
        private final Map<String, Integer> affected = new LinkedHashMap<>();
        private final Map<String, Integer> skippedKept = new LinkedHashMap<>();
        private final List<String> notes = new ArrayList<>();

        CascadeReport(String scenario, String description) {
            this.scenario = scenario;
            this.description = description;
        }

        void record(Rule rule, int rows) {
            if (rows > 0) {
                affected.put(rule.id(), rows);
            }
        }

        void recordKeep(Rule rule, int rows) {
            if (rows > 0) {
                skippedKept.put(rule.id(), rows);
            }
        }

        void recordSkip(Rule rule) {
            notes.add("SKIP: " + rule.id() + " —— " + rule.getNote());
        }

        public boolean isChanged() {
            return !affected.isEmpty();
        }

        public String getScenario() { return scenario; }
        public String getDescription() { return description; }
        public Map<String, Integer> getAffected() { return affected; }
        public Map<String, Integer> getSkippedKept() { return skippedKept; }
        public List<String> getNotes() { return notes; }

        /** 供接口返回的扁平摘要 */
        public Map<String, Object> toMap() {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("scenario", scenario);
            m.put("affected", affected);
            if (!skippedKept.isEmpty()) {
                m.put("kept", skippedKept);
            }
            return m;
        }
    }
}
