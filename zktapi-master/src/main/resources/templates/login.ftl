<!DOCTYPE html>
<html lang="zh-cn">
<head>
    <meta charset="utf-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>智能换热站管理系统</title>
    <#--<link rel="icon" type="image/x-icon" href="/favicon.ico">
    <link rel="shortcut icon" href="/favicon.ico" type="image/x-icon" />
    <link rel="bookmark" href="/favicon.ico" type="image/x-icon" />-->
    <link href="/css/Login.css" rel="stylesheet">
</head>
<body>
<div class="container">
    <div class="login_logo"></div>
    <div class="login_title">智能换热站管理系统</div>
     <form  class="form-horizontal">
                <fieldset>
    <div class="login_area">
        <div class="login_username">
            <input type="text" id="UserName" maxlength="20" placeholder="请输入账号">
            <i></i>
        </div>
        <div class="login_password">
            <input type="password" id="Password" maxlength="30" placeholder="请输入密码">
            <i></i>
        </div>
        <div id="errMsg" style="color:#ff0000; margin-top: 10px; height: 22px;"></div>
        <input type="checkbox" id="RememberMe" checked="checked" style="display: none">

    </div>
  </fieldset>
  <div align="center">
   <button id="LoginButton" type="submit">登 录</button>
   </div>
            </form>

<#--<div id="LoginArea" class="row">
    <div class="col-lg-12">
        <div class="well bs-component">
            <form  class="form-horizontal">
            <fieldset>
                <legend><h2>智能换热站管理系统</h2></legend>
                <div class="form-group">
                    <div class="col-lg-12">
                        <input type="text" class="form-control" id="UserName" placeholder="请输入账号" required maxlength="200">
                    </div>
                </div>

                <div class="form-group">
                    <div class="col-lg-12">
                        <input type="password" class="form-control" id="Password" placeholder="请输入密码" required maxlength="300">
                        <div class="checkbox"  style="text-align:left;">
                            <label>
                                <input type="checkbox" id="RememberMe">
                                <span class="ripple"></span>
                                <span class="check"></span> 记住
                            </label>
                        </div>
                        <div id="errMsg" style="color:#ff0000;"></div>
                    </div>
                </div>

                <input id="ReturnUrlHash" type="hidden" name="returnUrlHash" />

                <div class="form-group">
                    <div class="col-lg-12">
                        <button id="LoginButton" type="submit" class="btn btn-primary"><i class="fa fa-sign-in"></i>登 录</button>
                    </div>
                </div>
            </fieldset>
            </form>
            <input type="hidden" name="returnUrl" value="" />
        </div>
    </div>
</div>-->
</div>
<script src="/js/jquery.min.js" type="text/javascript"></script>
<script src="/js/Login.js" type="text/javascript"></script>
</body>
</html>