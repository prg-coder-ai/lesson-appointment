package com.reservation.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.reservation.entity.WxLoginState;
import com.reservation.mapper.WxLoginStateMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
/**
 * 微信 PC 扫码一次性 state 的读写（P2，唯一入口）。
 *
 * <p>状态机：{@code pending → confirmed | failed →（轮询取走即删）}；
 * 超过 {@link #EXPIRE_SECONDS} 未消费按过期处理并删除。表不做批量保留，
 * confirmed 行只可能存活到「生成时刻 + 5 分钟」之后的下一次惰性清理
 * （{@link #cleanupExpired()}，由 qr 生成/pc-callback 触发）。
 *
 * <p>本表无 tenant_id 列且已登记 {@code MyBatisPlusConfig.IGNORE_TABLES}，
 * 所有查询都不拼租户条件——扫码是平台级公开动作。
 */
@Service
public class WxLoginStateService {

    private static final Logger log = LoggerFactory.getLogger(WxLoginStateService.class);

    /** state 有效期 5 分钟（与微信授权 code 有效期对齐）。 */
    public static final long EXPIRE_SECONDS = 300;

    private final WxLoginStateMapper wxLoginStateMapper;
    // 注入容器 bean（勿用 new ObjectMapper()）：全局 Jackson 配置（LocalDateTime 序列化格式等）
    // 只对容器管理的 Mapper 生效，date-contract 守卫会拦裸构造。
    private final ObjectMapper objectMapper;

    public WxLoginStateService(WxLoginStateMapper wxLoginStateMapper, ObjectMapper objectMapper) {
        this.wxLoginStateMapper = wxLoginStateMapper;
        this.objectMapper = objectMapper;
    }

    /**
     * 生成一次性 state。
     *
     * @param purpose {@code login}=扫码登录 / {@code bind}=已登录账号绑微信
     * @param userId  bind 场景的发起用户（服务端从令牌解析后传入）；login 场景传 null
     * @param ip      发起请求 IP（审计用，不做相等性强制）
     */
    public WxLoginState create(String purpose, String userId, String ip) {
        cleanupExpired();   // 惰性清道夫：随手带走过期行，免调度器依赖
        WxLoginState s = new WxLoginState();
        s.setState(UUID.randomUUID().toString().replace("-", ""));
        s.setPurpose(purpose == null || purpose.isBlank() ? "login" : purpose);
        s.setUserId(userId);
        s.setIp(ip);
        s.setStatus("pending");
        s.setExpireAt(LocalDateTime.now().plusSeconds(EXPIRE_SECONDS));
        wxLoginStateMapper.insert(s);
        return s;
    }

    /** 按 state 原样查行（不过滤状态/过期，判定逻辑在 {@link #poll}）。 */
    public WxLoginState getByState(String state) {
        if (state == null || state.isBlank()) return null;
        return wxLoginStateMapper.selectOne(new LambdaQueryWrapper<WxLoginState>()
                .eq(WxLoginState::getState, state)
                .last("LIMIT 1"));
    }

    public boolean isExpired(WxLoginState s) {
        return s == null || s.getExpireAt() == null || s.getExpireAt().isBefore(LocalDateTime.now());
    }

    /** 确认成功。login 场景带会话 JSON（一次性，轮询取走即删行）。 */
    public void markConfirmed(String state, String tokenJson) {
        WxLoginState s = getByState(state);
        if (s == null) return;
        s.setStatus("confirmed");
        s.setTokenJson(tokenJson);
        wxLoginStateMapper.updateById(s);
    }

    /** 确认失败（微信换码失败 / 账号未绑定 / 绑定冲突等），原因原样透前端。 */
    public void markFailed(String state, String errorMsg) {
        WxLoginState s = getByState(state);
        if (s == null) return;
        s.setStatus("failed");
        s.setErrorMsg(errorMsg == null ? "" : errorMsg);
        wxLoginStateMapper.updateById(s);
    }

    /**
     * 轮询消费：返回状态快照；终态（confirmed/failed）读取后<b>即删行</b>——一次性语义，
     * token 不重放。login 场景 confirmed 时附带会话字段（userId/token/refreshToken/role/tenantCode）。
     */
    public Map<String, Object> poll(String state) {
        Map<String, Object> r = new HashMap<>();
        WxLoginState s = getByState(state);
        if (s == null) {
            r.put("status", "expired");   // 从未存在或已被消费，都引导重新扫码
            return r;
        }
        if ("confirmed".equals(s.getStatus())) {
            r.put("status", "confirmed");
            if ("login".equals(s.getPurpose()) && s.getTokenJson() != null && !s.getTokenJson().isBlank()) {
                try {
                    r.putAll(objectMapper.readValue(s.getTokenJson(), new TypeReference<Map<String, Object>>() {}));
                } catch (Exception e) {
                    log.warn("wx_login_state token_json 解析失败, state={}", state);
                }
            }
            deleteByState(state);
            return r;
        }
        if ("failed".equals(s.getStatus())) {
            r.put("status", "failed");
            r.put("message", s.getErrorMsg());
            deleteByState(state);
            return r;
        }
        if (isExpired(s)) {
            deleteByState(state);
            r.put("status", "expired");
            return r;
        }
        r.put("status", "pending");
        return r;
    }

    public void deleteByState(String state) {
        if (state == null || state.isBlank()) return;
        wxLoginStateMapper.delete(new LambdaQueryWrapper<WxLoginState>()
                .eq(WxLoginState::getState, state));
    }

    /** 惰性清理：删过期行（pending 超时 + confirmed/failed 未被轮询取走的残留）。 */
    public int cleanupExpired() {
        return wxLoginStateMapper.delete(new LambdaQueryWrapper<WxLoginState>()
                .lt(WxLoginState::getExpireAt, LocalDateTime.now()));
    }
}
