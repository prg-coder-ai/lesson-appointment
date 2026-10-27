package com.classroom.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("classroom_material")
public class Material {
    @TableId(type = IdType.ASSIGN_ID)
    private Long materialId;
    private String scheduleId;
    private String fileName;
    private String fileType;
    private Long fileSize;
    private String ossKey;
    private String status;
    private Integer currentPage;
    private LocalDateTime createdAt;
}