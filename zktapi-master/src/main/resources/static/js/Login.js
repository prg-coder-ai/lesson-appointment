$(function () {

    $('#LoginButton').click(function (e) {
        e.preventDefault();
        login();
    });

    //$('.login_area input').eq(0).focus();
});

$(document).keyup(function(event){
    if(event.keyCode ==13){
        $("#LoginButton").trigger("click");
    }
});

function login() {
    var username = $('#UserName').val();
    var pwd = $('#Password').val();
    if (!username || !pwd) {
        $("#errMsg").text('请完整填写用户名及密码信息！');
        return;
    }
    $.ajax({
        url: '/login',
        type: 'POST',
        data: {
            'account': $('#UserName').val(),
            'password': $('#Password').val(),
            'rememberMe': $('#RememberMe').is(':checked')
        },
        success: function (data) {
          // console.log("---loginUser-data--");
          //                console.log(data);
            if (data.error.length > 0) {
                $("#errMsg").text(data.error.join(";") + "!");
            }
            else if (data.data.token) {
               localStorage.setItem('token', data.data.token);
               localStorage.setItem('loginUser', JSON.stringify(data.data.user));
               //  var user_logged =localStorage.getItem('loginUser');
              //  console.log("---loginUser---");
                //   console.log("loginUser");
              //   console.log(user_logged);
              //    var user_struct = JSON.parse(user_logged);
               //     console.log(user_struct);

                addCookie('authorization', data.data.token, 2);
                location.href = '/admin/index';
               // location.href = '/admin/employee/listonly';
            }
            else {
                $("#errMsg").text('发生异常,请重试！');
            }
        },
        error: function (data) {
            alert(JSON.stringify(data));
        }
    })
}

function addCookie(sName, sValue, day) {
    var expireDate = new Date();
    expireDate.setDate(expireDate.getDate() + day);
//设置失效时间
    document.cookie = sName + '=' + sValue + ';expires=' + expireDate.toGMTString(); //escape()汉字转成unicode编码,toGMTString() 把日期对象转成字符串
}
