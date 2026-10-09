package com.reservation.common;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 课次 UTC 化的时区换算契约测试
 * ================================
 *
 * <h3>为什么这批测试最该优先写</h3>
 * 课次时间自 2026-10-08 起统一用 UTC，换算全部集中在 {@link ScheduleGenerator}。
 * 而这里的错误<b>全是静默的</b>：换算错了不抛异常、不影响接口响应，
 * 只是页面上显示的时间差几小时 —— 用户看到"我的课是下午 1 点"却实际在晚上 9 点。
 * 没有测试守着，下一次有人"顺手改成直接 format"就会退回2026-10-09 修掉的那个缺陷。
 *
 * <h3>覆盖的三条铁律</h3>
 * <ol>
 *   <li><b>换算可逆</b>：本地 → UTC → 本地 必须回到原值。</li>
 *   <li><b>不依赖服务器时区</b>：同一输入在任何 TZ 下都必须得到同一输出。
 *       这条通过 {@code scheduleLocalToUtc} 内部固定用 UTC 而非默认时区来保证。</li>
 *   <li><b>脏数据不崩</b>：非法时区、空值必须降级而非抛异常 ——
 *       定时任务里一次异常会中断整轮扫描。</li>
 * </ol>
 */
class ScheduleGeneratorTimeZoneTest {

    private static final DateTimeFormatter FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");

    // ==================================================================
    // 1. 排期本地时间 → UTC（写入课次表的唯一入口）
    // ==================================================================

    @Test
    @DisplayName("上海 21:00 排期 → UTC 13:00（东八区，固定 -8 小时）")
    void shanghaiEveningToUtc() {
        LocalDateTime local = LocalDateTime.of(2026, 10, 9, 21, 0);
        LocalDateTime utc = ScheduleGenerator.scheduleLocalToUtc(local, "Asia/Shanghai");
        assertEquals(LocalDateTime.of(2026, 10, 9, 13, 0), utc,
                "东八区 21:00 对应 UTC 13:00；差值不对说明换算方向反了");
    }

    @Test
    @DisplayName("跨日期：上海 08:00 → UTC 前一天 00:00（日期必须正确回退一天）")
    void shanghaiMorningCrossesDateBoundary() {
        LocalDateTime local = LocalDateTime.of(2026, 10, 9, 8, 0);
        LocalDateTime utc = ScheduleGenerator.scheduleLocalToUtc(local, "Asia/Shanghai");
        assertEquals(LocalDateTime.of(2026, 10, 9, 0, 0), utc,
                "UTC 00:00 与东八区 08:00 同日；若得到 10-08 说明日期处理有误");
    }

    @Test
    @DisplayName("纽约 09:00 排期 → UTC 13:00（夏令时 EDT，UTC-4）")
    void newYorkMorningToUtc() {
        // 2026-10-09 纽约仍处夏令时（EDT, UTC-4），11 月初才转EST(UTC-5)。
        // 这个用例同时锁住"不能写死 -5"这件事：若有人把偏移写成固定值，这里会红。
        LocalDateTime local = LocalDateTime.of(2026, 10, 9, 9, 0);
        LocalDateTime utc = ScheduleGenerator.scheduleLocalToUtc(local, "America/New_York");
        assertEquals(LocalDateTime.of(2026, 10, 9, 13, 0), utc,
                "10月初纽约是 EDT(UTC-4)，9:00 → 13:00。若按 EST(-5) 算会得到 14:00");
    }

    @Test
    @DisplayName("纽约 11-05 09:00 → UTC 14:00（冬令时 EST，UTC-5 —— 夏令时结束后偏移变了）")
    void newYorkAfterDstChange() {
        // 与上一个用例成对：同一时区、不同季节偏移不同。
        // 若实现里把偏移缓存成常量，这里必红。这正是"不能自己算偏移、必须交给 ZoneId"的依据。
        LocalDateTime local = LocalDateTime.of(2026, 11, 5, 9, 0);
        LocalDateTime utc = ScheduleGenerator.scheduleLocalToUtc(local, "America/New_York");
        assertEquals(LocalDateTime.of(2026, 11, 5, 14, 0), utc,
                "11月初纽约转 EST(UTC-5)，9:00 → 14:00");
    }

