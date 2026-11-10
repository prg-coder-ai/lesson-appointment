package com.reservation.service;

import com.reservation.exception.BusinessException;
import com.reservation.utils.TermMsg;
import com.reservation.entity.WorkLanguage;
import com.reservation.mapper.WorkLanguageMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.regex.Pattern;

/**
 * 授课语言枚举服务（平台内置六项 ＋ 租户可自定义）。
 *
 * <p><b>作用域规则</b>：tenant_id=0 为平台内置，所有租户可见、只读；
 * tenant_id>0 为该租户自建，只有本租户可见且可增删。
 *
 * <p><b>为什么每个方法都显式要 tenantId 参数而不是读 TenantContext</b>：
 * 本表已登记 IGNORE_TABLES，租户插件不会兜底；读上下文会让"平台管理员代查某租户"
 * 这类场景无法表达。调用方一律从**令牌**派生 tenantId 传进来，绝不接受前端传值。
 */
@Service
public class WorkLanguageService {

    /** code 只允许小写字母开头，后可跟小写字母/数字/下划线/连字符（会落进 varchar(20)） */
    private static final Pattern CODE_PATTERN = Pattern.compile("^[a-z][a-z0-9_-]{1,19}$");

    @Autowired
    private WorkLanguageMapper workLanguageMapper;

    /**
     * 某租户可见的授课语言清单（内置 + 自定义）。
     *
     * @param tenantId 令牌派生的租户 ID；0 或 null = 平台管理员，只返回内置项
     */
    public List<WorkLanguage> listVisible(Long tenantId) {
        return workLanguageMapper.selectVisibleForTenant(tenantId == null ? 0L : tenantId);
    }

    /**
     * 落库前校验：该 code 是否在当前租户的可见清单内。
     *
     * <p>空值视为"未指定/跟随课程"，直接放行 —— 老数据与新数据都允许留空。
     * 非空但查不到时拒绝，堵住"随便写个字符串进 work_language"的脏数据入口，
     * 这正是 language_type 当年被行业词污染的成因。
     *
     * @param fieldLabel 报错时给人看的字段名（"授课语言"）
     */
    public void assertVisibleCode(Long tenantId, String code, String fieldLabel) {
        if (code == null || code.trim().isEmpty()) return;
        String normalized = code.trim().toLowerCase();
        if (workLanguageMapper.selectVisibleByCode(tenantId == null ? 0L : tenantId, normalized) == null) {
            throw new BusinessException(TermMsg.t("无效的" + fieldLabel + "：" + code));
        }
    }

    /**
     * 租户新增/更新一条自定义授课语言。
     *
     * <p>code 与平台内置项重复时直接拒绝（内置项已经覆盖了这种语言，再建一条只会让
     * 下拉出现两个同义项）；与本租户已有项重复时走更新语义，避免撞 uk_tenant_code。
     *
     * @param tenantId 令牌派生的租户 ID，必须 >0（平台内置项不通过本接口维护）
     */
    @Transactional(propagation = Propagation.REQUIRED, rollbackFor = Exception.class)
    public WorkLanguage saveCustom(Long tenantId, WorkLanguage req) {
        if (tenantId == null || tenantId <= 0) {
            throw new BusinessException(TermMsg.t("平台内置的授课语言不在此处维护"));
        }
        if (req == null || req.getLangCode() == null || req.getLangCode().trim().isEmpty()) {
            throw new BusinessException(TermMsg.t("请填写授课语言代码"));
        }
        String code = req.getLangCode().trim().toLowerCase();
        if (!CODE_PATTERN.matcher(code).matches()) {
            throw new BusinessException(TermMsg.t("授课语言代码只能用小写字母开头，可含数字、下划线、连字符，最长20位"));
        }
        String nameZh = req.getNameZh() == null ? "" : req.getNameZh().trim();
        if (nameZh.isEmpty()) {
            throw new BusinessException(TermMsg.t("请填写授课语言的中文名称"));
        }
        if (nameZh.length() > 64) {
            throw new BusinessException(TermMsg.t("授课语言名称最长64个字"));
        }
        if (workLanguageMapper.countBuiltinByCode(code) > 0) {
            throw new BusinessException(TermMsg.t("「" + nameZh + "」已是平台内置授课语言，无需自定义"));
        }

        WorkLanguage exist = workLanguageMapper.selectCustomByCode(tenantId, code);
        WorkLanguage row = exist != null ? exist : new WorkLanguage();
        row.setTenantId(tenantId);
        row.setLangCode(code);
        row.setNameZh(nameZh);
        row.setNameEn(nullToEmpty(req.getNameEn()));
        row.setNameFr(nullToEmpty(req.getNameFr()));
        // 未指定排序时排在内置项之后，避免插入到最前面打乱既有习惯
        row.setSortOrder(req.getSortOrder() == null
                ? (exist != null && exist.getSortOrder() != null ? exist.getSortOrder() : 900)
                : req.getSortOrder());

        if (exist != null) {
            workLanguageMapper.updateById(row);
        } else {
            workLanguageMapper.insert(row);
        }
        return row;
    }

    /**
     * 租户删除自己的自定义授课语言。
     *
     * <p>两道拦截：内置项一律不可删；被模板/课程/排期引用中的项也不可删 ——
     * 删掉后那些记录里的 code 会变成"查不到的孤儿值"，界面只能原样打印
     * {@code italian} 这样的代码，用户看不出发生了什么。
     * 先改掉这些记录再删，路径清晰得多。
     *
     * @param tenantId 令牌派生的租户 ID
     * @param id       要删除的记录 ID
     */
    @Transactional(propagation = Propagation.REQUIRED, rollbackFor = Exception.class)
    public void deleteCustom(Long tenantId, Long id) {
        if (tenantId == null || tenantId <= 0) {
            throw new BusinessException(TermMsg.t("平台内置的授课语言不可删除"));
        }
        if (id == null) {
            throw new BusinessException(TermMsg.t("缺少要删除的授课语言记录"));
        }
        WorkLanguage row = workLanguageMapper.selectById(id);
        if (row == null) {
            throw new BusinessException(TermMsg.t("授课语言记录不存在"));
        }
        if (row.getTenantId() == null || row.getTenantId() == 0L) {
            throw new BusinessException(TermMsg.t("平台内置授课语言不可删除"));
        }
        if (!tenantId.equals(row.getTenantId())) {
            // 显式比对而不是只靠 SQL 条件：这张表不走租户插件，漏一个条件就是越权删除
            throw new BusinessException(TermMsg.t("不能删除其它租户的授课语言"));
        }
        int refs = workLanguageMapper.countReferences(row.getLangCode());
        if (refs > 0) {
            throw new BusinessException(TermMsg.t("该授课语言已被 " + refs + " 条记录使用，请先改掉它们再删除"));
        }
        // cascade: none —— work_language 是字符串 code，三张业务表没有外键指向本表，
        // 引用关系已在上面的 countReferences 中显式检查，因此不存在需要级联处置的子表。
        workLanguageMapper.deleteById(id);
    }

    private static String nullToEmpty(String s) {
        return s == null ? "" : s.trim();
    }
}
