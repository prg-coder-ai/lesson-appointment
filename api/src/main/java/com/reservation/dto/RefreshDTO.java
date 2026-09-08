package com.reservation.dto;
import lombok.Data;
@Data
public class RefreshDTO {
    private String refreshToken;
    private String account;
     private String role;
}