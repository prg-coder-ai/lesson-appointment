<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>设备安装记录导出</title>
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
                    <div id="breadcrumb"><a href="#" title="Go to Home" class="tip-bottom"><i class="icon-home"></i>
                        Home</a> <a class="current" href="#">设备安装记录导出</a></div>
                </div>
                <hr/>
                <div class="container-fluid">
                    <form id="search_form" class="form-inline" style="margin-bottom: 10px;">
                        <div>
                            <div class="form-group">
                                <label>请选择：</label>

                            </div>
                            <div class="form-group">
                                <select id="searchCompanyID" name="searchCompanyID" class="form-control">
                                    <option value="-1">--请选择公司--</option>
                                </select>　
                            </div>
                            <div class="form-group">
                                <label>请选择日期：</label>
                            </div>
                            <div class="form-group">
                                <input type="text" style="width:120px;" class="form-control" name="searchStartDate"
                                       placeholder="开始日期">
                            </div>
                            <div class="form-group">
                                ~
                                </div>
                            <div class="form-group">
                                <input type="text" style="width:120px;" class="form-control" name="searchEndDate"
                                       placeholder="结束日期">
                            </div>
                            <button id="search" type="button" class="btn btn-primary" style="margin-left: 50px;">
                                <span class="glyphicon glyphicon-search" aria-hidden="true"></span> 导出
                            </button>
                        </div>
                    </form>

                </div>
            </div>
        </div>
        <#include "../shared/footer.ftl" />
    </div>
</div>
<#include "../shared/footerScript.ftl" />
<script src="/js/bootstrap-maxlength.min.js"></script>
<script src="/js/app.js"></script>
<script src="LigerUI.lib/ligerUI/js/plugins/ligerDateEditor.js" type="text/javascript"></script>
<script src="/js/bussiness/deviceInstallExcelManage.js" type="text/javascript"></script>
</body>
</html>
