//换热站逻辑
var maingrid;
var stationJson = '';
var bid =0;
(function () {
    $(function () {
     user_info = getLoginUser() ;
     if(user_info)
            bid=  user_info["companyID"];
            //console .logg("station--:");
            //console .logg(bid);
          //  console.log(user_info);
            /*获取登录用户信息*/
            function getLoginUser() {
             var userStr = localStorage.getItem('loginUser');
             var user = JSON.parse(userStr);
             return user;
            }

        toastr.options.positionClass = 'toast-center-center';
        var _modelService = app.createService('heatexchangestation');
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
            {display: '换热站名', name: 'name', width: 200},
            {display: '所属公司', name: 'companyName', width: 250},
            {display: '所属中心站', name: 'parentName', width: 250},

            {display: '供热面积', name: 'heatingArea', width: 100},
            {display: '说明', name: 'note', width: 230,render:function(rowData){
                     return rowData.note1 + rowData.note2 ;      }},
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
            maingrid = $("#maingrid").ligerGrid({
                columns: col,
                dataAction: 'server',
                url: "/admin/heatexchangestation/getPaging",//从服务端加载数据
                parms: $('#search_form').serializeArray(),//这里是关键，传递搜索条件的参数  serializeArray是jquery自带的吧form转json传递的方法
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
                    _$modal.find("#myModalLabel").html("新建换热站");
                    _$modal.find("input[name='id']").val(0);
                    _$modal.find("input[name='name']").val('');
                    _$modal.find("input[name='lati']").val('0');
                    _$modal.find("input[name='longi']").val('0');
                    _$modal.find("input[name='height']").val('0');
                    _$modal.find("select[name='parentID']").val('0');

                      _$modal.find("input[name='note1']").val('0');
                       _$modal.find("input[name='note2']").val('0');
                       _$modal.find("input[name='heatingArea']").val('0');

                    break;
                case "修改":
                    var selected = maingrid.getSelecteds();
                    if (selected.length != 1) {
                        toastr.warning('请选择一条数据!');
                        return;
                    }
                    _$modal.find("#myModalLabel").html("编辑换热站");
                    _$modal.find("input[name='id']").val(selected[0].id);
                    _$modal.find("input[name='name']").val(selected[0].name);
                    _$modal.find("select[name='companyID']").val(selected[0].companyID);
                    bindParentStation();
                    _$modal.find("select[name='parentID']").val(selected[0].parentID);
                    _$modal.find("input[name='lati']").val(selected[0].lati);
                    _$modal.find("input[name='longi']").val(selected[0].longi);
                    _$modal.find("input[name='height']").val(selected[0].height);

                       _$modal.find("input[name='note1']").val(selected[0].note1);
                          _$modal.find("input[name='note2']").val(selected[0].note2);
                             _$modal.find("input[name='heatingArea']").val(selected[0].heatingArea);
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
                        _modelService.delete({
                                id: selected[0].id
                            },
                            function (data) {
                                maingrid.loadData();
                            },
                            function (error) {

                            });
                    }
                    break;
            }
        }

        _$modal.find("input[name='name']").blur(function () {
            checkName();
        })

        $("#companyID").change(function () {
            checkName();
        });

        //检查站名
        function checkName() {
            $('#nameError').html("");
            if ($.trim(_$modal.find("input[name='name']").val()) != '') {
                _modelService.getByName({
                        name: $.trim(_$modal.find("input[name='name']").val()),
                        companyID: _$modal.find("select[name='companyID']").val()
                    },
                    {id: _$modal.find("input[name='id']").val()}, function (data) {
                        if (data.data.result == 0) {
                            $('#nameError').html(data.data.message);
                        }
                    })
            }
        }

        //绑定分公司
        bindParentCompany();
        //绑定总换热站
        bindParentStation();

        //表单验证
        formValidator();

        function formValidator() {
            _$form.bootstrapValidator({
                message: 'This value is not valid',
                fields: {
                    name: {
                        message: '换热站名验证失败',
                        validators: {
                            notEmpty: {
                                message: '换热站名不能为空'
                            }
                        }
                    },
                    companyID: {
                        message: '公司验证失败!',
                        validators: {
                            notEmpty: {
                                message: '公司不能为空'
                            },
                            callback: {
                                message: '请选择公司',
                                callback: function (value, validator) {
                                    if (value == -1) {
                                        return false;
                                    } else {
                                        return true;
                                    }
                                }
                            }
                        }
                    },
                    lati: {
                        validators: {
                            notEmpty: {
                                message: '纬度不能为空　'
                            }
                        }
                    },
                    longi: {
                        validators: {
                            notEmpty: {
                                message: '经度不能为空'
                            }
                        }
                    },
                    height: {
                        validators: {
                            notEmpty: {
                                message: '高度不能为空'
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
            if (model.id == 0) {
                model.createrID = getLoginUser().id;
                _modelService.create(model, function (data) {
                    if (data.data.result == 1) {
                        _$modal.modal('hide');
                        maingrid.loadData();
                    }
                    else {
                        $('#nameError').html(data.data.message);
                    }
                })
            }
            else {
                _modelService.update(
                    model, function (data) {
                        if (data.data.result == 1) {
                            _$modal.modal('hide');
                            maingrid.loadData();
                        }
                        else {
                            $('#nameError').html(data.data.message);
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

        var _stationService = app.createService('heatexchangestation');
        _stationService.getAll({"parentID": 0}, {"page": 1, "pagesize": 9999}, function (data) {
            stationJson = data;
        });

        function bindParentCompany() {
            $("#companyID").empty();
            $("#companyID").append("<option value=\"-1\">--请选择公司--</option>");
            $("#searchCompanyID").empty();
            $("#searchCompanyID").append("<option value=\"-1\">--请选择公司--</option>");
            var _companyService = app.createService('company');
            _companyService.getAll({}, {"page": 1, "pagesize": 9999}, function (data) {
                var parentCompany = JSON.parse(data);
                if (parentCompany.Rows.length > 0) {
                    for (var i = 0; i < parentCompany.Rows.length; i++) {
                        if (parentCompany.Rows[i].status == 1)
                                   if((bid == -1)
                                   ||   (parentCompany.Rows[i].id == bid)
                                     ||(parentCompany.Rows[i].parentID == bid)
                                       )
                        {
                            $("#companyID").append("<option value='" + parentCompany.Rows[i].id + "'>" + parentCompany.Rows[i].name + "</option>");
                            $("#searchCompanyID").append("<option value='" + parentCompany.Rows[i].id + "'>" + parentCompany.Rows[i].name + "</option>");
                        }
                    }
                }
            });
        }

        $("#companyID").change(function () {
            bindParentStation();
        });

        function bindParentStation() {
            //绑定换热站
            $("#parentID").empty();
            $("#parentID").append("<option value=\"0\">--无--</option>");

            var companyId = $("#companyID").val();
            if (parseInt(companyId) > 0 && stationJson != '') {
                var parentStation = JSON.parse(stationJson);
                if (parentStation.Rows.length > 0) {
                    for (var i = 0; i < parentStation.Rows.length; i++) {
                        if (parentStation.Rows[i].companyID == companyId && parentStation.Rows[i].status == 1)
                            $("#parentID").append("<option value='" + parentStation.Rows[i].id + "'>"
                            + parentStation.Rows[i].name + "</option>");
                    }
                }
            }
        }
    });
})();