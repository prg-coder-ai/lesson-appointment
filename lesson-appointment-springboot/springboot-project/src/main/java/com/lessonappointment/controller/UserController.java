package com.lessonappointment.controller;

import com.lessonappointment.common.Result;
import com.lessonappointment.entity.User;
import com.lessonappointment.service.UserService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/users")
@RequiredArgsConstructor
public class UserController {

    private final UserService userService;

    @GetMapping
    public Result<List<User>> list(
            @RequestParam(required = false) String role,
            @RequestParam(required = false) String status) {
        if (role != null) {
            return Result.success(userService.findByRole(role));
        }
        if (status != null) {
            return Result.success(userService.findByStatus(status));
        }
        return Result.success(userService.findAll());
    }

    @GetMapping("/{id}")
    public Result<User> getById(@PathVariable String id) {
        return userService.findById(id)
                .map(Result::success)
                .orElse(Result.notFound("User not found: " + id));
    }

    @PostMapping
    public Result<User> create(@RequestBody User user) {
        try {
            return Result.success(userService.create(user));
        } catch (IllegalArgumentException e) {
            return Result.badRequest(e.getMessage());
        }
    }

    @PutMapping("/{id}")
    public Result<User> update(@PathVariable String id, @RequestBody User user) {
        try {
            return Result.success(userService.update(id, user));
        } catch (RuntimeException e) {
            return Result.error(e.getMessage());
        }
    }

    @DeleteMapping("/{id}")
    public Result<Void> delete(@PathVariable String id) {
        try {
            userService.delete(id);
            return Result.success();
        } catch (RuntimeException e) {
            return Result.error(e.getMessage());
        }
    }
}
