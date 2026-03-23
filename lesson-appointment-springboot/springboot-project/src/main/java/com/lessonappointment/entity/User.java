package com.lessonappointment.entity;

import jakarta.persistence.*;
import lombok.Data;
import org.hibernate.annotations.UuidGenerator;

import java.time.LocalDateTime;

@Data
@Entity
@Table(name = "`user`")
public class User {

    @Id
    @UuidGenerator
    @Column(name = "user_id", length = 36, nullable = false)
    private String userId;

    @Column(name = "phone", length = 11, nullable = false, unique = true)
    private String phone;

    @Column(name = "email", length = 50, nullable = false, unique = true)
    private String email;

    @Column(name = "password", length = 100, nullable = false)
    private String password;

    /**
     * Role: student / teacher / admin
     */
    @Column(name = "role", length = 10, nullable = false)
    private String role;

    @Column(name = "learn_goal", length = 200)
    private String learnGoal;

    /**
     * Student language level: 入门/进阶/中级/高级/精通
     */
    @Column(name = "language_level", length = 20)
    private String languageLevel;

    @Column(name = "name", length = 50)
    private String name;

    @Column(name = "qualification", columnDefinition = "TEXT")
    private String qualification;

    /**
     * Teacher language type: 英语/日语/韩语/法语/德语/西班牙语
     */
    @Column(name = "language_type", length = 20)
    private String languageType;

    /**
     * Account status: active / inactive / frozen
     */
    @Column(name = "status", length = 10, nullable = false)
    private String status;

    @Column(name = "create_time", nullable = false, updatable = false)
    private LocalDateTime createTime;

    @Column(name = "update_time", nullable = false)
    private LocalDateTime updateTime;

    @PrePersist
    protected void onCreate() {
        createTime = LocalDateTime.now();
        updateTime = LocalDateTime.now();
    }

    @PreUpdate
    protected void onUpdate() {
        updateTime = LocalDateTime.now();
    }
}
