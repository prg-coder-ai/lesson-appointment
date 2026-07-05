package com.reservation.service;
 
import com.reservation.dto.TzSwitchPO;
import com.reservation.dto.TzSwitchVO;
 
 /*
import com.reservation.utils.JwtUtil;
import org.springframework.beans.factory.annotation.Autowired;*/
 
import org.springframework.stereotype.Service;
 

/**
 *  
 */
@Service
public class TzSwitchService { 
  
    public  TzSwitchVO tzSwitchTo(TzSwitchPO dataIn) { 
         TzSwitchVO resultMap = new TzSwitchVO();
        try{
            // 示例：DateTime 格式假设为 "yyyy-MM-dd HH:mm:ss"
            String dateTimeStr = dataIn.getDateTime();
         
            if (dateTimeStr != null && dateTimeStr.contains("T")) {
                dateTimeStr = dateTimeStr.replace("T", " ");
               // if(dateTimeStr.contains("Z")) {
               // dateTimeStr = dateTimeStr.replace("Z", "");
              //  }
            }
           
            // 如果dateTimeStr包含小数点，则删除小数点及其后的字符串
            if (dateTimeStr != null && dateTimeStr.contains(".")) {
                dateTimeStr = dateTimeStr.substring(0, dateTimeStr.indexOf('.'));
            }
 
            String fromZone = dataIn.getTimeZone();
            String toZone = dataIn.getSwitchToTimeZone();

            // 解析输入时间
             String tmPattern = "yyyy-MM-dd HH:mm:ss";
            if(dateTimeStr != null && dateTimeStr.contains("/"))
                 tmPattern = "yyyy/MM/dd HH:mm:ss";
            java.time.format.DateTimeFormatter formatter = java.time.format.DateTimeFormatter.ofPattern(tmPattern);
            java.time.LocalDateTime localDateTime = java.time.LocalDateTime.parse(dateTimeStr, formatter);

            // 原时区的ZonedDateTime
            java.time.ZonedDateTime fromZoned = localDateTime.atZone(java.time.ZoneId.of(fromZone));

            // 转为目标时区
            java.time.ZonedDateTime toZoned = fromZoned.withZoneSameInstant(java.time.ZoneId.of(toZone));
            String convertedDateTime = toZoned.format(formatter);

            // 获取星期（中文）
            java.time.format.TextStyle style = java.time.format.TextStyle.FULL;
            java.util.Locale locale = java.util.Locale.getDefault();
       
            String weekday = toZoned.getDayOfWeek().getDisplayName(style, locale);

            // 计算周内序号：周一为1，周日为7
            int dayOfWeekJava = toZoned.getDayOfWeek().getValue(); // 1=Monday, 7=Sunday
         //   int weekdayNumber = dayOfWeekJava;
            // 可把weekdayNumber也放到resultMap中，若VO有对应属性；否则仅注释提示

            resultMap.setTimeZone(toZone);
            resultMap.setDateTime(convertedDateTime);
            resultMap.setWeekday(weekday  ); // 例如: "星期一"
            resultMap.setWeekdayNumber(  dayOfWeekJava ); // 例如: "1"
      

        } catch (Exception e) {
            throw e; 
        }
        return  resultMap;
    }
 
}
 