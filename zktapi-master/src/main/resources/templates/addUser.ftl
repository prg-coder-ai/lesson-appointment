<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>添加用户</title>
    <script src="/jquery.js" type="text/javascript" ></script>
    <script>

        (function ($) {
            //Notification handler
            //abp.event.on('abp.notifications.received', function (userNotification) {
            //    abp.notifications.showUiNotifyForUserNotification(userNotification);
            //});

            //serializeFormToObject plugin for jQuery
            $.fn.serializeFormToObject = function () {
                //serialize to array
                var data = $(this).serializeArray();

                //add also disabled items
                $(':disabled[name]', this).each(function () {
                    data.push({ name: this.name, value: $(this).val() });
                });

                //map to object
                var obj = {};
                data.map(function (x) { obj[x.name] = x.value; });

                return obj;
            };

            //Configure blockUI
            if ($.blockUI) {
                $.blockUI.defaults.baseZ = 2000;
            }

        })(jQuery);

     $(document).ready(function () {
                  $("input[name='addUserBtn']").off("click").on("click",function(e){
                     e.stopPropagation();
                     e.preventDefault();
                     var form=$("#addUserForm").serializeFormToObject();
                     $.ajax({
                         contentType: 'application/json',
                         url:"/createUser",
                         data:JSON.stringify(form),
                         method:"Post",
                         success:function(res){
                             alert(JSON.stringify(res));
                         },
                         error:function(res){
                             alert(JSON.stringify(res));
                         },

                     });
                 });
     });
    </script>
</head>
<body>
 <form id="addUserForm">
     <div>account：<input type="text" name="account" /> </div>
     <div>密码：<input type="password" name="password" /> </div>
     <div>realName：<input type="text" name="realName" /> </div>
     <div>mobile：<input type="text" name="mobile" /> </div>
     <div>QQ：<input type="text" name="QQ" /> </div>
     <div>weixin：<input type="text" name="weixin" /> </div>
     <div>type：<input type="text" name="type"  value="1"/> </div>

     <div><input type="button" value="提交" name="addUserBtn"  /> </div>
 </form>
</body>
</html>