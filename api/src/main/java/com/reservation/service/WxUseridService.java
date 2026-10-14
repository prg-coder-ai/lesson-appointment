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
 * 微信 openid / unionid 关联的读写（唯一入口）。
 *
 * <p>三条硬规则：
 * <ol>
 *   <li><b>一个微信只绑一个账号</b>：{@code uk_wx_openid} 与 {@code uk_wx_unionid} 双重全局唯一，
 *       跨租户统一，不随租户隔离。</li>
 *   <li><b>bind 幂等</b>：同一微信 + 同一 userId 重复调用直接返回，不报错。</li>
 *   <li><b>换绑要显式拒绝</b>：微信已绑到别的账号时抛 409 —— 不能静默改绑，
 *       否则 A 的微信能被 B 抢走，等于账号接管。</li>
 * </ol>
 *
 * <p><b>P1（2026-10-14）unionid 优先</b>：openid 按应用（小程序/网站应用/公众号）分裂，
 * unionid 才是跨端公共键。匹配顺序固定为 unionid → openid；unionid 缺失（未绑开放平台）
 * 时自动回退 openid，存量纯小程序数据零迁移。
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

    /** 按 unionid 查绑定；未绑定返回 null。 */
    public WxUserid findByUnionid(String unionid) {
        if (unionid == null || unionid.isBlank()) return null;
        return wxUseridMapper.selectOne(new LambdaQueryWrapper<WxUserid>()
                .eq(WxUserid::getWxUnionid, unionid)
                .last("LIMIT 1"));
    }

    /**
     * 按微信身份查绑定（登录/注册去重的统一入口）：unionid 优先，缺失回退 openid。
     *
     * <p>顺序不可换：同一自然人在 PC 网站应用拿到的 openid 与小程序不同，
     * 先查 openid 会漏掉跨端账号；unionid 命中即同一人。
     */
    public WxUserid findByIdentity(String openid, String unionid) {
        WxUserid byUnion = findByUnionid(unionid);
        return byUnion != null ? byUnion : findByOpenid(openid);
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
     * @param openid  应用内 openid（小程序/网站应用/公众号各自不同）
     * @param unionid 跨端统一身份（可为 null；未绑开放平台时微信不下发）
     * @param source  {@code manual} = 已有账号密码登录后绑定；{@code auto_register} = 微信直接注册
     */
    @Transactional(rollbackFor = Exception.class)
    public void bind(String openid, String unionid, String userId, Long tenantId, String source) {
        if (openid == null || openid.isBlank() || userId == null || userId.isBlank()) {
            // BusinessException → 全局处理器映射 400
            throw new BusinessException("绑定参数不完整");
        }
        // ① unionid 优先判重（跨端身份键）：该 unionid 已绑到别的账号 → 409
        if (unionid != null && !unionid.isBlank()) {
            WxUserid byUnion = findByUnionid(unionid);
            if (byUnion != null) {
                if (Objects.equals(byUnion.getUserId(), userId)) {
                    return;                   // 幂等：已绑到同一账号
                }
                // ConflictException → 409。必须用 409 而非静默改绑：
                // 否则 A 的微信能被 B 抢走，等同于账号接管。
                throw new ConflictException("该微信已绑定其他账号");
            }
        }
        // ② openid 判重（存量数据无 unionid 的兼容路径）
        WxUserid exist = findByOpenid(openid);
        if (exist != null) {
            if (Objects.equals(exist.getUserId(), userId)) {
                // 幂等：老行无 unionid 时回填（P1 升级后首次登录自动补齐，不做批量迁移）
                if (unionid != null && !unionid.isBlank() && !unionid.equals(exist.getWxUnionid())) {
                    exist.setWxUnionid(unionid);
                    wxUseridMapper.updateById(exist);
                    log.info("微信绑定回填 unionid, userId={}", userId);
                }
                return;
            }
            throw new ConflictException("该微信已绑定其他账号");
        }
        WxUserid record = new WxUserid();
        record.setWxOpenid(openid);
        record.setWxUnionid(unionid);
        record.setUserId(userId);
        record.setTenantId(tenantId == null ? 0L : tenantId);
        record.setBindSource(source == null || source.isBlank() ? "manual" : source);
        wxUseridMapper.insert(record);
        log.info("微信绑定成功, userId={}, tenantId={}, source={}, hasUnionid={}",
                userId, tenantId, source, unionid != null && !unionid.isBlank());
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
