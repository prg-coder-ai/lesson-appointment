package com.classroom.service;

import com.classroom.dto.ClassLearningStatVO;
import com.classroom.dto.StudentLearningStatVO;
import com.classroom.mapper.ReportMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 学情报表（F7-04）：出勤率 / 迟到率 / 互动次数。
 *
 * <p>口径写在这里而不是散在 SQL 里，因为运营会问「为什么出勤率是 87%」：
 * <ul>
 *   <li>分母 = 出勤记录行数（每课次每学生一行，由签到与下课收尾产生）；</li>
 *   <li>出勤 = 总数 − 缺勤（ABSENT）。LEFT/REJOINED 这类过程态<b>算到课</b>，
 *       否则未收尾的课堂会凭空掉出勤率；</li>
 *   <li>迟到按 {@code late 标记} 或 {@code status=LATE} 任一命中；</li>
 *   <li>平均有效时长只统计到课的人，缺勤的 0 分钟不该拉低整体时长。</li>
 * </ul>
 */
@Slf4j
@Service
public class LearningReportService {

    private final ReportMapper reportMapper;

    public LearningReportService(ReportMapper reportMapper) {
        this.reportMapper = reportMapper;
    }

    public Map<String, Object> build(LocalDateTime from, LocalDateTime to, Long tenantId) {
        List<ClassLearningStatVO> classes = reportMapper.selectByClass(from, to, tenantId);

        long totalStudents = 0, present = 0, late = 0, absent = 0;
        long rollcallAnswered = 0, submissions = 0;
        double minutesSum = 0;
        long minutesCount = 0;

        for (ClassLearningStatVO c : classes) {
            int t = intOf(c.getTotal());
            int ab = intOf(c.getAbsent());
            int lt = intOf(c.getLate());
            c.setPresent(Math.max(0, t - ab));

            totalStudents += t;
            absent += ab;
            late += lt;
            present += c.getPresent();
            rollcallAnswered += intOf(c.getRollcallAnswered());
            submissions += intOf(c.getSubmissions());
            if (c.getAvgMinutes() != null && c.getPresent() > 0) {
                minutesSum += c.getAvgMinutes().doubleValue() * c.getPresent();
                minutesCount += c.getPresent();
            }
        }

        List<StudentLearningStatVO> students = reportMapper.selectByStudent(from, to, tenantId);
        for (StudentLearningStatVO s : students) {
            int t = intOf(s.getTotal());
            int ab = intOf(s.getAbsent());
            s.setPresent(Math.max(0, t - ab));
            s.setAttendanceRate(rate(s.getPresent(), t));
        }

        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("classCount", classes.size());
        summary.put("totalStudents", totalStudents);
        summary.put("present", present);
        summary.put("late", late);
        summary.put("absent", absent);
        summary.put("attendanceRate", rate(present, totalStudents));
        summary.put("lateRate", rate(late, totalStudents));
        summary.put("absenceRate", rate(absent, totalStudents));
        summary.put("avgEffectiveMinutes", minutesCount > 0
                ? round2(minutesSum / minutesCount) : 0d);
        summary.put("rollcallAnswered", rollcallAnswered);
        summary.put("submissions", submissions);
        // 互动次数 = 点名应答 + 作品提交（课堂聊天不落库，不计入，避免给运营一个假指标）
        summary.put("interactions", rollcallAnswered + submissions);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("from", from);
        result.put("to", to);
        result.put("tenantId", tenantId);
        result.put("summary", summary);
        result.put("byClass", classes);
        result.put("byStudent", students);
        return result;
    }

    private int intOf(Number n) {
        return n == null ? 0 : n.intValue();
    }

    private double rate(long numerator, long denominator) {
        if (denominator <= 0) return 0d;
        return round4((double) numerator / denominator);
    }

    private double round4(double v) {
        return BigDecimal.valueOf(v).setScale(4, RoundingMode.HALF_UP).doubleValue();
    }

    private double round2(double v) {
        return BigDecimal.valueOf(v).setScale(2, RoundingMode.HALF_UP).doubleValue();
    }
}
