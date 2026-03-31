var maingrid;
var companyID =0;// -公司ID
var bindCompanyID=0;
var companyName =""//公司名称
var bid =0;//公司ID-根据用户权限得到的用户所在公司ID

var user_info =0;
(function () {
    $(function () {
    var parentCompany ;
             console.log("user_info--:");

        user_info = getLoginUser() ;
          console.log(user_info);
        if(user_info)
           bid=  user_info["companyID"];
        console.log("company--:");
        console.log(bid);
        console.log(user_info);
      //  document.getElementById("bindCompanyID").innerHTML = String(bid)

        /*获取登录用户信息*/
        function getLoginUser() {
         var userStr = localStorage.getItem('loginUser');
         var user = JSON.parse(userStr);
         return user;
        }


        //设置提示框的样式
        toastr.options.positionClass = 'toast-center-center';
         var _modelService = app.createService('company');
        var _$modal = $('#CreateModal');
        var _$form = _$modal.find('form');

        //检索
        $("#search").click(function () {
            loadGrid();
            maingrid.changePage('first');
        });
        $("#search_form").keydown(function(e){
            if(e.keyCode==13)
            {
                e.stopPropagation();
                e.preventDefault();
                loadGrid();
                maingrid.changePage('first');
            }
        });
        var col = [
            {display: '编号', name: 'id', width: 80},
            {display: '公司名称', name: 'name',align:'left', width: 230},
            {display: '地址', name: 'address',align:'left', width: 250},
            {display: '联系人', name: 'contact', width: 80},
            {display: '联系方式', name: 'contactWay', width: 100},
            {
                display: '上级公司', name: 'parentCompanyName',align:'left', width: 230, render: function (rows) {
                    if (rows.parentCompanyName == '') {
                        return "无";
                    }
                    return rows.parentCompanyName;
                }
            },

        ];
        var barcol = [
            {text: "添加", click: PostToolbarBtnItemClick, icon: 'add'},
            {text: "修改", click: PostToolbarBtnItemClick, icon: 'edit'},
            {text: "删除", click: PostToolbarBtnItemClick, icon: 'delete'}
        ];
        PostToolbarOptions = {
            items: barcol,
        };
        loadGrid();

        function loadGrid() {
                  var sid = document.getElementById("searchCompanyID").value;
                  // document.getElementById("bindCompanyID").innerHTML= bid.toString()
                  var sname =  document.getElementById("searchCompanyName").value
                  var paras =[
                              {"name":"bindCompanyID","value":bid.toString()} ,
                              {"name":"searchCompanyName","value":sname},
                              {"name":"searchCompanyID","value":sid}
                               ] ;
            maingrid = $("#maingrid").ligerGrid({
                columns: col,
                dataAction: 'server',
                //url: "/admin/company/getPaging",//从服务端加载数据.toString()
                url: "/api/pgetCompanyList",
                // parms: $('#search_form').serializeArray(),//通过URL可控制，serializeArray是jquery自带的吧form转json传递的方法
                 parms:paras,
                checkbox: false,
                rownumbers: true,
                pageSize: 20,
                usePager: true,
                width: '99%',
                height: '98%',
                toolbar: PostToolbarOptions,
                onLoaded:function(grid){
                    //设置分页输入框的宽度
                    var manager = $("#maingrid").ligerGetGridManager();
                    var data = manager.getData();
                     /*console.log("step1 paras:")
                         console.log(paras)
                        console.log("Step2 search_form:");
                        console.log($('#search_form').serializeArray());
                        console.log(" data:");
                       console.log(manager.currentData);
                       console.log("---manager data");*/
                    var total=manager.currentData.Total*1;
                    var pageSize=manager.options.pageSize*1;
                    var size=parseInt((total/pageSize).toString()).toString().length;
                    $(".pcontrol input").css("width",size*15+"px").attr("maxLength",size);
                    manager.toggleLoading(false);//隐藏加载层
                }
            });
        }

      function PostToolbarBtnItemClick(item) {
            switch (item.text) {
                case "添加":
                    _$modal.modal("show");
                    _$modal.find("#myModalLabel").html("新建热力公司");
                    _$modal.find("input[name='id']").val('0');
                    _$modal.find("input[name='name']").val('');
                    _$modal.find("input[name='address']").val('');
                    _$modal.find("input[name='contact']").val('');
                    _$modal.find("input[name='contactWay']").val('');
                    _$modal.find("input[name='parentID']").val('0');
                    //_$modal.find("input[name='status']").val('0');
                    _$modal.find("input[name='createTime']").val(Date());
                    break;
                case "修改":
                    var selected = maingrid.getSelecteds();
                    if (selected.length != 1) {
                        toastr.warning('请选择一条数据!');
                        return;
                    }
                    _$modal.find("#myModalLabel").html("编辑热力公司");
                    _$modal.find("input[name='id']").val(selected[0].id);
                    _$modal.find("input[name='name']").val(selected[0].name);
                    _$modal.find("input[name='address']").val(selected[0].address);
                    _$modal.find("input[name='contact']").val(selected[0].contact);
                    _$modal.find("input[name='contactWay']").val(selected[0].contactWay);
                    _$modal.find("select[name='parentID']").val(selected[0].parentID);
                    //_$modal.find("select[name='status']").val(selected[0].status);
                    _$modal.modal("show");
                    break;
                case "查看":
                    break;
                case "删除":
                    var selected = maingrid.getSelecteds();
                    if (selected.length != 1) {
                        toastr.warning('请选择一条数据!');
                        return;
                    }

                    if (confirm('确定要删除该数据吗？')) {
                           // console.log("modelServiceDelete:");
                         _modelServiceDelete(
                               selected[0].id
                        //_modelService.delete({
                           //     id: selected[0].id
                          //  }
                          ,
                            function (data) {
                               // console.log(data);
                                maingrid.loadData();
                                bindParentCompany();
                            },
                            function (error) {

                            });
                    }
                    break;
            }
        }

        _$modal.find("input[name='name']").blur(function () {
            $('#nameError').html("");
            if ($.trim($(this).val()) != '') {
               _modelServiceGetByName({name: $.trim($(this).val())}, {id: _$modal.find("input[name='id']").val()},
               // _modelService.getByName({name: $.trim($(this).val())}, {id: _$modal.find("input[name='id']").val()},
                function (data) {
                     // console.log("getByName-ret:");
                     // console.log(data);
                    if (data.data.result == 0) {
                        $('#nameError').html(data.data.message);
                    }
                })
            }
        })

        //绑定总公司
        bindParentCompany();

        //表单验证
        formValidator();

        function formValidator() {
            _$form.bootstrapValidator({
                message: 'This value is not valid',
                fields: {
                    name: {
                        message: '公司名称验证失败',
                        validators: {
                            notEmpty: {
                                message: '公司名称不能为空'
                            }
                        }
                    },
                    address: {
                        validators: {
                            notEmpty: {
                                message: '公司地址不能为空　'
                            }
                        }
                    },
                    contact: {
                        validators: {
                            notEmpty: {
                                message: '联系人不能为空'
                            }
                        }
                    },
                    contactWay: {
                        validators: {
                            notEmpty: {
                                message: '联系方式不能为空'
                            }
                        }
                    }
                }
            });
        }

        //表单提交
        _$form.find('.submit').click(function (e) {
            e.preventDefault();
            _$form.data('bootstrapValidator').validate();
            if (!_$form.data('bootstrapValidator').isValid()) {
                return;
            }
            if ($.trim($('#nameError').html()) != "") {
                return;
            }
            var model = _$form.serializeFormToObject();
            //   console.log("model:");
             //  console.log(model);
            if (model.id == 0) {
                model.createrID = getLoginUser().id;
               _modelServiceCreate(model, function (data) {
                // _modelService.create(model, function (data) {
                             //  console.log("create:");
                              // console.log(data);
                    if (data.data.result == 1)
                     {
                        _$modal.modal('hide');
                        maingrid.loadData();
                        bindParentCompany();
                    }
                    else {
                        $('#nameError').html(data.error);
                    }
                })
            }
            else {
                _modelServiceUpdate(
                    model, function (data) {
                               //console.log("update3:");
                               //console.log(data);
                         if (data.data.result == 1) {
                            _$modal.modal('hide');
                            maingrid.loadData();
                        }
                        else {
                            $('#nameError').html(data.error );
                        }
                    }
                );
            }
        });

        _$modal.on('hidden.bs.modal', function () {
            _$form.data('bootstrapValidator').destroy();
            _$form.data('bootstrapValidator', null);
            $('#nameError').html("");
            formValidator();
        });

        function bindParentCompany() {
            //绑定查询下拉
            var _companyService = app.createService('company');
             _companyService.getAll({ }, {"page": 1, "pagesize": 20}, function (data) {
                 var parentCompany = JSON.parse(data);
                 if (parentCompany.Rows.length > 0) {
                     $("#searchCompanyID").empty();
                     $("#searchCompanyID").append("<option value=\"-1\">--请选择公司--</option>");

                     for (var i = 0; i < parentCompany.Rows.length; i++) {
                          if (parentCompany.Rows[i].status == 1)
                                     if((bid == -1)
                                     ||   (parentCompany.Rows[i].id == bid)
                                       ||(parentCompany.Rows[i].parentID == bid)
                                         )
                          {
                             $("#searchCompanyID").append("<option value='" + parentCompany.Rows[i].id + "'>" + parentCompany.Rows[i].name + "</option>");

                         }
                     }
                 }
             });
        }


   });
})();
