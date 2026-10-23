package com.reservation.service;

import com.reservation.dto.ChallengeVO;
import com.reservation.entity.AuthChallenge;
import com.reservation.mapper.AuthChallengeMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * 人机挑战的出题与校验（2026-10-22 P1）。
 *
 * <h3>四条不可省的约束</h3>
 * <ol>
 *   <li><b>题目由服务端出、坐标只存服务端</b>：{@code targetX} 落库不下发（见 {@link ChallengeVO} 注释）。</li>
 *   <li><b>绑定主体</b>：出题时把身份（账号 HMAC）写进 {@code subject}，校验时必须相等——
 *       否则 A 解出来的题能给 B 用，等于把"一次解题成本"摊给了任意多个账号。</li>
 *   <li><b>先校验答案、后条件消费</b>：顺序不能反。先消费的话用户拖歪一次就要重新拉题，
 *       体验会崩；而只校验不消费又会被反复试错。正确做法是"答案对 → 条件更新 used=0→1，
 *       用影响行数判并发"，两条请求同时通过时只有一个能拿到 1。</li>
 *   <li><b>失败上限</b>：缺口横坐标只有 60~240 这不到 200 个取值，没有失败上限就等于给了一个
 *       可无限采样的 oracle。达到 {@code max-fail} 立即作废票据。</li>
 * </ol>
 *
 * <h3>为什么轨迹也要判</h3>
 * <p>只判横坐标误差，脚本可以"随机猜 + 重试"硬撞；加上"轨迹点数 + 耗时区间"之后，
 * 一次请求必须表现得像一次真实拖动（≥8 个采样点、200ms~10s），随机猜的成本立刻高一个量级。
 *
 * <h3>可用性优先的降级</h3>
 * <p>{@link #issueOrNull} 在图片生成/落库失败时返回 {@code null} 而不抛异常：
 * 调用方据此**放行登录**。理由很直接——要求挑战却给不出题目，等于把用户永久挡在门外，
 * 这比"少验一次"严重得多。风控组件自身的故障不能让登录不可用，与 P0 的降级姿态一致。
 */
@Slf4j
@Service
public class LoginChallengeService {

    private final AuthChallengeMapper challengeMapper;
    private final CaptchaImageService imageService;

    /** 票据有效期（秒）。 */
    @Value("${login.guard.challenge.ttl.seconds:120}")
    private int ttlSeconds;

    /** 允许的横向误差（像素）。5px 是"肉眼对齐"的容差，再严真人会被误伤。 */
    @Value("${login.guard.challenge.tolerance:5}")
    private int tolerance;

    /** 同一票据允许的失败次数。 */
    @Value("${login.guard.challenge.max-fail:5}")
    private int maxFail;

    /** 轨迹最少采样点数（前端每次 touchmove/mousemove 记一帧）。 */
    @Value("${login.guard.challenge.min-track-points:8}")
    private int minTrackPoints;

    /** 拖动耗时下界（毫秒）：低于它的必是脚本瞬移。 */
    @Value("${login.guard.challenge.min-cost-ms:200}")
    private long minCostMs;

    /** 拖动耗时上界（毫秒）：超时的当作放弃，不是有效作答。 */
    @Value("${login.guard.challenge.max-cost-ms:10000}")
    private long maxCostMs;

    public LoginChallengeService(AuthChallengeMapper challengeMapper,
                                 CaptchaImageService imageService) {
        this.challengeMapper = challengeMapper;
        this.imageService = imageService;
    }

    /**
     * 出题。失败返回 {@code null}，由调用方降级放行（见类注释「可用性优先的降级」）。
     *
     * @param subject 绑定主体：账号 HMAC（Web/小程序密码登录）；后续接微信登录时传 openid
     * @param scene   login / register / bind
     */
    public ChallengeVO issueOrNull(String subject, String scene) {
        if (subject == null || subject.isBlank()) {
            log.warn("挑战出题跳过：subject 为空（无法绑定身份）");
            return null;
        }
        try {
            CaptchaImageService.Puzzle puzzle = imageService.generate();

            AuthChallenge row = new AuthChallenge();
            row.setId(UUID.randomUUID().toString().replace("-", ""));
            row.setSubject(truncate(subject));
            row.setScene(scene);
            row.setTargetX(puzzle.targetX());
            row.setTargetY(puzzle.targetY());
            row.setUsed(0);
            row.setFailCount(0);
            row.setExpireAt(LocalDateTime.now().plusSeconds(Math.max(30, ttlSeconds)));
            challengeMapper.insert(row);

            ChallengeVO vo = new ChallengeVO();
            vo.setChallengeId(row.getId());
            vo.setScene(scene);
            vo.setBgImage(puzzle.bgImage());
            vo.setPieceImage(puzzle.pieceImage());
            vo.setPieceY(puzzle.targetY());          // ★ 只下发 Y；X 留在服务端
            vo.setPieceSize(puzzle.pieceSize());
            vo.setBgWidth(puzzle.bgWidth());
            vo.setBgHeight(puzzle.bgHeight());
            vo.setExpireIn(Math.max(30, ttlSeconds));
            vo.setTolerance(tolerance);
            return vo;
        } catch (Exception e) {
            // 出题失败绝不能把用户挡死，调用方会据此放行
            log.warn("挑战出题失败，本次将降级放行（不做人机验证）", e);
            return null;
        }
    }

    /**
     * 校验作答。
     *
     * @param challengeId 票据 id
     * @param subject     当前请求的身份（账号 HMAC），必须与出题时一致
     * @param moveX       用户拖动的横向位移（px，相对背景左上角）
     * @param trackPoints 轨迹采样点数
     * @param costMs      拖动耗时（毫秒）
     * @return 通过返回 true；任何一项不满足或内部异常都返回 false（不抛）
     */
    public boolean verify(String challengeId, String subject,
                          Integer moveX, Integer trackPoints, Long costMs) {
        if (challengeId == null || challengeId.isBlank() || moveX == null) {
            return false;
        }
        try {
            AuthChallenge ch = challengeMapper.selectById(challengeId);
            if (ch == null) {
                log.warn("挑战校验失败：票据不存在, challengeId={}", challengeId);
                return false;
            }
            if (ch.getUsed() != null && ch.getUsed() != 0) {
                log.warn("挑战校验失败：票据已消费（防重放）, challengeId={}", challengeId);
                return false;
            }
            // ★ 身份绑定：跨身份复用题目必须拒绝
            if (!truncate(subject).equals(ch.getSubject())) {
                log.warn("挑战校验失败：subject 不匹配, challengeId={}", challengeId);
                return false;
            }
            if (ch.getExpireAt() == null || ch.getExpireAt().isBefore(LocalDateTime.now())) {
                log.warn("挑战校验失败：票据已过期, challengeId={}", challengeId);
                return false;
            }
            // 轨迹与耗时：不像真人操作
            if (trackPoints == null || trackPoints < minTrackPoints) {
                return failAndLog(ch, challengeId, "轨迹点不足(" + trackPoints + ")");
            }
            if (costMs == null || costMs < minCostMs || costMs > maxCostMs) {
                return failAndLog(ch, challengeId, "耗时异常(" + costMs + "ms)");
            }
            // 坐标容差
            int delta = Math.abs(moveX - ch.getTargetX());
            if (delta > tolerance) {
                return failAndLog(ch, challengeId, "坐标偏差(" + delta + "px)");
            }
            // ★ 答案正确后才条件消费：并发下只有一条能拿到 1
            int affected = challengeMapper.markUsed(challengeId);
            if (affected != 1) {
                log.warn("挑战校验失败：票据已被并发消费, challengeId={}", challengeId);
                return false;
            }
            return true;
        } catch (Exception e) {
            log.warn("挑战校验异常，按未通过处理（不影响登录可用性，仅本次要求重新作答）", e);
            return false;
        }
    }

    /** 记一次失败并按上限作废票据。 */
    private boolean failAndLog(AuthChallenge ch, String challengeId, String reason) {
        int fails = (ch.getFailCount() == null ? 0 : ch.getFailCount()) + 1;
        if (fails >= maxFail) {
            challengeMapper.invalidate(challengeId);
            log.warn("挑战失败达上限，票据作废, challengeId={}, 原因={}", challengeId, reason);
        } else {
            challengeMapper.incrFail(challengeId);
            log.warn("挑战失败({}/{}), challengeId={}, 原因={}", fails, maxFail, challengeId, reason);
        }
        return false;
    }

    /** 清理过期票据（运维卫生；过期票据在校验时已按 expire_at 拦掉，不清也不影响正确性）。 */
    public int purgeExpired() {
        try {
            return challengeMapper.purgeBefore(LocalDateTime.now().minusMinutes(10));
        } catch (Exception e) {
            log.debug("挑战票据清理失败（不影响功能）", e);
            return 0;
        }
    }

    /** 与 auth_challenge.subject varchar(128) 对齐。 */
    private String truncate(String s) {
        if (s == null) {
            return "";
        }
        return s.length() <= 128 ? s : s.substring(0, 128);
    }
}
