package com.classroom.mapper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.classroom.entity.Submission;
import org.apache.ibatis.annotations.Mapper;

import java.time.LocalDateTime;

@Mapper
public interface SubmissionMapper extends BaseMapper<Submission> {

    /** 过期清理：删除 created_at 早于 before 的作业提交记录 */
    default int deleteByCreatedAtBefore(LocalDateTime before) {
        LambdaQueryWrapper<Submission> w = new LambdaQueryWrapper<>();
        w.le(Submission::getCreatedAt, before);
        return delete(w);
    }
}