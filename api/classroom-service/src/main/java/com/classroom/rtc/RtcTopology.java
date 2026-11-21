package com.classroom.rtc;

/**
 * 媒体拓扑。
 *
 * <p>决定了「谁跟谁连」这件事客户端必须知道：{@link #MESH} 是浏览器两两直连，
 * 每加一人就多一条上行，人数上限硬性存在（默认 6）；{@link #SFU} 是所有人只连
 * 媒体服务器，上行恒定一路、人数由服务器扇出，代价是要么自建要么付费。
 */
public enum RtcTopology {
    /** 原生 WebRTC 全互联（零成本、无需服务商，人数受限、上行随人数线性增长） */
    MESH,
    /** 选择性转发（商用云 RTC 或自建 LiveKit/SRS），上行恒定、支持大规模与云端录制 */
    SFU
}
