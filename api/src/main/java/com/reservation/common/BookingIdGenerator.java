package com.reservation.common;

import java.util.UUID;

/**
 * bookingId 生成口径的<b>唯一入口</b>（报告根因 C：数据完整性兜底）。
 *
 * <h3>为什么必须统一</h3>
 * 库里实测 booking 表同时存在两种 booking_id：
 * <ul>
 *   <li>32 位无横线 hex（{@code UUID.randomUUID().toString().replace("-","")}）——105 行，产自 {@code BookingService#create}</li>
 *   <li>36 位带横线 UUID（{@code UUID.randomUUID().toString()}）——5 行，产自
 *       {@code CourseScheduleService} 的「指定学生」分支</li>
 * </ul>
 * 而 appointment 表里 32 位的 124 行<b>只有 15 行</b>能匹配上 booking，36 位的 25 行全部匹配。
 * 这说明两种格式并存不是"风格差异"，而是在制造真实的关联失败：
 * <ul>
 *   <li>任何按 {@code booking_id} 的关联（课次生成、级联、巡检、按 id 查）都必须
 *       同时对付两种长度，写漏一处就查不到对上行；</li>
 *   <li>更隐蔽的是它会<b>掩盖错误</b>：拿到一个不存在的 booking_id 时，
 *       代码可能认为"这是另一格式的正常 ID"从而静默跳过，而不是报"找不到"。</li>
 * </ul>
 * 因此本类把生成口径收敛为<b>32 位无横线 hex</b>（与占绝大多数的那一种一致），
 * 今后<b>任何新增的 bookingId 必须走本类</b>，直接调 {@code UUID.randomUUID()} 会被
 * {@code tools/check-cascade-rules.mjs} 守卫判红。
 *
 * <p>历史数据不批量改写：改 booking_id 会连带影响所有引用它的行
 * （课次、流水、消息载荷），风险远大于收益。需要按 id 反查旧数据时，
 * 两种长度都能命中（列上是普通字符串，无格式约束），只是新代码不再产出后者。
 */
public final class BookingIdGenerator {

    private BookingIdGenerator() {
    }

    /**
     * 生成新的 bookingId：32 位无横线 hex。
     *
     * <p>不使用雪花 ID 的理由：本项目的 booking 主键是 {@code varchar}，
     * 历史数据全是 UUID 系；改成数字会与 {@code appointment.booking_id varchar(36)}
     * 的既有写法产生不必要的类型认知负担，且 32 位 hex 在索引上的体积优于 36 位带横线。
     */
    public static String next() {
        return UUID.randomUUID().toString().replace("-", "");
    }
}
