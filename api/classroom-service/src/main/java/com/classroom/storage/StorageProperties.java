package com.classroom.storage;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * 对象存储配置（{@code classroom.storage.*}）。
 *
 * <p>本期提供两种落地形态：
 * <ul>
 *   <li>{@code local}（默认）——落本机/挂载盘，签名 URL 由服务端校验后流式输出。
 *       私有化部署与开发环境零外部依赖，功能<b>真实可用</b>：上传、断点续传、
 *       2h 签名访问、Range 拖动都走通；</li>
 *   <li>{@code s3} / {@code oss} —— 云对象存储，实现 {@link ObjectStorage} 后按
 *       {@link #type} 装配即可，业务侧（讲稿/作品/录制）代码无需改动。</li>
 * </ul>
 *
 * <p>为什么不是「默认就上云」：本服务要在客户内网跑，不能因为没配 AK/SK 就传不了作业。
 * 换成云存储是<b>配置 + 一个实现类</b>的事，不是架构改造。
 */
@Data
@Component
@ConfigurationProperties(prefix = "classroom.storage")
public class StorageProperties {

    /** local | s3 | oss（仅 local 内置实现；其余需实现 ObjectStorage 接口） */
    private String type = "local";

    /** local 形态的根目录（相对路径以进程工作目录为基准） */
    private String localRoot = "./data/oss";

    /** 单文件上限（字节），默认 100MB，与需求 F4-04 / F5-01 一致 */
    private long maxFileSizeBytes = 100L * 1024 * 1024;

    /** 分片大小（字节），默认 5MB */
    private int partSizeBytes = 5 * 1024 * 1024;

    /** 签名 URL 有效期（秒），默认 2 小时，与需求 F4-06「仅成员访问 + 2h 有效」一致 */
    private int signedUrlTtlSeconds = 7200;

    /**
     * 对外访问前缀（如 https://cdn.example.com）。留空则生成相对路径
     * {@code /api/v1/files/...}，由同源代理/网关转发到本服务。
     */
    private String publicBaseUrl = "";
}
