package com.reservation.entity;

import lombok.Data;
import java.time.LocalDateTime;

@Data
public class RefreshTokenPO {
    private Long id;
    private String userId;
    private String role;
    private String refreshToken;
    private LocalDateTime expireTime;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}