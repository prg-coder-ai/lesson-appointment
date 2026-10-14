package com.reservation.service;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.reservation.entity.LegalAccept;
import com.reservation.entity.LegalDoc;
import com.reservation.mapper.LegalAcceptMapper;
import com.reservation.mapper.LegalDocMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 协议 / 隐私政策文档服务（sys_legal_doc + sys_legal_accept）
 *
 * <p>作用域解析（复用 sys_term 三级优先级）：
 *   1) 先查「目标租户级」(doc_type, 请求租户 tenant_id, lang, status=1, 最大版本)
 *   2) 命中为空回退「平台级」(doc_type, 0, lang, status=1, 最大版本)
 *   3) 仍为空回退 zh（同样 租户级 → 平台级）
 * 数据角色：场景 A 平台是处理者、场景 B 租户是控制者；平台级文档由平台制定，租户级覆盖由租户制定。
 *
 * <p>注意：两张表均在 MyBatisPlusConfig.IGNORE_TABLES 中，租户插件不参与，
 * 所有查询必须显式按 tenant_id（作用域维度）过滤。
 */
@Service
public class LegalDocService {

    @Autowired
    private LegalDocMapper legalDocMapper;
    @Autowired
    private LegalAcceptMapper legalAcceptMapper;

    /** 文档类型常量 */
    public static final String DOC_USER_AGREEMENT = "user_agreement";
    public static final String DOC_PRIVACY_POLICY = "privacy_policy";

    /** 主体类型常量 */
    public static final int SUBJECT_TENANT = 1;   // 场景 A：平台 ↔ 租户
    public static final int SUBJECT_USER = 2;     // 场景 B：租户 ↔ 用户

    /**
     * 解析当前生效文档：租户级优先，回退平台级；目标语言缺失回退 zh。
     *
     * @param tenantId 请求方租户（0 = 仅平台级）
     * @param docType  user_agreement / privacy_policy
     * @param lang     语言代码，null/空按 zh
     * @return 命中的启用版本文档；两级都无则返回 null
     */
    public LegalDoc resolve(Long tenantId, String docType, String lang) {
        String language = normalizeLang(lang);
        Long scope = (tenantId == null || tenantId <= 0) ? 0L : tenantId;

        LegalDoc doc = latest(scope, docType, language);
        if (doc == null && scope > 0) {
            doc = latest(0L, docType, language);
        }
        if (doc == null) {
            doc = latest(scope, docType, "zh");
        }
        if (doc == null && scope > 0) {
            doc = latest(0L, docType, "zh");
        }
        return doc;
    }

    /** 取某作用域 + 语言下的「最大启用版本」文档（status=1，按 version 降序取首条） */
    private LegalDoc latest(Long scopeTenantId, String docType, String language) {
        QueryWrapper<LegalDoc> qw = new QueryWrapper<>();
        qw.eq("doc_type", docType);
        qw.eq("tenant_id", scopeTenantId);
        qw.eq("language", language);
        qw.eq("status", 1);
        qw.orderByDesc("version");
        List<LegalDoc> list = legalDocMapper.selectList(qw);
        return list.isEmpty() ? null : list.get(0);
    }

    /**
     * 保存新版本（平台级 tenantId=0 或租户覆盖级 tenantId=N）。
     * 规则：同一作用域 + 同一语言下的旧启用版本置为停用（status=0），
     * 新版本 version = 该作用域该语言历史最大版本 + 1，status=1，effective_time=now。
     * 保留全部历史版本供版本对比 / 强制重签。
     */
    public LegalDoc saveVersion(Long tenantId, String docType, String lang,
                               String title, String content) {
        Long scope = (tenantId == null || tenantId <= 0) ? 0L : tenantId;
        String language = normalizeLang(lang);

        // 停用同级同语言旧版本
        QueryWrapper<LegalDoc> deactivate = new QueryWrapper<>();
        deactivate.eq("doc_type", docType);
        deactivate.eq("tenant_id", scope);
        deactivate.eq("language", language);
        deactivate.eq("status", 1);
        LegalDoc old = new LegalDoc();
        old.setStatus(0);
        old.setUpdateTime(LocalDateTime.now());
        legalDocMapper.update(old, deactivate);

        // 计算下一版本号（跨状态取历史最大值，保证单调递增）
        QueryWrapper<LegalDoc> maxQw = new QueryWrapper<>();
        maxQw.eq("doc_type", docType);
        maxQw.eq("tenant_id", scope);
        maxQw.eq("language", language);
        maxQw.select("COALESCE(MAX(version),0) AS version");
        LegalDoc maxRow = legalDocMapper.selectOne(maxQw);
        int nextVersion = (maxRow == null || maxRow.getVersion() == null)
                ? 1 : maxRow.getVersion() + 1;

        LegalDoc doc = new LegalDoc();
        doc.setDocType(docType);
        doc.setTenantId(scope);
        doc.setIndustryId(0L);
        doc.setLanguage(language);
        doc.setTitle(title);
        doc.setContent(content);
        doc.setVersion(nextVersion);
        doc.setStatus(1);
        doc.setEffectiveTime(LocalDateTime.now());
        doc.setCreateTime(LocalDateTime.now());
        doc.setUpdateTime(LocalDateTime.now());
        legalDocMapper.insert(doc);
        return doc;
    }

    /**
     * 记录 / 更新签署留痕（幂等 upsert，按 uk_subject_doc）。
     *
     * @param channel 签署渠道：web / miniprogram
     * @param ip      来源 IP（审计）
     */
    public void accept(int subjectType, Long subjectId, String docType, int version,
                       String channel, String ip) {
        QueryWrapper<LegalAccept> qw = new QueryWrapper<>();
        qw.eq("subject_type", subjectType);
        qw.eq("subject_id", subjectId);
        qw.eq("doc_type", docType);
        LegalAccept existing = legalAcceptMapper.selectOne(qw);
        if (existing == null) {
            LegalAccept a = new LegalAccept();
            a.setSubjectType(subjectType);
            a.setSubjectId(subjectId);
            a.setDocType(docType);
            a.setVersion(version);
            a.setAcceptTime(LocalDateTime.now());
            a.setChannel(channel);
            a.setIp(ip);
            legalAcceptMapper.insert(a);
        } else {
            existing.setVersion(version);
            existing.setAcceptTime(LocalDateTime.now());
            existing.setChannel(channel);
            existing.setIp(ip);
            legalAcceptMapper.updateById(existing);
        }
    }

    /** 查询某主体对某文档的已签署版本；未签署返回 null（用于重签校验） */
    public Integer acceptedVersion(int subjectType, Long subjectId, String docType) {
        QueryWrapper<LegalAccept> qw = new QueryWrapper<>();
        qw.eq("subject_type", subjectType);
        qw.eq("subject_id", subjectId);
        qw.eq("doc_type", docType);
        qw.select("version");
        LegalAccept a = legalAcceptMapper.selectOne(qw);
        return a == null ? null : a.getVersion();
    }

    /** 语言代码归一化：null/空/空白 → zh，统一小写、去空白 */
    private String normalizeLang(String lang) {
        if (lang == null || lang.trim().isEmpty()) return "zh";
        return lang.trim().toLowerCase();
    }
}
