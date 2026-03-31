/*获取登录用户信息*/
function getLoginUser() {
    var userStr = localStorage.getItem('loginUser');
    var user = JSON.parse(userStr);
    if(user)
      user.isManager = isManager(user);
    return user;
}

/*是否是管理员*/
function isManager(user) {
    if (user && user.type != null && user.type == "0") {
        return true;
    }
    return false;
}

/*获取登录token*/
function getToken() {
    return localStorage.getItem('token');
}

/*登出*/
function loginOut() {
    localStorage.removeItem('loginUser');
    localStorage.removeItem('token');
    clearCookie();
    location.href = "/";
}


var currentMenu = '';
$(document).ready(function () {
    var user = getLoginUser();
    console.log(JSON.stringify(user));

    if (user) {
        /*if (user.type == "0") {
            $("#adminMenu").show();
            $("#userMenu").remove();
        }
        else {
            $("#adminMenu").remove();
            $("#userMenu").show();
        }*/
        $("#txtUserName").text(user.name1 + user.name2);
        $("#spnUserName").text(user.name1 + user.name2);
    }
    var currentUrl = location.href;
    var lis = $(".navlt > li > a");
    var hasFind = false;
    for (var j = 0; j < lis.length; j++) {
        var item = lis[j];
        //主菜单直接匹配上
        if (currentUrl.toLowerCase().indexOf($(item).attr("href").toString().toLowerCase()) != -1) {
            currentMenu = $(item).attr("id");
            $(item).addClass("hover");
            break;
        }
        //未匹配上主菜单，则匹配子菜单
        var arr = $(item).parent().find(".dropdown-menu > li > a");
        for (var i = 0; i < arr.length; i++) {
            if (currentUrl.toLowerCase().indexOf($(arr[i]).attr("href").toString().toLowerCase()) != -1) {
                currentMenu = $(item).attr("id");
                $(item).addClass("hover");
                hasFind = true;
                break;
            }
        }
        if (hasFind) {
            break;
        }
    }
    //修改密码
    $("#ChangePwdButton").on("click", function (e) {
        e.stopPropagation();
        e.preventDefault();
        var orgPwd = $("#orgPassword").val();
        var newPassword = $("#newPassword").val();
        var rePassword = $("#rePassword").val();
        $("#errMsg").text("");
        if (!orgPwd) {
            $("#errMsg").text("请输入原密码！");
            return;
        }
        if (!newPassword) {
            $("#errMsg").text("请输入新密码！");
            return;
        }
        if (!rePassword) {
            $("#errMsg").text("请输入确认密码！");
            return;
        }
        if (rePassword != newPassword) {
            $("#errMsg").text("新密码与确认密码不同，请重新输入！");
            return;
        }
        var user = getLoginUser();
        $.ajax({
            url: '/admin/employee/changePassword',
            data: {id: user.id, orgPassword: orgPwd, newPassword: newPassword},
            method: "Post",
            success: function (result) {
                if (result.data.Result == "OK") {
                    alert("密码已经修改，请重新登录！");
                    loginOut();
                }
                else if (result.data.Result == "error") {
                    $("#errMsg").text(result.data.Message);
                }
            },
            error: function (result) {
                alert("发生错误，请重试！");
            }
        });
    })

    //主菜单鼠标效果切换
    $(".navlt > li > a").on("mouseover", function (e) {

        $(".navlt > li > a").each(function (i, item) {
            $(item).removeClass("hover");
        });
        $(this).addClass("hover");
    });

    $(".navlt > li > a").on("mouseout", function (e) {
        $(".navlt > li > a").each(function (i, item) {
            $(item).removeClass("hover");
        });
        $("#" + currentMenu).addClass("hover");
    });
});

function foreach() {
    var strCookie = document.cookie;
    var arrCookie = strCookie.split("; ");
    for (var i = 0; i < arrCookie.length; i++) {
        var arr = arrCookie[i].split("=");
        if (arr.length > 0)
            DelCookie(arr[0]);
    }
}

function GetCookieVal(offset) {
    var endstr = document.cookie.indexOf(";", offset);
    if (endstr == -1)
        endstr = document.cookie.length;
    return decodeURIComponent(document.cookie.substring(offset, endstr));
}

function DelCookie(name) {
    var exp = new Date();
    exp.setTime(exp.getTime() - 1);
    var cval = GetCookie(name);
    document.cookie = name + "=" + cval + "; expires=" + exp.toGMTString();
}

function GetCookie(name) {
    var arg = name + "=";
    var alen = arg.length;
    var clen = document.cookie.length;
    var i = 0;
    while (i < clen) {
        var j = i + alen;
        if (document.cookie.substring(i, j) == arg)
            return GetCookieVal(j);
        i = document.cookie.indexOf(" ", i) + 1;
        if (i == 0) break;
    }
    return null;
}

function clearCookie() {
    var date = new Date();
    date.setTime(date.getTime() - 10000);
    var keys = document.cookie.match(/[^ =;]+(?=\=)/g);
    if (keys) {
        for (var i = keys.length; i--;)
            document.cookie = keys[i] + "=0; expire=" + date.toGMTString() + "; path=/";
    }
}
