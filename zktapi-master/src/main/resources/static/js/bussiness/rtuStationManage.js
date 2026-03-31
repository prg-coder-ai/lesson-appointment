//RtuStation逻辑
var maingrid;
var _$modal;
var _$form;
var RtuStationJson = '';
var StationJson='';
var companyJson='';

(function () {
    $(function () {
        var _modelService = app.createService('rtustation');
        _$modal = $('#CreateModal');
        _$form = _$modal.find('form');

        //设置提示框的样式
        toastr.options.positionClass = 'toast-center-center';
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
            {display: '换热站名称', name: 'stationName', width: 100},
            {display: '换热站注册码', name: 'stationCode', width: 150},
            {display: '机组个数', name: 'number', width: 150},
            {display: '备注', name: 'mem', width: 150}

        ];

        var barcol = [
           // {text: "添加", click: PostToolbarBtnItemClick, icon: 'add'},
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
                url: "/admin/rtustation/getPaging",//从服务端加载数据
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

//DO2020:通过选择公司、换热站，获取基本数据，填写Code注册码，查询机组个数
        function PostToolbarBtnItemClick(item) {
         var selected = maingrid.getSelecteds();
            switch (item.text) {
                case "添加"://先选择id为null的行,实际为修改
                    if (selected.length != 1) {
                      toastr.warning('请选择一条数据进行修改!');
                        return;
                         }
                    if (selected[0].stationID != -1)
                         {   toastr.warning('请选择一条空数据!');
                                                 return;
                                                  }
                        _$modal.find("input[name='stationID']").val(selected[0].stationID);
                        _$modal.find("input[name='stationName']").val(selected[0].stationName);
                        _$modal.find("input[name='stationCode']").val(selected[0].stationCode);
                        _$modal.find("input[name='number']").val(selected[0].number);
                        _$modal.find("input[name='mem']").val(selected[0].mem);
                        _$modal.find("input[name='modifyDate']").val(Date());
                         _$modal.find("input[name='dataValid']").val(1);
                          _$modal.modal("show");
                      break;
                case "修改":

                    if (selected.length != 1) {
                        toastr.warning('请选择一条数据!');
                        return;
                    }
                    if(selected[0].id !=0)
                    {
                    _$modal.find("input[name='id']").val(selected[0].id);
                   _$modal.find("input[name='stationID']").val(selected[0].stationID);
                   _$modal.find("input[name='stationName']").val(selected[0].stationName);
                    _$modal.find("input[name='stationCode']").val(selected[0].stationCode);
                    _$modal.find("input[name='number']").val(selected[0].number);
                     _$modal.find("input[name='mem']").val(selected[0].mem);
                     _$modal.modal("show");
                      }
                      //else
                       // { toastr.warning('请选择一条id为null的记录，然后选择添加!');
                        //  return;
                       // }

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

        //表单验证
        formValidator();

        function formValidator() {
            _$form.bootstrapValidator({
                message: 'This value is not valid',
                fields: {
                    name: {
                        message: '注册码验证失败',
                        validators: {
                            notEmpty: {
                                message: '注册码不能为空'
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
            var model = _$form.serializeFormToObject();
            //console .log(model);
            if (model.id <= 0) {

                 //console .log(JSON.stringify(model));
                 model.id =null;
                 _modelService.create(model, function (data) {
                     //console .log(JSON.stringify(data));
                    _$modal.modal('hide');
                    maingrid.loadData(); }
                );

            }
            else {
                _modelService.update(
                    model, function (data) {
                        _$modal.modal('hide');
                        maingrid.loadData();
                    }
                );
            }

        });

        _$modal.on('hidden.bs.modal', function () {
            _$form.data('bootstrapValidator').destroy();
            _$form.data('bootstrapValidator', null);
            formValidator();
        });

         var _stationService = app.createService('heatexchangestation');
                 _stationService.getAll({ }, { "page": 1, "pagesize": 9999}, function (data) {
                      StationJson = data;
                  });
//绑定分公司
        bindCompany();
//如何利用URL传来的数值 ？ "id":companyID, $("#bindCompanyID")  $("companyID") {{ }}"${companyID}"  ${RequestParameters.companyID}
        function bindCompany() {
            // console.log("bindCompany:");
             //console.log( $("#bindCompanyID"));
             //console.log( sss);
             //var bid= document.getElementById("bid").value
             $("#searchCompanyID").empty();
             $("#searchCompanyID").append("<option value=\"-1\">--选择公司--</option>");
             var _companyService = app.createService('company');
             _companyService.getAll({}, { "page": 1, "pagesize": 9999}, function (data) {
                 var parentCompany = JSON.parse(data);
                 if (parentCompany.Rows.length > 0) {
                     for (var i = 0; i < parentCompany.Rows.length; i++) {
                         if (parentCompany.Rows[i].status == 1)
                         if((bid == -1) ||
                            (parentCompany.Rows[i].id == bid)
                            ||(parentCompany.Rows[i].parentID == bid)
                              ) {
                              $("#searchCompanyID").append("<option value='" + parentCompany.Rows[i].id + "'>" + parentCompany.Rows[i].name + "</option>");
                         }
                     }
                 }
             });
         }

         $("#searchCompanyID").change(function () {
             bindCenterStation();
              // bindStation();
         });

        $("#searchCenterStationID").change(function () {
             bindStation();
         });

         function bindCenterStation() {
             //绑定中心换热站
             $("#searchCenterStationID").empty();
             $("#searchCenterStationID").append("<option value=\"0\">选择中心站</option>");

             var companyId = $("#searchCompanyID").val();
             if (parseInt(companyId) > 0 && StationJson != '') {
                 var parentStation = JSON.parse(StationJson);
                 if (parentStation.Rows.length > 0) {
                     for (var i = 0; i < parentStation.Rows.length; i++) {
                         if ( (parentStation.Rows[i].companyID == companyId)
                             && (parentStation.Rows[i].status == 1)
                             && (parentStation.Rows[i].parentID == 0)
                              )
                         $("#searchCenterStationID").append("<option value='" + parentStation.Rows[i].id + "'>"
                            + parentStation.Rows[i].name + "</option>");
                     }
                 }
             }else{
            $("#searchCenterStationID") .append("<option value='" + 0 + "'>"  +"CC"+companyId  +"," +  $("#bindCompanyID") +"end</option>");
                                    }
         }
         function bindStation() {
                      //绑定换热站
                      $("#searchStationID").empty();
                      $("#searchStationID").append("<option value=\"0\">选择换热站</option>");

                      var companyId = $("#searchCompanyID").val();
                      var centerStationID = $("#searchCenterStationID").val();
                      if (parseInt(companyId) > 0 && StationJson != '') {
                          var parentStation = JSON.parse(StationJson);
                          if (parentStation.Rows.length > 0) {
                              for (var i = 0; i < parentStation.Rows.length; i++) {
                                  if ( (parentStation.Rows[i].companyID == companyId) && ( parentStation.Rows[i].status == 1) &&
                                    ( ( parentStation.Rows[i].parentID == parseInt(centerStationID) ) //CenterStationID 选择的为中心站
                                      || (parentStation.Rows[i].id == parseInt(centerStationID) ) )  //CenterStationID 选择的为一般站
                                      )
                                      $("#searchStationID").append("<option value='" + parentStation.Rows[i].id + "'>"
                                       + parentStation.Rows[i].name + "</option>");
                                        }
                          }
                      } else{
                       $("#searchStationID").append("<option value='" + 0 + "'>"  +"RR"+companyId  +"," +  $("#bindCompanyID") +"end</option>");
                      }
                  }
/*
          function bindRtuStation() {
               //绑定换热站
               $("#rtuStationID").empty();
               $("#rtuStationID").append("<option value=\"0\">选择RTU注册码</option>");

               var stationID = $("#stationID").val();

               if (parseInt(stationID) > 0 && RtuStationJson != '') {
                   var parentStation = JSON.parse(RtuStationJson);
                   if (parentStation.Rows.length > 0) {
                       for (var i = 0; i < parentStation.Rows.length; i++) {
                           if (parentStation.Rows[i].stationID == parseInt(stationID)  )   //RTU的stationID = 所选择的换热站
                               $("#stationCode").append("<option value='" + parentStation.Rows[i].id + "'>" + parentStation.Rows[i].stationCode+ "</option>");
                       }
                   }
               }
           }*/
});
})();


