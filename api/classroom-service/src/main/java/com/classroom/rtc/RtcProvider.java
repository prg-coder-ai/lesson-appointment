package com.classroom.rtc;

/**
 * RTC 服务商 SPI —— 整个媒体层的唯一扩展点。
 *
 * <p>新增一家服务商 = 新写一个 {@code @Component implements RtcProvider}，
 * 不改注册表、不改 controller、不改前端。前端拿到的永远是
 * {@link RtcJoinInfo} 这一份统一契约。
 *
 * <p><b>实现约定</b>：
 * <ul>
 *   <li>{@link #ensureRoom} 必须幂等——开课（手动/自动）、首个成员进房、重连都会调它；</li>
 *   <li>{@link #destroyRoom} 必须幂等且不抛异常语义——下课与收尾都会调，重复调用不能报错；</li>
 *   <li>{@link #available()} 只做「配置是否完备」的静态判断，不许发网络请求
 *       （它会在启动时与每次取 active provider 时被调）；</li>
 *   <li>房间号必须由 scheduleId 派生，禁止接受客户端传入的房间号。</li>
 * </ul>
 */
public interface RtcProvider {

    /** 唯一名（与 {@code classroom.rtc.provider} 取值一致） */
    String name();

    /** 媒体拓扑：决定前端用 mesh 引擎还是 SFU 引擎 */
    RtcTopology topology();

    /** 配置是否完备（密钥/地址齐全）。false 时注册表会降级到 native-mesh */
    boolean available();

    /** 不可用原因（available=false 时给出人话，便于运维排查；可用时返回 null） */
    default String unavailableReason() {
        return null;
    }

    /** 幂等建房，返回房间号 */
    String ensureRoom(String scheduleId);

    /** 幂等销毁房间（下课/收尾调用；不抛异常） */
    void destroyRoom(String scheduleId);

    /** 生成进房配置（含凭证） */
    RtcJoinInfo join(RtcJoinContext ctx);

    /** 房间号派生（各 provider 对房间号格式要求不同，但来源只有一个：scheduleId） */
    default String roomIdOf(String scheduleId) {
        return scheduleId;
    }
}
