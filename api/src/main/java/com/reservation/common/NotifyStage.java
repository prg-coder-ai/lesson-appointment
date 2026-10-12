package com.reservation.common;

import java.util.List;

/**
 * 上课通知的「档位码」常量与文案档位定义。
 *
 * <p>档位码落库在 {@code course_notify_rule_point.stage} 与 {@code notification_dispatch_log.stage}，
 * 决定这条通知用哪套文案模板（模板集中在 {@link com.reservation.service.MessageNotifyService}）。
 *
 * <p>与 {@code seq} 的分工：{@code seq} 决定<b>先后顺序</b>，{@code stage} 决定<b>说什么</b>。
 * 两者不强制一一对应——同一档位码可以出现在两个时间点上（都是「再次预告」的口吻）。
 */
public final class NotifyStage {

    private NotifyStage() {
    }

    /** 首次预告（离上课最远的一档，通常是「提前 N 天」） */
    public static final String PRE_FIRST = "PRE_FIRST";
    /** 再次预告（中途的提醒档，通常是「提前 M 天」） */
    public static final String PRE_AGAIN = "PRE_AGAIN";
    /** 课前预告（通常是「课前 K 分钟」） */
    public static final String PRE_SOON = "PRE_SOON";
    /** 最后提示（离上课最近的一档，通常是「课前 L 分钟」） */
    public static final String FINAL_CALL = "FINAL_CALL";

    /** 合法取值，顺序即界面下拉的默认顺序 */
    public static final List<String> ALL = List.of(PRE_FIRST, PRE_AGAIN, PRE_SOON, FINAL_CALL);

    public static boolean isValid(String stage) {
        return stage != null && ALL.contains(stage.trim().toUpperCase());
    }

    public static String normalize(String stage) {
        if (stage == null) {
            return PRE_AGAIN;
        }
        String s = stage.trim().toUpperCase();
        return ALL.contains(s) ? s : PRE_AGAIN;
    }

    /** 界面可读文案 */
    public static String text(String stage) {
        if (stage == null) {
            return "未知档位";
        }
        switch (stage.trim().toUpperCase()) {
            case PRE_FIRST:
                return "首次预告";
            case PRE_AGAIN:
                return "再次预告";
            case PRE_SOON:
                return "课前预告";
            case FINAL_CALL:
                return "最后提示";
            default:
                return stage;
        }
    }

    /** 界面下拉用：{code, text} 列表 */
    public static List<java.util.Map<String, String>> options() {
        List<java.util.Map<String, String>> list = new java.util.ArrayList<>();
        for (String s : ALL) {
            java.util.Map<String, String> item = new java.util.LinkedHashMap<>();
            item.put("code", s);
            item.put("text", text(s));
            list.add(item);
        }
        return list;
    }
}
