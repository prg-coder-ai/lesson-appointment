package com.messagecenter.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.messagecenter.common.PageResult;
import com.messagecenter.dto.SendMessageReq;
import com.messagecenter.dto.SensitiveGroupReq;
import com.messagecenter.dto.SensitiveWordReq;
import com.messagecenter.entity.MsgSensitiveGroup;
import com.messagecenter.entity.MsgSensitiveWord;
import com.messagecenter.exception.MessageBizException;
import com.messagecenter.mapper.MsgSensitiveGroupMapper;
import com.messagecenter.mapper.MsgSensitiveWordMapper;
import com.messagecenter.security.MessageAuthContext;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import jakarta.annotation.PostConstruct;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 敏感词服务（方案 A：本地 DFA，零外网、数据不出内网）。
 *
 *  - 词库分「全平台(tenant=0)」与「租户(tenant>0)」两类；校验某租户消息时取「平台词 ∪ 该租户词」合并 DFA，
 *    任一词命中即命中（二者之一命中即命中）。
 *  - 词汇库分组：每组有默认处理 default_action（REJECT=拒绝发送 / MASK=掩码放行，默认 REJECT）；
 *    词可单独覆盖 action（NULL=继承组默认）。
 *  - 内存缓存：启动加载 + 写操作后即时刷新；validateAndFilter 在发送校验中调用，REJECT 抛异常拦截、
 *    MASK 就地掩码（在 AES 加密落库前对明文处理）。
 */
@Slf4j
@Service
public class SensitiveWordService {

    private static final String DEFAULT_GROUP_ACTION = SensitiveWordFilter.ACTION_REJECT;

    private final MsgSensitiveGroupMapper groupMapper;
    private final MsgSensitiveWordMapper wordMapper;
    private final ObjectMapper objectMapper = new ObjectMapper();

    /** tenantId -> 合并后的过滤器（平台词 ∪ 该租户词）。key=0 即平台过滤器。 */
    private final Map<Long, SensitiveWordFilter> cache = new ConcurrentHashMap<>();
    private volatile SensitiveWordFilter platformFilter;

    public SensitiveWordService(MsgSensitiveGroupMapper groupMapper, MsgSensitiveWordMapper wordMapper) {
        this.groupMapper = groupMapper;
        this.wordMapper = wordMapper;
    }

    @PostConstruct
    public void init() {
        try {
            reloadAll();
        } catch (Exception e) {
            // 表可能尚未创建（schema.sql 需手动执行）：不阻塞启动，待表就绪后写操作/refresh 会自动加载
            log.warn("敏感词缓存初始化失败（表可能未创建），将在表就绪后通过写操作/refresh 自动加载: {}", e.getMessage());
        }
    }

    /** 全量重建缓存：平台过滤器 + 各租户合并过滤器。 */
    public synchronized void reloadAll() {
        List<MsgSensitiveGroup> groups = groupMapper.selectList(
                new LambdaQueryWrapper<MsgSensitiveGroup>().eq(MsgSensitiveGroup::getIsDeleted, 0));
        List<MsgSensitiveWord> words = wordMapper.selectList(
                new LambdaQueryWrapper<MsgSensitiveWord>().eq(MsgSensitiveWord::getIsDeleted, 0));

        Map<Long, String> groupAction = new HashMap<>();
        for (MsgSensitiveGroup g : groups) {
            groupAction.put(g.getGroupId(), normalizeAction(g.getDefaultAction(), DEFAULT_GROUP_ACTION));
        }

        Map<Long, List<SensitiveWordFilter.Word>> byTenant = new HashMap<>();
        byTenant.put(0L, new ArrayList<>());
        for (MsgSensitiveWord w : words) {
            Long tid = (w.getTenantId() == null) ? 0L : w.getTenantId();
            String action = (w.getAction() != null && !w.getAction().isBlank())
                    ? normalizeAction(w.getAction(), null)
                    : groupAction.getOrDefault(w.getGroupId(), DEFAULT_GROUP_ACTION);
            byTenant.computeIfAbsent(tid, k -> new ArrayList<>())
                    .add(new SensitiveWordFilter.Word(SensitiveWordFilter.normalize(w.getWord()), action));
        }

        platformFilter = new SensitiveWordFilter(byTenant.get(0L));
        Map<Long, SensitiveWordFilter> newCache = new ConcurrentHashMap<>();
        newCache.put(0L, platformFilter);
        for (Map.Entry<Long, List<SensitiveWordFilter.Word>> e : byTenant.entrySet()) {
            Long tid = e.getKey();
            if (tid == 0L) continue;
            List<SensitiveWordFilter.Word> merged = new ArrayList<>(byTenant.get(0L));
            merged.addAll(e.getValue());
            newCache.put(tid, new SensitiveWordFilter(merged));
        }
        cache.clear();
        cache.putAll(newCache);
    }

