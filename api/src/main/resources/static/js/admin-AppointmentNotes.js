 
 //admin---上课通知--3天内的课程显示-----
// ===================== 核心函数 =====================
 
let DaysAppointmentList=[];// ID,ciurseName,studentName,teacherName,dateTime(创建时间),状态、操作（预览、确认、拒绝） 
 
 
window.refreshAppointmentNotes  = refreshAppointmentNotes ;  

 async function refreshAppointmentNotes(renderTo){
    let days = 7; //TBD 选择 7天、3天、当天1
    await getAppointmentListData(days);
    const id=renderTo;
    showAppointmentList( id); 
 }   
     
// INSERT_YOUR_CODE
// 根据你的描述，应该是 order by 要放在 where 之后。正确语句如下：

// SELECT * FROM lesson_appointment.appointment 
// WHERE appointment_datetime BETWEEN '2026-06-14 00:19:45' AND '2026-06-21 00:19:45'
// ORDER BY id, appointment_datetime;
// INSERT_YOUR_CODE

// 解释：在MySQL命令行直接执行该SQL（包含毫秒部分），能正常查出数据；但是后台mapper中的执行结果有时不一致，常见原因有：
// 1. MySQL中的DATETIME类型默认精度为到秒，小数点后7位会被截断，BETWEEN筛选实际是以'2026-06-14 00:19:45' ~ '2026-06-21 00:19:45'对比。
// 2. 后台传入的时间参数类型如果是java.util.Date或LocalDateTime，默认只到秒，毫秒部分失效；或者数据本身在DB里没毫秒。
// 3. Mapper用字符串参数且包含小数秒时，某些驱动或MyBatis配置处理不一致，导致where条件失效或自动截断等。

// 建议：
// - 检查数据库appointment_datetime字段类型（建议DATETIME/无毫秒，TIMESTAMP有秒级）
// - 后台Mapper SQL建议参数用标准格式字符串'yyyy-MM-dd HH:mm:ss'，不要包含小数点后的部分
// - 入库和查询都统一为不带毫秒的时间字符串
// - 如需精度到毫秒，数据库字段需为DATETIME(3)/TIMESTAMP(3)且前后端参数都精准传递

// 示例后端MyBatis参数（去掉毫秒，再查询）
// select * from lesson_appointment.appointment 
// where appointment_datetime between #{startTime} and #{endTime}
// （#{}的传参建议为'yyyy-MM-dd HH:mm:ss'格式、无毫秒）