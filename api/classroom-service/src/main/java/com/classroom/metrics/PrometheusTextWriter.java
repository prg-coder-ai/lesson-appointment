package com.classroom.metrics;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.DistributionSummary;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.Meter;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Tag;
import io.micrometer.core.instrument.Timer;

import java.util.Locale;
import java.util.concurrent.TimeUnit;

/**
 * 把 {@link MeterRegistry} 渲染成 Prometheus 文本格式（exposition format 0.0.4）。
 *
 * <p><b>为什么不直接用官方 registry</b>：见 {@link BizMetrics} 类注释——离线构建限制。
 * 这里只实现 Prometheus 抓取真正需要的那部分：HELP / TYPE / 样本行，
 * 覆盖 Counter、Gauge、Timer、DistributionSummary 四种类型（其余跳过并注释说明）。
 *
 * <p><b>几个容易出错的点，逐条处理了</b>：
 * <ul>
 *   <li><b>标签值转义</b>：值里的 {@code \\ " \n} 必须转义，否则一个带引号的异常消息
 *       就能让整个抓取响应解析失败（Prometheus 会直接丢掉这一批）；</li>
 *   <li><b>指标名合法性</b>：只允许 {@code [a-zA-Z_:][a-zA-Z0-9_:]*}，不合法的名字会被
 *       Prometheus 拒绝，这里统一替换为下划线而不是静默丢弃——丢名字比改名字更难排查；</li>
 *   <li><b>HELP 只输出一次</b>：同一指标名在 registry 里可能有多个 meter（不同标签组合），
 *       重复输出 HELP 属于非法格式；</li>
 *   <li><b>NaN / Infinity</b>：Prometheus 文本只认 {@code NaN}、{@code +Inf}、{@code -Inf}，
 *       Java 的 {@code Infinity} 直出会解析失败；</li>
 *   <li><b>Timer 单位</b>：统一输出 {@code _seconds}，避免同一个指标在不同抓取点单位不一致。</li>
 * </ul>
 */
public final class PrometheusTextWriter {

    private PrometheusTextWriter() {
    }

    public static String render(MeterRegistry registry) {
        StringBuilder sb = new StringBuilder(4096);
        if (registry == null) {
            return "# no meter registry\n";
        }
        java.util.Set<String> helpEmitted = new java.util.HashSet<>();
        for (Meter meter : registry.getMeters()) {
            Meter.Id id = meter.getId();
            String name = sanitizeName(id.getName());

            if (meter instanceof Counter c) {
                emitHelp(sb, helpEmitted, name, id.getDescription(), "counter");
                sb.append(name).append(renderTags(id, null)).append(' ')
                        .append(format(c.count())).append('\n');
            } else if (meter instanceof Gauge g) {
                emitHelp(sb, helpEmitted, name, id.getDescription(), "gauge");
                double v = g.value();
                if (!Double.isNaN(v)) {
                    sb.append(name).append(renderTags(id, null)).append(' ')
                            .append(format(v)).append('\n');
                }
            } else if (meter instanceof Timer t) {
                // Timer 拆成 count + sum + max，采样桶在没引 prometheus registry 时不具备，
                // 因此显式声明为 summary 而非 histogram：声明成 histogram 却给不出 bucket 是错的
                emitHelp(sb, helpEmitted, name + "_seconds", id.getDescription(), "summary");
                sb.append(name).append("_seconds_count").append(renderTags(id, null)).append(' ')
                        .append(t.count()).append('\n');
                sb.append(name).append("_seconds_sum").append(renderTags(id, null)).append(' ')
                        .append(format(t.totalTime(TimeUnit.SECONDS))).append('\n');
                sb.append(name).append("_seconds_max").append(renderTags(id, null)).append(' ')
                        .append(format(t.max(TimeUnit.SECONDS))).append('\n');
            } else if (meter instanceof DistributionSummary s) {
                emitHelp(sb, helpEmitted, name, id.getDescription(), "summary");
                sb.append(name).append("_count").append(renderTags(id, null)).append(' ')
                        .append(s.count()).append('\n');
                sb.append(name).append("_sum").append(renderTags(id, null)).append(' ')
                        .append(format(s.totalAmount())).append('\n');
                sb.append(name).append("_max").append(renderTags(id, null)).append(' ')
                        .append(format(s.max())).append('\n');
            }
            // LongTaskTimer / TimeGauge 等未使用，跳过（宁可少一个指标，也不输出非法格式）
        }
        return sb.toString();
    }

    private static void emitHelp(StringBuilder sb, java.util.Set<String> emitted,
                                 String name, String desc, String type) {
        if (!emitted.add(name)) {
            return;
        }
        sb.append("# HELP ").append(name).append(' ')
                .append(desc == null || desc.isBlank() ? name : escapeHelp(desc)).append('\n');
        sb.append("# TYPE ").append(name).append(' ').append(type).append('\n');
    }

    /** 标签渲染；额外标签（extra）用于给同名指标加派生维度，当前未用 */
    private static String renderTags(Meter.Id id, Tag extra) {
        java.util.List<Tag> tags = id.getTags();
        if (tags.isEmpty() && extra == null) {
            return "";
        }
        StringBuilder sb = new StringBuilder("{");
        boolean first = true;
        for (Tag t : tags) {
            if (!first) sb.append(',');
            sb.append(t.getKey()).append("=\"").append(escapeTagValue(t.getValue())).append('"');
            first = false;
        }
        if (extra != null) {
            if (!first) sb.append(',');
            sb.append(extra.getKey()).append("=\"").append(escapeTagValue(extra.getValue())).append('"');
        }
        return sb.append('}').toString();
    }

    /** 指标名合法化：非法字符替换为下划线，首字符非字母/下划线/冒号时补前缀 */
    static String sanitizeName(String name) {
        if (name == null || name.isEmpty()) {
            return "unnamed_metric";
        }
        StringBuilder sb = new StringBuilder(name.length() + 1);
        for (int i = 0; i < name.length(); i++) {
            char ch = name.charAt(i);
            boolean ok = (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z')
                    || (ch >= '0' && ch <= '9' && i > 0) || ch == '_' || ch == ':';
            sb.append(ok ? ch : '_');
        }
        char head = sb.charAt(0);
        if (!(Character.isLetter(head) || head == '_' || head == ':')) {
            sb.insert(0, '_');
        }
        return sb.toString();
    }

    private static String escapeTagValue(String v) {
        if (v == null) return "";
        return v.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n");
    }

    private static String escapeHelp(String v) {
        return v.replace("\\", "\\\\").replace("\n", "\\n");
    }

    /** 数值格式化：Prometheus 只认 NaN/+Inf/-Inf，Java 的 Infinity 会解析失败 */
    static String format(double v) {
        if (Double.isNaN(v)) return "NaN";
        if (v == Double.POSITIVE_INFINITY) return "+Inf";
        if (v == Double.NEGATIVE_INFINITY) return "-Inf";
        if (v == Math.rint(v) && Math.abs(v) < 1e15) {
            return String.valueOf((long) v);
        }
        return String.format(Locale.ROOT, "%.6f", v);
    }
}
