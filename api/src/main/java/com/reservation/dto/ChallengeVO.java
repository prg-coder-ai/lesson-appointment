package com.reservation.dto;

import lombok.Data;

/**
 * 人机验证挑战素材（2026-10-22 P1，随 {@code code=1002} 的 data 下发）。
 *
 * <p><b>刻意不含 {@code targetX}</b>：缺口横坐标只存在服务端票据里。
 * 一旦下发，滑块就退化成"把值抄给前端"，拖都不用拖。
 *
 * <p>字段全部下发而非由前端推导的原因：尺寸必须由服务端给定。
 * 若前端按自己的 CSS 缩放背景图，用户拖动的像素与服务端比对的像素就不是同一套坐标系，
 * 会出现"明明对齐了却总是不通过"——这类问题极难自查。
 */
@Data
public class ChallengeVO {

    /** 票据 id，重试登录时原样带回。 */
    private String challengeId;

    /** 场景：login / register / bind。 */
    private String scene;

    /** 背景图（data:image/png;base64,...）。 */
    private String bgImage;

    /** 拼图块（data:image/png;base64,...）。 */
    private String pieceImage;

    /** 缺口纵向位置：前端据此决定拼图块的 top，用户只需横向拖动。 */
    private Integer pieceY;

    /** 块边长（服务端权威尺寸）。 */
    private Integer pieceSize;

    /** 背景宽度。 */
    private Integer bgWidth;

    /** 背景高度。 */
    private Integer bgHeight;

    /** 有效期（秒）。 */
    private Integer expireIn;

    /** 允许的横向误差（像素）。下发是为了让前端做"吸附"提示，服务端仍以自身配置为准。 */
    private Integer tolerance;
}
