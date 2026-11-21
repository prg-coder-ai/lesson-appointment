package com.classroom.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
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

    /**
     * 签名访问地址（不入库）。列表接口回填，前端 <iframe>/<img> 直接可用，
     * 有效期 default 2h；过期后重新拉列表即可换新链接，不需要刷新页面。
     */
    @TableField(exist = false)
    private String url;
}