package com.reservation.mapper; 

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.reservation.entity.Tenant;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface TenantMapper extends BaseMapper<Tenant> {
}
