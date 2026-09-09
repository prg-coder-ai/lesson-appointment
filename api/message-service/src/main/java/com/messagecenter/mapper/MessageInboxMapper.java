package com.messagecenter.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.messagecenter.entity.MessageInbox;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface MessageInboxMapper extends BaseMapper<MessageInbox> {
}
