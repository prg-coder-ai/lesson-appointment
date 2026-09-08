package com.reservation.dto;

import lombok.Data;
@Data
public class TokenDTO {
    private String token;
    private String refreshToken;
}