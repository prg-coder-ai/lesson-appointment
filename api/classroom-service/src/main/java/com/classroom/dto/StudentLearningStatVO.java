package com.classroom.dto;

import lombok.Data;

import java.math.BigDecimal;

/**
 * 学情报表：学生维度聚合行（F7-04）。
 *
 * <p>只带 userId，不带姓名：姓名在主库 {@code sys_user.name} 且是加密存储，
 * 跨库 JOIN + 逐行解密成本高、也容易把密文漏到前端（历史踩过）。
 * 运营台需要姓名时按 userId 回主库查。
 */
@Data
public class StudentLearningStatVO {
    private String userId;
    private Integer total;
    private Integer absent;
    private Integer late;
    private Integer present;
    private BigDecimal avgMinutes;
    private Double attendanceRate;
}
