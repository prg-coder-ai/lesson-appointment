package com.reservation.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.reservation.entity.WxUserid;
import com.reservation.exception.BusinessException;
import com.reservation.exception.ConflictException;
import com.reservation.mapper.WxUseridMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Objects;

/**
 * 微信 openid 关联的读写（唯一入口）。
 *
 * <p>三条硬规则：
 * <ol>
 *   <li><b>一个微信只绑一个账号</b>：{@code uk_wx_openid} 全局唯一，跨租户统一，不随租户隔离。</li>
 *   <li><b>bind 幂等</b>：同一 openid + 同一 userId 重复调用直接返回，不报错。</li>
 *   <li><b>换绑要显式拒绝</b>：openid 已绑到别的账号时抛 409 —— 不能静默改绑，
 *       否则 A 的微信能被 B 抢走，等于账号接管。</li>
 * </ol>
 */
@Service
public class WxUseridService {

    private static final Logger log = LoggerFactory.getLogger(WxUseridService.class);

    private final WxUseridMapper wxUseridMapper;

    public WxUseridService(WxUseridMapper wxUseridMapper) {
        this.wxUseridMapper = wxUseridMapper;
    }

    /** 按 openid 查绑定；未绑定返回 null（调用方据此返回 1001 走降级）。 */
    public WxUserid findByOpenid(String openid) {
        if (openid == null || openid.isBlank()) return null;
        return wxUseridMapper.selectOne(new LambdaQueryWrapper<WxUserid>()
                .eq(WxUserid::getWxOpenid, openid)
                .last("LIMIT 1"));
    }

    /** 按 userId 查绑定（解绑、展示绑定状态用）。 */
    public WxUserid findByUserId(String userId) {
        if (userId == null || userId.isBlank()) return null;
        return wxUseridMapper.selectOne(new LambdaQueryWrapper<WxUserid>()
                .eq(WxUserid::getUserId, userId)
                .last("LIMIT 1"));
    }

    /**
     * 建立绑定。
     *
     * @param source {@code manual} = 已有账号密码登录后绑定；{@code auto_register} = 微信直接注册
     */
    @Transactional(rollbackFor = Exception.class)
    public void bind(String openid, String userId, Long tenantId, String source) {
        if (openid == null || openid.isBlank() || userId == null || userId.isBlank()) {
            // BusinessException → 全局处理器映射 400
            throw new BusinessException("绑定参数不完整");
        }
        WxUserid exist = findByOpenid(openid);
        if (exist != null) {
            if (Objects.equals(exist.getUserId(), userId)) {
                return;                       // 幂等：已绑到同一账号
            }
            // ConflictException → 409。必须用 409 而非静默改绑：
            // 否则 A 的微信能被 B 抢走，等同于账号接管。
            throw new ConflictException("该微信已绑定其他账号");
        }
        WxUserid record = new WxUserid();
        record.setWxOpenid(openid);
        record.setUserId(userId);
        record.setTenantId(tenantId == null ? 0L : tenantId);
        record.setBindSource(source == null || source.isBlank() ? "manual" : source);
        wxUseridMapper.insert(record);
        log.info("微信绑定成功, userId={}, tenantId={}, source={}", userId, tenantId, source);
    }

    /** 解除绑定（调用方须先判断 {@code auto_register} 不可解绑，否则账号将永久无法登录）。 */
    @Transactional(rollbackFor = Exception.class)
    public void unbind(String userId) {
        if (userId == null || userId.isBlank()) return;
        wxUseridMapper.delete(new LambdaQueryWrapper<WxUserid>()
                .eq(WxUserid::getUserId, userId));
        log.info("微信解绑成功, userId={}", userId);
    }
}