    @ParameterizedTest(name = "{0} 的 {1} → {2}")
    @DisplayName("多个时区往返换算可逆")
    @CsvSource({
            //  zone,排期本地时间(墙上), 期望UTC
            //  ⚠️ 期望值用 JDK 实测得出，不要凭直觉写偏移量：
            //  · 悉尼 10 月初是 AEDT(UTC+11)，不是常见的 +10 —— 写 -10 会得到 23:00 而实际是 22:00
            //  · 纽约 10 月初是 EDT(UTC-4)，11 月初转 EST(UTC-5)，同zone 偏移不同
            "Asia/Shanghai,      2026-10-09T21:00, 2026-10-09T13:00",
            "Asia/Tokyo,         2026-10-09T21:00, 2026-10-09T12:00",
            "Europe/London,      2026-10-09T21:00, 2026-10-09T20:00",
            "America/New_York,   2026-10-09T09:00, 2026-10-09T13:00",
            "America/Edmonton,   2026-10-09T09:00, 2026-10-09T15:00",
            "Australia/Sydney,   2026-10-09T09:00, 2026-10-08T22:00",
    })
    void roundTripAcrossZones(String zone, String localStr, String expectedUtcStr) {
        LocalDateTime local = LocalDateTime.parse(localStr);
        LocalDateTime expectedUtc = LocalDateTime.parse(expectedUtcStr);

        LocalDateTime utc = ScheduleGenerator.scheduleLocalToUtc(local, zone);
        assertEquals(expectedUtc, utc, zone + " 换算结果不符");

        // 再换回来必须等于原始本地时间
        LocalDateTime back = ScheduleGenerator.utcToUserZone(utc, zone);
        assertEquals(local, back, zone + " 往返换算不可逆");
    }

    // ==================================================================
    // 2. 脏数据降级 —— 定时任务里一次异常会中断整轮扫描
    // ==================================================================

    @Test
    @DisplayName("非法时区 id 降级为 UTC，不抛异常")
    void illegalZoneFallsBackToUtc() {
        LocalDateTime local = LocalDateTime.of(2026, 10, 9, 21, 0);
        LocalDateTime utc = ScheduleGenerator.scheduleLocalToUtc(local, "Not/AZone");
        // 降级成 UTC 意味着把墙上时间当UTC，即不做偏移
        assertEquals(local, utc, "降级路径应把墙上时间原样当 UTC");
    }

    @Test
    @DisplayName("空时区降级为 UTC，不抛异常")
    void nullZoneFallsBackToUtc() {
        LocalDateTime local = LocalDateTime.of(2026, 10, 9, 21, 0);
        assertEquals(local, ScheduleGenerator.scheduleLocalToUtc(local, null),
                "null 时区应降级 UTC");
        assertEquals(local, ScheduleGenerator.scheduleLocalToUtc(local, "   "),
                "空白时区应降级 UTC");
    }

    @Test
    @DisplayName("时间为 null 返回 null，不抛 NPE")
    void nullTimeReturnsNull() {
        assertNull(ScheduleGenerator.scheduleLocalToUtc(null, "Asia/Shanghai"));
        assertNull(ScheduleGenerator.utcToUserZone(null, "Asia/Shanghai"));
        assertNull(ScheduleGenerator.utcToZonedText(null, "Asia/Shanghai", FMT),
                "通知正文里时间为空时必须返回 null，让调用方整句省略而不是打印 'null'");
    }

    // ==================================================================
    // 3. 通知正文渲染：必须带时区标注
    // ==================================================================

    @Test
    @DisplayName("utcToZonedText 输出墙上时间 + 时区标注")
    void zonedTextCarriesZoneLabel() {
        LocalDateTime utc = LocalDateTime.of(2026, 10, 9, 13, 0);
        String text = ScheduleGenerator.utcToZonedText(utc, "Asia/Shanghai", FMT);
        assertTrue(text.startsWith("2026-10-09 21:00"),
                "上海时区应显示 21:00，实际: " + text);
        assertTrue(text.contains("（") && text.contains("）"),
                "正文必须带时区标注括号，否则跨时区收件人会误读成本地时间: " + text);
    }

    @Test
    @DisplayName("utcToZonedText 在 fmt 传 null 时用默认格式")
    void zonedTextDefaultsFormatter() {
        LocalDateTime utc = LocalDateTime.of(2026, 10, 9, 13, 0);
        String text = ScheduleGenerator.utcToZonedText(utc, "Asia/Shanghai", null);
        assertNotNull(text);
        assertTrue(text.startsWith("2026-10-09 21:00"), "默认格式应同为 yyyy-MM-dd HH:mm: " + text);
    }

