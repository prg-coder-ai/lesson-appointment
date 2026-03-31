<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>用户管理</title>
    <#include "../shared/cssFile.ftl" />
</head>
<body class="nav-md">
<div class="container body">
    <div class="main_container">
        <#include "../shared/topBar.ftl" />
        <#include "../shared/leftMenu.ftl" />
        <div class="right_col" role="main">
            <div id="content">

                <div id="content-header">
                    <div id="breadcrumb"> <a href="#" title="Go to Home" class="tip-bottom"><i class="icon-home"></i> Home</a> <a class="current" href="#">修改密码</a></div>
                    <#--<h1>修改密码</h1>-->
                </div>
                <hr />
                <div class="container-fluid">
                    <div class="row-fluid">
                        <div class="portlet-body" style="margin:10px 0;padding:10px 0;">
                            <div style="width:300px;margin:0 auto;">
                                <div style="text-align: center;"><h2>修改密码</h2></div>
                                <form  class="form-horizontal">

                                        <div class="form-group">
                                            <div class="col-lg-12">
                                                <input type="password" class="form-control" id="orgPassword" placeholder="原始密码" required maxlength="200">
                                            </div>
                                        </div>

                                        <div class="form-group">
                                            <div class="col-lg-12">
                                                <input type="password" class="form-control" id="newPassword" placeholder="新密码" required maxlength="300">

                                            </div>
                                        </div>

                                        <div class="form-group">
                                            <div class="col-lg-12">
                                                <input type="password" class="form-control" id="rePassword" placeholder="确认密码" required maxlength="300">
                                                <div id="errMsg" style="color:#ff0000;"></div>
                                            </div>
                                        </div>
                                        <div class="form-group">
                                            <div class="col-lg-12" style="text-align: center;">
                                                <button id="ChangePwdButton" type="submit" class="btn btn-primary"><i class="fa fa-sign-in"></i>修 改</button>
                                            </div>
                                        </div>

                                </form>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        <#include "../shared/footer.ftl" />
    </div>
</div>
<#include "../shared/footerScript.ftl" />
<script src="/js/bootstrap-maxlength.min.js"></script>
<script src="/js/app.js"></script>
</body>
</html>