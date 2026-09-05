package com.messagecenter.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.messagecenter.entity.MessageCategory;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface MessageCategoryMapper extends BaseMapper<MessageCategory> {
}
