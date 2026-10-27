package com.classroom.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.classroom.entity.Membership;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface MembershipMapper extends BaseMapper<Membership> {
}