    @Test
    @DisplayName("非法时区：zoneLabel 原样返回 id，绝不静默降级成 UTC")
    void zoneLabelKeepsIllegalIdAsIs() {
        // 这条是刻意设计：正文里的时间没有第二处可对照，
        // 显示 'UTC' 会让用户以为那真的是 UTC 时间。宁可显示一个看不懂的 'Region/City' 字符串。
        String label = ScheduleGenerator.zoneLabel("Bad/Zone");
        assertEquals("Bad/Zone", label, "解析失败必须原样返回 id，而不是悄悄变成 UTC");
    }

    @Test
    @DisplayName("zoneLabel 对空值返回 UTC")
    void zoneLabelHandlesBlank() {
        assertEquals("UTC", ScheduleGenerator.zoneLabel(null));
        assertEquals("UTC", ScheduleGenerator.zoneLabel("  "));
    }

    @Test
    @DisplayName("zoneLabel 对合法时区给出可读名")
    void zoneLabelReadable() {
        String label = ScheduleGenerator.zoneLabel("Asia/Shanghai");
        assertNotNull(label);
        assertTrue(label.length() > 0);
        // 不应回退成 id 本身（说明走了 getDisplayName 分支）
        assertTrue(!"Asia/Shanghai".equals(label), "合法时区应给可读名而非原样返回 id: " + label);
    }

    // ==================================================================
    // 4. nowUtc：不依赖服务器时区
    // ==================================================================

    @Test
    @DisplayName("nowUtc 与服务器默认时区无关（与 LocalDateTime.now(UTC) 偏差在数分钟内）")
    void nowUtcIsIndependentOfServerZone() {
        LocalDateTime utcNow = ScheduleGenerator.nowUtc();
        LocalDateTime systemUtc = LocalDateTime.now(java.time.Clock.systemUTC());
        long diff = Math.abs(java.time.Duration.between(utcNow, systemUtc).getSeconds());
        assertTrue(diff < 120,
                "nowUtc 应返回 UTC 时间，与系统 UTC 时刻偏差应< 2 分钟，实际偏差 " + diff + " 秒");
    }

    // ==================================================================
    // 5. 守恒性：不同输入必须产出不同输出（防"总是返回同一个值"的退化实现）
    // ==================================================================

    @Test
    @DisplayName("不同时区的换算结果必须不同（防总是返回输入的退化实现）")
    void differentZonesGiveDifferentResults() {
        LocalDateTime local = LocalDateTime.of(2026, 10, 9, 12, 0);
        LocalDateTime shanghai = ScheduleGenerator.scheduleLocalToUtc(local, "Asia/Shanghai");
        LocalDateTime tokyo = ScheduleGenerator.scheduleLocalToUtc(local, "Asia/Tokyo");
        LocalDateTime newYork = ScheduleGenerator.scheduleLocalToUtc(local, "America/New_York");

        assertNotNull(shanghai);
        assertNotNull(tokyo);
        assertNotNull(newYork);
        assertTrue(!shanghai.equals(tokyo), "上海与东京偏移不同，结果不应相同");
        assertTrue(!shanghai.equals(newYork), "上海与纽约偏移不同，结果不应相同");
    }

    @Test
    @DisplayName("非法时区参数（保持方法不抛异常）")
    void blankInputsDoNotThrow() {
        // 参数化：确认几个"看起来该炸"的输入都安全返回
        for (String bad : new String[]{"", "  ", "GMT+25", "Asia/Shanghai/"}) {
            LocalDateTime utc = ScheduleGenerator.scheduleLocalToUtc(
                    LocalDateTime.of(2026, 1, 1, 0, 0), bad);
            assertNotNull(utc, "非法时区[" + bad + "] 应降级而非抛异常");
        }
    }

    @ParameterizedTest(name = "非法时区 [{0}] 不抛异常")
    //注意这里的 "null" 是**字面量字符串**（非法时区 id），不是 null 引用；
    // 真正的 null 引用由上面 nullZoneFallsBackToUtc / nullTimeReturnsNull 单独覆盖。
    @ValueSource(strings = {"", "  ", "GMT+25", "Asia/Shanghai/", "null", "UTC+99"})
    @DisplayName("非法时区一律降级（定时任务不能因单个坏数据中断）")
    void illegalZoneNeverThrows(String zone) {
        LocalDateTime local = LocalDateTime.of(2026, 1, 1, 12, 0);
        assertNotNull(ScheduleGenerator.scheduleLocalToUtc(local, zone));
        assertNotNull(ScheduleGenerator.utcToUserZone(local, zone));
    }
}