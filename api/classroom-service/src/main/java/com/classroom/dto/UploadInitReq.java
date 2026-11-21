package com.classroom.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import lombok.Data;

/**
 * 分片上传初始化请求。
 *
 * <p>{@code totalSize} 必填：服务端据此算分片数与上限，不给客户端「慢慢试」的空间，
 * 避免超大文件先传一半再被拒。
 */
@Data
public class UploadInitReq {

    /** MATERIAL（讲稿）/ SUBMISSION（作品）/ RECORDING（录制） */
    @NotBlank(message = "用途不能为空")
    @Pattern(regexp = "MATERIAL|SUBMISSION|RECORDING|material|submission|recording",
            message = "用途仅支持 MATERIAL/SUBMISSION/RECORDING")
    private String purpose;

    @NotBlank(message = "课堂 id 不能为空")
    private String scheduleId;

    @NotBlank(message = "文件名不能为空")
    private String fileName;

    @Min(value = 1, message = "文件大小必须大于 0")
    private long fileSize;
}
