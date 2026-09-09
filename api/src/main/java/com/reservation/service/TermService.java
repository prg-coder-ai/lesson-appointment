package com.reservation.service;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.reservation.entity.Tenant;
import com.reservation.entity.Term;
import com.reservation.mapper.TermMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 行业专业词汇服务（sys_term）
 * 三级作用域：平台词(0,0) / 行业词(行业id,0) / 租户词(租户id,行业id)
 * 显示优先级：租户词 &gt; 行业词 &gt; 平台词，逐级回退
 * 多语言：language 字段（ISO 639-1，默认 zh），同一 key 同一作用域可多语言共存；
 *         取词时「语言内按作用域回退，语言间按 zh 兜底」
 * 注意：sys_term 在 MyBatisPlusConfig.IGNORE_TABLES 中，租户插件不参与，
 *       所有查询必须显式按 industry_id + tenant_id 过滤作用域。
 */
@Service
public class TermService {

    @Autowired
    private TermMapper termMapper;
    @Autowired
    private TenantService tenantService;

    /**
     * 平台/行业级词条列表（tenant_id=0）
     *
     * @param industryId 0=平台词；>0=该行业词
     */
    public List<Term> listByScope(Long industryId) {
        QueryWrapper<Term> qw = new QueryWrapper<>();
        qw.eq("tenant_id", 0L);
        qw.eq("industry_id", industryId == null ? 0L : industryId);
        qw.orderByAsc("sort_order").orderByAsc("id");
        return termMapper.selectList(qw);
    }

    /**
     * 租户自定义词条列表（tenant_id=该租户）
     */
    public List<Term> listByTenant(Long tenantId) {
        QueryWrapper<Term> qw = new QueryWrapper<>();
        qw.eq("tenant_id", tenantId);
        qw.orderByAsc("sort_order").orderByAsc("id");
        return termMapper.selectList(qw);
    }

    /**
     * 当前租户合并词表（key -&gt; term_name），供前端渲染使用。
     * 合并规则：平台词 → 行业词覆盖 → 租户词覆盖，逐级回退。
     * 多语言取词：指定语言内按 租户→行业→平台 回退；
     *             指定语言缺失时回退 zh，再缺失取该 key 任意语言。
     * 平台管理员（tenantId=0/null）仅返回平台词表。
     *
     * @param lang 语言代码（ISO 639-1），null/空按 zh 处理
     */
    public Map<String, String> getTermMap(Long tenantId, String lang) {
        String language = normalizeLang(lang);
        // 三级词表：key -> (lang -> name)，逐级合并
        Map<String, Map<String, String>> platform = new LinkedHashMap<>();
        Map<String, Map<String, String>> industry = new LinkedHashMap<>();
        Map<String, Map<String, String>> tenantScope = new LinkedHashMap<>();

        loadScope(0L, 0L, platform);
        Long industryId = 0L;
        if (tenantId != null && tenantId > 0) {
            Tenant tenant = tenantService.getById(tenantId);
            if (tenant != null && tenant.getIndustryId() != null && tenant.getIndustryId() > 0) {
                industryId = tenant.getIndustryId();
                loadScope(industryId, 0L, industry);
            }
        }
        if (tenantId != null && tenantId > 0) {
            loadScope(industryId, tenantId, tenantScope);
        }

        // 按 key 输出：语言内租户词优先，逐级回退
        Map<String, String> out = new LinkedHashMap<>();
        java.util.Set<String> keys = new java.util.LinkedHashSet<>();
        keys.addAll(platform.keySet());
        keys.addAll(industry.keySet());
        keys.addAll(tenantScope.keySet());
        for (String key : keys) {
            String name = pick(tenantScope.get(key), language);
            if (name == null) name = pick(industry.get(key), language);
            if (name == null) name = pick(platform.get(key), language);
            if (name != null) out.put(key, name);
        }
        return out;
    }