    private SensitiveWordFilter filterFor(Long tenantId) {
        if (tenantId == null || tenantId < 0) tenantId = 0L;
        SensitiveWordFilter f = cache.get(tenantId);
        return (f != null) ? f : cache.get(0L);
    }

    /**
     * 发送校验拦截：命中 REJECT 词 -> 抛异常拒绝发送；命中 MASK 词 -> 就地掩码（掩码后的值会被 buildMessage 加密落库）。
     * 标题/内容直接掩码；payload 以 JSON 字符串掩码后回写 Map（解析失败则保留原文，仅做 REJECT 检测）。
     */
    public void validateAndFilter(SendMessageReq req, Long tenantId) {
        SensitiveWordFilter f = filterFor(tenantId);
        if (f == null || f.isEmpty()) return;

        if (req.getTitle() != null && !req.getTitle().isBlank()) {
            SensitiveWordFilter.Match r = f.firstReject(req.getTitle());
            if (r != null) throw new MessageBizException(400, "消息包含禁用内容「" + r.word + "」，发送被拒绝");
            if (containsMask(f, req.getTitle())) req.setTitle(f.mask(req.getTitle()));
        }
        if (req.getContent() != null && !req.getContent().isBlank()) {
            SensitiveWordFilter.Match r = f.firstReject(req.getContent());
            if (r != null) throw new MessageBizException(400, "消息包含禁用内容「" + r.word + "」，发送被拒绝");
            if (containsMask(f, req.getContent())) req.setContent(f.mask(req.getContent()));
        }
        if (req.getPayload() != null && !req.getPayload().isEmpty()) {
            String json = toJson(req.getPayload());
            if (json != null) {
                SensitiveWordFilter.Match r = f.firstReject(json);
                if (r != null) throw new MessageBizException(400, "消息包含禁用内容「" + r.word + "」，发送被拒绝");
                if (containsMask(f, json)) {
                    String masked = f.mask(json);
                    try {
                        req.setPayload(objectMapper.readValue(masked, Map.class));
                    } catch (Exception ignore) {
                        // JSON 结构被破坏（极少见，如敏感词跨 JSON 键名）则保留原文，仅做 REJECT 检测
                    }
                }
            }
        }
    }

    private boolean containsMask(SensitiveWordFilter f, String text) {
        for (SensitiveWordFilter.Match m : f.findAll(text)) {
            if (SensitiveWordFilter.ACTION_MASK.equals(m.action)) return true;
        }
        return false;
    }

    private String toJson(Object o) {
        try {
            return objectMapper.writeValueAsString(o);
        } catch (Exception e) {
            return null;
        }
    }

    // ===================== 分组管理 =====================

    public List<MsgSensitiveGroup> listGroups(Long callerTenant, boolean platformAdmin) {
        LambdaQueryWrapper<MsgSensitiveGroup> w = new LambdaQueryWrapper<>();
        w.eq(MsgSensitiveGroup::getIsDeleted, 0);
        if (!platformAdmin) w.eq(MsgSensitiveGroup::getTenantId, callerTenant == null ? 0L : callerTenant);
        w.orderByDesc(MsgSensitiveGroup::getGroupId);
        return groupMapper.selectList(w);
    }

    @Transactional
    public MsgSensitiveGroup createGroup(SensitiveGroupReq req, Long callerTenant, boolean platformAdmin) {
        if (req.getGroupName() == null || req.getGroupName().isBlank())
            throw new MessageBizException(400, "分组名称不能为空");
        Long tid = resolveGroupTenant(req.getTenantId(), callerTenant, platformAdmin);
        MsgSensitiveGroup g = new MsgSensitiveGroup();
        g.setTenantId(tid);
        g.setGroupName(req.getGroupName().trim());
        g.setDefaultAction(normalizeAction(req.getDefaultAction(), DEFAULT_GROUP_ACTION));
        g.setIsSystemPredefined(0);
        g.setIsDeleted(0);
        groupMapper.insert(g);
        reloadAll();
        return g;
    }

