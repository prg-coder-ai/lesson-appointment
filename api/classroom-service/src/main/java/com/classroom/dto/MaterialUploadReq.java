package com.classroom.dto;

import lombok.Data;

/**
 * 讲稿上传请求。
 */
@Data
public class MaterialUploadReq {
    private String fileName;
    private String fileType;
    private Long fileSize;
    private String ossKey;
}