    /** 保留旧签名：默认中文（向后兼容） */
    public Map<String, String> getTermMap(Long tenantId) {
        return getTermMap(tenantId, "zh");
    }

    /**
     * 行业词批量复制（fromIndustryId → toIndustryId）。
     * 目标行业已存在的同 key + 同 language 词条跳过（不覆盖），返回统计。
     */
    public Map<String, Object> copyIndustry(Long fromIndustryId, Long toIndustryId) {
        Map<String, Object> stat = new HashMap<>();
        List<Term> fromList = listByScope(fromIndustryId);
        if (fromList.isEmpty()) {
            stat.put("copied", 0);
            stat.put("skipped", 0);
            stat.put("message", "源行业无词条可复制");
            return stat;
        }
        // 目标行业已有 (key|lang) 集合
        List<Term> toList = listByScope(toIndustryId);
        java.util.Set<String> exists = new java.util.HashSet<>();
        for (Term t : toList) exists.add(t.getTermKey() + "|" + normalizeLang(t.getLanguage()));

        int copied = 0;
        int skipped = 0;
        for (Term t : fromList) {
            if (exists.contains(t.getTermKey() + "|" + normalizeLang(t.getLanguage()))) {
                skipped++;
                continue;
            }
            Term n = new Term();
            n.setTermKey(t.getTermKey());
            n.setTermName(t.getTermName());
            n.setLanguage(normalizeLang(t.getLanguage()));
            n.setTermType(t.getTermType());
            n.setIndustryId(toIndustryId);
            n.setTenantId(0L);
            n.setSortOrder(t.getSortOrder());
            n.setStatus(1);
            n.setRemark("由行业 " + fromIndustryId + " 复制");
            termMapper.insert(n);
            copied++;
        }
        stat.put("copied", copied);
        stat.put("skipped", skipped);
        return stat;
    }

    /**
     * 校验词条在当前作用域 + 语言下是否已存在（唯一键 uk_scope_key 的应用层校验）
     */
    public boolean existsInScope(String termKey, Long industryId, Long tenantId, String language, Long excludeId) {
        QueryWrapper<Term> qw = new QueryWrapper<>();
        qw.eq("term_key", termKey);
        qw.eq("industry_id", industryId);
        qw.eq("tenant_id", tenantId);
        qw.eq("language", normalizeLang(language));
        if (excludeId != null) qw.ne("id", excludeId);
        return termMapper.selectCount(qw) > 0;
    }

    /** 保留旧签名：按 zh 校验（向后兼容） */
    public boolean existsInScope(String termKey, Long industryId, Long tenantId, Long excludeId) {
        return existsInScope(termKey, industryId, tenantId, "zh", excludeId);
    }

    /**
     * 获取某个作用域下的词条并按语言聚合（内部用）
     * 输出：key -> (lang -> name)
     */
    private void loadScope(Long industryId, Long tenantId, Map<String, Map<String, String>> out) {
        QueryWrapper<Term> qw = new QueryWrapper<>();
        qw.eq("industry_id", industryId);
        qw.eq("tenant_id", tenantId);
        qw.eq("status", 1);
        List<Term> list = termMapper.selectList(qw);
        for (Term t : list) {
            out.computeIfAbsent(t.getTermKey(), k -> new LinkedHashMap<>())
               .put(normalizeLang(t.getLanguage()), t.getTermName());
        }
    }

    /** 从某个语言映射中取词：指定语言 → zh → 任意一条 */
    private String pick(Map<String, String> langMap, String lang) {
        if (langMap == null || langMap.isEmpty()) return null;
        String v = langMap.get(lang);
        if (v != null) return v;
        v = langMap.get("zh");
        if (v != null) return v;
        return langMap.entrySet().iterator().next().getValue();
    }

    /** 语言代码归一化：null/空/空白 → zh，统一小写、去空白 */
    private String normalizeLang(String lang) {
        if (lang == null || lang.trim().isEmpty()) return "zh";
        return lang.trim().toLowerCase();
    }
}