    @Transactional
    public void updateGroup(Long groupId, SensitiveGroupReq req, Long callerTenant, boolean platformAdmin) {
        MsgSensitiveGroup g = groupMapper.selectById(groupId);
        if (g == null || g.getIsDeleted() != 0) throw new MessageBizException(404, "敏感词组不存在");
        if (!canManageGroup(g, callerTenant, platformAdmin)) throw new MessageBizException(403, "无权修改该组");
        if (req.getGroupName() != null && !req.getGroupName().isBlank()) g.setGroupName(req.getGroupName().trim());
        if (req.getDefaultAction() != null && !req.getDefaultAction().isBlank())
            g.setDefaultAction(normalizeAction(req.getDefaultAction(), g.getDefaultAction()));
        groupMapper.updateById(g);
        reloadAll();
    }

    @Transactional
    public void deleteGroup(Long groupId, Long callerTenant, boolean platformAdmin) {
        MsgSensitiveGroup g = groupMapper.selectById(groupId);
        if (g == null || g.getIsDeleted() != 0) throw new MessageBizException(404, "敏感词组不存在");
        if (!canManageGroup(g, callerTenant, platformAdmin)) throw new MessageBizException(403, "无权删除该组");
        if (g.getIsSystemPredefined() != null && g.getIsSystemPredefined() == 1)
            throw new MessageBizException(400, "系统预置分组不可删除");
        // 级联逻辑删除组内词
        wordMapper.update(null, new LambdaUpdateWrapper<MsgSensitiveWord>()
                .eq(MsgSensitiveWord::getGroupId, groupId).set(MsgSensitiveWord::getIsDeleted, 1));
        g.setIsDeleted(1);
        groupMapper.updateById(g);
        reloadAll();
    }

    // ===================== 敏感词管理 =====================

    public PageResult<MsgSensitiveWord> listWords(Long groupId, String keyword, int pageNum, int pageSize,
                                                  Long callerTenant, boolean platformAdmin) {
        LambdaQueryWrapper<MsgSensitiveWord> w = new LambdaQueryWrapper<>();
        w.eq(MsgSensitiveWord::getIsDeleted, 0);
        if (groupId != null) w.eq(MsgSensitiveWord::getGroupId, groupId);
        if (keyword != null && !keyword.isBlank()) w.like(MsgSensitiveWord::getWord, keyword);
        if (!platformAdmin) w.eq(MsgSensitiveWord::getTenantId, callerTenant == null ? 0L : callerTenant);
        w.orderByDesc(MsgSensitiveWord::getWordId);
        List<MsgSensitiveWord> all = wordMapper.selectList(w);
        int total = all.size();
        int from = (pageNum - 1) * pageSize;
        int to = Math.min(from + pageSize, total);
        return PageResult.of(from < total ? all.subList(from, to) : new ArrayList<>(), total, pageNum, pageSize);
    }

    @Transactional
    public MsgSensitiveWord createWord(SensitiveWordReq req, Long callerTenant, boolean platformAdmin) {
        if (req.getGroupId() == null) throw new MessageBizException(400, "必须指定所属词组");
        if (req.getWord() == null || req.getWord().isBlank()) throw new MessageBizException(400, "敏感词不能为空");
        MsgSensitiveGroup g = groupMapper.selectById(req.getGroupId());
        if (g == null || g.getIsDeleted() != 0) throw new MessageBizException(404, "所属词组不存在");
        if (!canManageGroup(g, callerTenant, platformAdmin)) throw new MessageBizException(403, "无权向该组添加词");
        dedupeWord(req.getGroupId(), req.getWord().trim(), null);
        MsgSensitiveWord w = new MsgSensitiveWord();
        w.setGroupId(g.getGroupId());
        w.setTenantId(g.getTenantId());
        w.setWord(req.getWord().trim());
        w.setAction(req.getAction() == null || req.getAction().isBlank() ? null : normalizeAction(req.getAction(), null));
        w.setIsDeleted(0);
        wordMapper.insert(w);
        reloadAll();
        return w;
    }

