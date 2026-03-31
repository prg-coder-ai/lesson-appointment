<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>换热站管理</title>
    <#include "../shared/cssFile.ftl" />
</head>
  <#if showAll !="0" >
    <body class="nav-md">
        <div class="container body">
        <div class="main_container">
        <#include "../shared/topBar.ftl" />
        <#include "../shared/leftMenu.ftl" />
    <#else>
        <body >
      </#if>
      <script>
      var bid = ${companyID}　
      </script>
        <div class="right_col" role="main">
            <div id="content">
                <div id="content-header">
                    <div id="breadcrumb"> <a href="#" title="Go to Home" class="tip-bottom"><i class="icon-home"></i> Home</a> <a class="current" href="#">换热站管理</a></div>
                </div>
                <hr />
                <div class="container-fluid">
                    <form id="search_form" class="form-inline" style="margin-bottom: 10px;">
                        <div class="form-group">
                            <label>关键字查询：</label>
                             <input type="hidden" class="form-control"  hidden name="bindCompanyID" placeholder= "公司编号" value =${companyID}>　
                            <input type="text" class="form-control" name="searchName" placeholder="换热站名">　
                        </div>
                        <div class="form-group">
                            <select id="searchCompanyID" name="searchCompanyID" class="form-control">
                                <option value="-1">--请选择公司--</option>
                            </select>　
                        </div>
                        <button id="search" type="button" class="btn btn-primary">
                            <span class="glyphicon glyphicon-search" aria-hidden="true"></span> 检索
                        </button>
                    </form>
                    <div id="maingrid" style="margin:0; padding:0"></div>

                    <!--html代码区域-->
                    <div class="modal fade"  id="CreateModal" tabindex="-1" role="dialog" aria-labelledby="新建/编辑换热站" data-backdrop="static">
                        <div class="modal-dialog" style="width:600px;">
                            <div class="modal-content">
                                <div class="modal-header">
                                    <button type="button" class="close" data-dismiss="modal" aria-hidden="true">&times;</button>
                                    <h4 class="modal-title" id="myModalLabel">换热站</h4>
                                </div>
                                <form name="productInformationsForm" role="form" novalidate class="form-validation">
                                    <div class="modal-body">
                                        <input type="hidden" name="id" value="0" />

                                        <div class="form-group form-md-line-input form-md-floating-label">
                                              <label>换热站名<span class="required">  </span></label>
                                              <input style="width:230px; display: inline;" class="form-control" type="text" name="name" value="" required  maxlength="50" placeholder="请输入换热站名" />
                                            <span id="nameError" class="errorMessage"></span>
                                        </div>

                                        <div class="form-group form-md-line-input form-md-floating-label">
                                              <label>所属分公司<span class="required">  </span></label>
                                            <select id="companyID" name="companyID" class="form-control">
                                            </select>
                                        </div>
                                        <div class="form-group form-md-line-input form-md-floating-label">
                                            <label>所属中心站<span class="required">  </span></label>
                                            <select id="parentID" name="parentID" class="form-control">
                                            </select>
                                        </div>

                                        <div class="form-group form-md-line-input form-md-floating-label">
                                              <label>经度<span class="required">  </span></label>
                                              <input style="width:230px; display: inline;" class="form-control" type="text" name="longi" value="" required maxlength="50" />
                                        </div>
                                        <div class="form-group form-md-line-input form-md-floating-label">
                                            <label>纬度<span class="required">  </span></label>
                                            <input style="width:230px; display: inline;" class="form-control" type="text" name="lati" value="" required maxlength="50" />
                                        </div>
                                        <div class="form-group form-md-line-input form-md-floating-label">
                                              <label>高度<span class="required">  </span></label>
                                              <input style="width:230px; display: inline;" class="form-control" type="text" name="height" value="" required maxlength="50" />
                                        </div>
                                         <div class="form-group form-md-line-input form-md-floating-label">
                                            <label>说明<span class="required">  </span></label>
                                           <input style="width:230px; display: inline;" class="form-control" type="text" name="note1" value="" required maxlength="50" />
                                          </div>
                                      <div class="form-group form-md-line-input form-md-floating-label">
                                        <label><span class="required">  </span></label>
                                           <input style="width:230px; display: inline;" class="form-control" type="text" name="note2" value="" required maxlength="50" />
                                          </div>
                                           <div class="form-group form-md-line-input form-md-floating-label">
                                           <label>供热面积<span class="required">  </span></label>
                                         <input style="width:230px; display: inline;" class="form-control" type="text" name="heatingArea" value="" required maxlength="50" />
                                           </div>

                                    </div>
                                    <div class="modal-footer">
                                        <button type="button" class="btn btn-default" data-dismiss="modal">取消</button>
                                        <button type="button" class="btn btn-primary blue submit"><i class="fa fa-save"></i>
                                        <span>保存</span></button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
         <#if showAll !="0" >
        <#include "../shared/footer.ftl" />
    </div>
    </div>
    </#if>

<#include "../shared/footerScript.ftl" />
<script src="/js/bootstrap-maxlength.min.js"></script>
<script src="/js/app.js"></script>
<script src="/js/bussiness/heatexchangestationManage.js"  type="text/javascript"></script>
</body>
</html>
