package com.reservation.common;

/**
 * 登录风控判定结果（2026-10-22 P0）。
 *
 * <p>刻意做成不可变记录而不是"布尔 + 一堆出参"：调用方要拿到的不是"过不过"，
 * 而是"因为哪个维度、当前计数多少、阈值多少"——出问题时这几个值就是排查线索，
 * 没有它们，线上只看得到一句"操作过于频繁"，根本不知道是 IP 闸还是账号闸在拦。
 *
 * <p><b>三态而非两态</b>：{@code pass} / {@code challenge} / {@code reject}。
 * P0 只用前两态（超限统一走 {@code challenge}，返回 code=1002 并由前端提示"请稍后再试"），
 * 保留 {@code reject} 是给 P1 的评分高分档预留（≥70 分直接拒绝）。
 * 现在就把三态定下来，是为了 P1 接入时不必改调用方签名。
 *
 * @param verdict   判定类型
 * @param reason    触发原因（维度名或内部标记，仅入日志，不返给客户端）
 * @param dim       触发的维度：ip / account / tenant / openid / global
 * @param count     当前窗口计数
 * @param limit     该维度的阈值
 */
public record GuardVerdict(Verdict verdict, String reason, String dim, long count, int limit) {

    /** 判定类型。 */
    public enum Verdict {
        /** 放行。 */
        PASS,
        /** 需要人机验证 / 稍后再试（P0 返回 1002）。 */
        CHALLENGE,
        /** 直接拒绝（P1 评分高分档使用，P0 不产生）。 */
        REJECT
    }

    public static GuardVerdict pass(String reason) {
        return new GuardVerdict(Verdict.PASS, reason, null, 0L, 0);
    }

    public static GuardVerdict challenge(String dim, long count, int limit) {
        return new GuardVerdict(Verdict.CHALLENGE, "rate:" + dim, dim, count, limit);
    }

    public static GuardVerdict reject(String reason) {
        return new GuardVerdict(Verdict.REJECT, reason, null, 0L, 0);
    }

    public boolean needChallenge() {
        return verdict == Verdict.CHALLENGE;
    }

    public boolean rejected() {
        return verdict == Verdict.REJECT;
    }

    /** 是否需要拦截（挑战或拒绝）。业务端点只需判这一个。 */
    public boolean blocked() {
        return verdict != Verdict.PASS;
    }
}