    @Transactional
    public void updateWord(Long wordId, SensitiveWordReq req, Long callerTenant, boolean platformAdmin) {
        MsgSensitiveWord w = wordMapper.selectById(wordId);
        if (w == null || w.getIsDeleted() != 0) throw new MessageBizException(404, "敏感词不存在");
        MsgSensitiveGroup g = groupMapper.selectById(w.getGroupId());
        if (g == null || !canManageGroup(g, callerTenant, platformAdmin)) throw new MessageBizException(403, "无权修改该词");
        if (req.getWord() != null && !req.getWord().isBlank()) {
            dedupeWord(w.getGroupId(), req.getWord().trim(), wordId);
            w.setWord(req.getWord().trim());
        }
        if (req.getAction() != null) w.setAction(req.getAction().isBlank() ? null : normalizeAction(req.getAction(), null));
        wordMapper.updateById(w);
        reloadAll();
    }

    @Transactional
    public void deleteWord(Long wordId, Long callerTenant, boolean platformAdmin) {
        MsgSensitiveWord w = wordMapper.selectById(wordId);
        if (w == null || w.getIsDeleted() != 0) throw new MessageBizException(404, "敏感词不存在");
        MsgSensitiveGroup g = groupMapper.selectById(w.getGroupId());
        if (g == null || !canManageGroup(g, callerTenant, platformAdmin)) throw new MessageBizException(403, "无权删除该词");
        w.setIsDeleted(1);
        wordMapper.updateById(w);
        reloadAll();
    }

    /** 检测预览（不落库）：返回命中词、是否拒绝/掩码、掩码预览。 */
    public Map<String, Object> test(String text, Long callerTenant, boolean platformAdmin) {
        SensitiveWordFilter f = filterFor(callerTenant);
        Map<String, Object> out = new HashMap<>();
        if (f == null || f.isEmpty() || text == null || text.isBlank()) {
            out.put("hit", false);
            out.put("rejected", false);
            out.put("masked", false);
            out.put("preview", text);
            out.put("matches", new ArrayList<>());
            return out;
        }
        List<Map<String, String>> matches = new ArrayList<>();
        boolean rejected = false;
        boolean masked = false;
        for (SensitiveWordFilter.Match m : f.findAll(text)) {
            Map<String, String> mm = new HashMap<>();
            mm.put("word", m.word);
            mm.put("action", m.action);
            matches.add(mm);
            if (SensitiveWordFilter.ACTION_REJECT.equals(m.action)) rejected = true;
            else masked = true;
        }
        out.put("hit", !matches.isEmpty());
        out.put("rejected", rejected);
        out.put("masked", masked);
        out.put("preview", f.mask(text));
        out.put("matches", matches);
        return out;
    }

    // ===================== 权限/工具 =====================

    private Long resolveGroupTenant(Long reqTenant, Long callerTenant, boolean platformAdmin) {
        if (platformAdmin) {
            if (reqTenant != null) return reqTenant;
            return 0L;
        }
        return (callerTenant == null) ? 0L : callerTenant;
    }

    private boolean canManageGroup(MsgSensitiveGroup g, Long callerTenant, boolean platformAdmin) {
        if (platformAdmin) return true;
        return callerTenant != null && callerTenant.equals(g.getTenantId());
    }

    private void dedupeWord(Long groupId, String word, Long selfId) {
        LambdaQueryWrapper<MsgSensitiveWord> w = new LambdaQueryWrapper<>();
        w.eq(MsgSensitiveWord::getGroupId, groupId).eq(MsgSensitiveWord::getWord, word).eq(MsgSensitiveWord::getIsDeleted, 0);
        if (selfId != null) w.ne(MsgSensitiveWord::getWordId, selfId);
        if (wordMapper.selectCount(w) > 0) throw new MessageBizException(400, "该词组已存在相同敏感词");
    }

    private String normalizeAction(String a, String dflt) {
        if (a == null || a.isBlank()) return dflt;
        return "MASK".equalsIgnoreCase(a.trim()) ? SensitiveWordFilter.ACTION_MASK : SensitiveWordFilter.ACTION_REJECT;
    }
}
