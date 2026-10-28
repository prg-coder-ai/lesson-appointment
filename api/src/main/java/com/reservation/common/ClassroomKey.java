package com.reservation.common;

/**
 * 课次级课堂标识解码（2026-10-28 S5，与 classroom-service 的 ClassroomKey 配对）。
 *
 * <p>课堂侧把「排期 + 课次」编码成一个标识：
 * <pre>
 *   第 1 课次（含所有历史数据）：{@code "<scheduleId>"}
 *   第 2 课次及以后：          {@code "<scheduleId>~<classIndex>"}
 * </pre>
 *
 * <p><b>预约侧只会用到解码</b>：{@code lesson_attendance.schedule_id} 存的是编码后的串
 * （与课堂侧一致，便于对账），而 {@code course_schedule / booking / appointment}
 * 用的是裸排期 id。凡是拿回调里的 scheduleId 去查这三张表的地方，
 * 必须先 {@link #scheduleIdOf} 解掉后缀，否则查不到数据——且不会报错，只是"没结果"。
 *
 * <p>编码规则为何这么定，见课堂侧 {@code ClassroomKey} 的类注释。
 */
public final class ClassroomKey {

    /** 标识分隔符，与课堂侧保持一致 */
    public static final char SEPARATOR = '~';

    private ClassroomKey() {
    }

    /** 取排期 id（裸 id 原样返回，带后缀的截掉后缀） */
    public static String scheduleIdOf(String key) {
        if (key == null) {
            return null;
        }
        int i = key.indexOf(SEPARATOR);
        return i < 0 ? key : key.substring(0, i);
    }

    /** 取课次序号；裸 id 视为第 1 课次，后缀非法也回落 1（不抛异常，编码串来自外部） */
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

    public static boolean hasClassIndex(String key) {
        return key != null && key.indexOf(SEPARATOR) >= 0;
    }
}
