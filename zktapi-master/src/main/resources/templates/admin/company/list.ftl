<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>热力公司管理</title>
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


        <div class="right_col" role="main">
            <div id="content">
                <div id="content-header">
                    <div id="breadcrumb"><a href="#" title="Go to Home" class="tip-bottom"><i class="icon-home"></i>
                        Home</a> <a class="current" href="#">热力公司管理</a></div>
                </div>
                <hr/>
                <div class="container-fluid">
                    <form id="search_form" class="form-inline" style="margin-bottom: 10px;">
                        <div class="form-group">
                            <label>关键字查询：</label>
                             <input  type="hidden"   class="form-control"  name="bindCompanyID"
                             id="bindCompanyID"    placeholder= "公司编号"    value =${bid!0} >　
                             <input type="text" class="form-control"  name="searchCompanyName" id="searchCompanyName"
                             placeholder="公司名称">　
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
                    <div class="modal fade" id="CreateModal" tabindex="-1" role="dialog" aria-labelledby="新建/编辑热力公司"
                         data-backdrop="static">
                        <div class="modal-dialog" style="width:600px;">
                            <div class="modal-content">
                                <div class="modal-header">
                                    <button type="button" class="close" data-dismiss="modal" aria-hidden="true">
                                        &times;
                                    </button>
                                    <h4 class="modal-title" id="myModalLabel">热力公司</h4>
                                </div>
                                <form name="productInformationsForm" role="form" novalidate class="form-validation">
                                    <div class="modal-body">
                                        <input type="hidden" name="id" value="0"/>
                                        <div class="form-group form-md-line-input form-md-floating-label">
                                            <label>公司名称<span class="required">  </span></label>
                                            <input style="width:230px; display: inline;" class="form-control"
                                                   type="text" name="name" value="" required maxlength="500"
                                                   placeholder="请输入公司名称"/>
                                            <span id="nameError" class="errorMessage"></span>
                                        </div>
                                        <div class="form-group form-md-line-input form-md-floating-label">
                                            <label>公司地址<span class="required">  </span></label>
                                            <input style="width:230px; display: inline;" class="form-control"
                                                   type="text" name="address" value="" required maxlength="500"
                                                   placeholder="请输入公司地址"/>
                                        </div>
                                        <div class="form-group form-md-line-input form-md-floating-label">
                                            <label>联系人<span class="required">  </span></label>
                                            <input style="width:230px; display: inline;" class="form-control"
                                                   type="text" name="contact" value="" required maxlength="500"
                                                   placeholder="请输入联系人"/>
                                        </div>
                                        <div class="form-group form-md-line-input form-md-floating-label">
                                            <label>联系方式<span class="required">  </span></label>
                                            <input style="width:230px; display: inline;" class="form-control"
                                                   type="text" name="contactWay" value="" required maxlength="500"
                                                   placeholder="请输入联系方式"/>
                                        </div>
                                        <div class="form-group form-md-line-input form-md-floating-label">
                                            <label>父公司<span class="required">  </span></label>
                                            <select id="parentID" name="parentID" class="form-control">
                                                <option value="0">无</option>

                                            </select>
                                        </div>
                                       <#-- <div class="form-group form-md-line-input form-md-floating-label">
                                            <label>状态<span class="required">  </span></label>
                                            <select class="form-control" name="status">
                                                <option value="1">正常</option>
                                                <option value="2">停用</option>
                                                <option value="3">删除</option>
                                            </select>
                                        </div>-->
                                    </div>
                                    <div class="modal-footer">
                                        <button type="button" class="btn btn-default" data-dismiss="modal">取消</button>
                                        <button type="button" class="btn btn-primary blue submit"><i
                                                class="fa fa-save"></i> <span>保存</span></button>
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
<script src="/js/bussiness/CompanyServiceImpl4web.js" type="text/javascript"></script>
<script src="/js/bussiness/companyManage.js" type="text/javascript"></script>
</body>
</html>
