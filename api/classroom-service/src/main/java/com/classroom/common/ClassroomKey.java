package com.classroom.common;

/**
 * 课次级课堂标识编解码（2026-10-28 S5）。
 *
 * <h3>为什么需要它</h3>
 * `classroom` 的标识原本是「排期 id」，但一个排期会按重复规则展开成 N 个课次
 * （`appointment.class_index = 1..N`，见 booking 侧 `CourseScheduleService`）。
 * 排期级标识下，一个每周重复、共 10 次的排期只有 1 个课堂、1 条出勤，
 * 第 3 次与第 8 次的出勤无法区分——扣课时必然重复或漏扣。
 *
 * <h3>为什么不直接改主键</h3>
 * 改 `(schedule_id, class_index)` 联合主键要动 8 张表、9 个控制器、11 个服务，
 * 而其中绝大部分只是「把标识原样传给下一层」。故采用**复合标识编码**：
 * <pre>
 *   第 1 课次（含所有历史数据）：{@code "<scheduleId>"}            ← 不带分隔符，向后兼容
 *   第 2 课次及以后：          {@code "<scheduleId>~<classIndex>"}
 * </pre>
 * 表结构与查询一个字都不用改，`schedule_id` 列直接存编码后的串；
 * 解码在「进/出边界」各做一次：课堂创建入口、出勤回流落点。
 *
 * <h3>为什么用 {@code ~} 而不是 {@code #} 或 {@code :}</h3>
 * <ul>
 *   <li>{@code #} 在 URL 里是 fragment 起始符，浏览器会截断，路径传不到后端；</li>
 *   <li>{@code :} 部分容器/代理会当成端口或矩阵参数；</li>
 *   <li>{@code ~} 是 RFC 3986 的 unreserved 字符，路径段里无需转义，且排期 id（UUID）不会包含它。</li>
 * </ul>
 *
 * <p><b>第 1 课次刻意保持裸 id</b>：库里已存的课堂数据、已发出的回调、前端已拼好的
 * 链接都是裸 id，一旦统一加后缀，历史课堂立刻全部"找不到"。这条兼容规则不可省。
 */
public final class ClassroomKey {

    /** 标识分隔符（RFC 3986 unreserved，URL 路径中无需转义） */
    public static final char SEPARATOR = '~';

    private ClassroomKey() {
    }

    /**
     * 生成课堂标识。
     *
     * @param scheduleId 排期 id
     * @param classIndex 课次序号；null 或 ≤1 时返回裸 id（兼容历史数据）
     */
    public static String of(String scheduleId, Integer classIndex) {
        if (scheduleId == null) {
            return null;
        }
        if (classIndex == null || classIndex <= 1) {
            return scheduleId;
        }
        return scheduleId + SEPARATOR + classIndex;
    }

    /**
     * 从课堂标识取排期 id。裸 id 原样返回；带后缀的截掉后缀。
     *
     * <p>注意：`scheduleId` 是 UUID，不会含 {@code ~}，故首个分隔符即分界。
     */
    public static String scheduleIdOf(String key) {
        if (key == null) {
            return null;
        }
        int i = key.indexOf(SEPARATOR);
        return i < 0 ? key : key.substring(0, i);
    }

    /**
     * 从课堂标识取课次序号。裸 id 视为第 1 课次；后缀非法（非数字、≤0）也回落 1，
     * 绝不抛异常——编码串会被拼进 URL，容错比严格更重要，错误应在上层用日志暴露。
     */
    public static int classIndexOf(String key) {
        if (key == null) {
            return 1;
        }
        int i = key.indexOf(SEPARATOR);
        if (i < 0 || i == key.length() - 1) {
            return 1;
        }
        try {
            int v = Integer.parseInt(key.substring(i + 1).trim());
            return v > 0 ? v : 1;
        } catch (NumberFormatException e) {
            return 1;
        }
    }

    /** 是否带课次后缀（用于日志区分"课次级课堂"与历史排期级课堂） */
    public static boolean hasClassIndex(String key) {
        return key != null && key.indexOf(SEPARATOR) >= 0;
    }
}
