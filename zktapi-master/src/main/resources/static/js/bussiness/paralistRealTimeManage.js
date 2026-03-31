//实时参数管理
var maingrid;
var _$modal;
var _$form;
var stationJson = '';
var stationCodeJson=  '';
var unitJson = '';
var communityJson = '';

var recordCount=1000000;//数据总记录数
var unitID =0 ;//机组ID --from heatExchangerUnit id
var subID = 0;//机组在换热站的序号--rtustation-number/paralist.subID
//BD2020
(function () {
    $(function () {

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
                 {display: '编号', name: 'id', width: 90    ,render:function(rowData){
                                      return rowData.id==0?"-":rowData.id;
                                                                             }   },
                 {display: '远传注册码', name: 'stationCode', width: 90},
                 {display: '机组', name: 'subID', width: 65,render:function(rowData){
                     return rowData.subID==0?"-":rowData.subID;
                     }},
                 {display: '接收时间', name: 'addTime', width: 145, render: function (rowData) {
                         return rowData.addTime == null ? "-" : new Date(rowData.addTime).format('Y-m-d H:i:s');
                     }
                 },
                  {display: '计数', name: 'FrameCounter', width: 50 ,render:function(rowData){
                    return  rowData.frameCounter== null  ?"-":rowData.frameCounter;
                      }
                         },
            {display: '状态', name: 'p4001', width: 60,render:function(rowData){
                          return rowData.ar_RUN == null?'-':rowData.ar_RUN==0?"停止":"启动";      }},
            {display: '调节阀模式', name: 'p4002', width: 60,render:function(rowData){
                                          return rowData.ar_MOD11 == null?'-':rowData.ar_MOD11==0?"定开":"定温"; }
                                          },
                        {display: '定开度', name: 'p4003', width: 60,render:function(rowData){
                                           return rowData.ar_OPEN == null?'-': ""+rowData.ar_OPEN  ;      }
                                           },
                         {display: '定温度', name: 'p4004', width: 60,render:function(rowData){
                               return rowData.ar_TMP11 == null?'-': ""+rowData.ar_TMP11  ;      }
                                                                          },
                        {display: '循环泵模式', name: 'p4005', width: 60,render:function(rowData){
                                        return  rowData.ar_MOD21 == null?'-':rowData.ar_MOD21==0?"定频":"定温差";      }
                                        },
                        {display: '循环泵定频', name: 'p4006', width: 60,render:function(rowData){
                                     return rowData.ar_HZ21 == null?'-':""+rowData.ar_HZ21;      }
                                     },
                        {display: '循环泵定压', name: 'p4007', width: 60,render:function(rowData){
                                 return  rowData.ar_PT21 == null?'-':""+rowData.ar_PT21 ;      }
                                 },
                          {display: '补水泵定压', name: 'p4009', width: 60,render:function(rowData){
                                           return  rowData.ar_PT31 == null?'-':""+rowData.ar_PT31 ;      }
                                           },
                         {display: '一次供温', name: 'p4011', width: 60,render:function(rowData){
                                              return  rowData.ai_TT11 == null?'-':""+rowData.ai_TT11 ;      }
                                              },
                              {display: '一次回温', name: 'p4012', width: 60 ,render:function(rowData){
                                    return  rowData.ai_TT12 == null?'-':""+rowData.ai_TT12 ;      }
                                    },
                                {display: '二次供温', name: 'p4013', width: 60    ,render:function(rowData){
                                            return  rowData.ai_TT21 == null?'-':""+rowData.ai_TT21 ;      }
                                            },
                                 {display: '二次回温', name: 'p4014', width: 60  ,render:function(rowData){
                                          return  rowData.ai_TT22 == null?'-':""+rowData.ai_TT22 ;      }
                                          },
                                {display: '一次供压', name: 'p4015', width: 60 ,render:function(rowData){
                                        return  rowData.ai_PT11 == null?'-':""+rowData.ai_PT11 ;      }
                                },
                                {display: '一次回压', name: 'p4016', width: 60 ,render:function(rowData){
                                        return  rowData.ai_PT12 == null?'-':""+rowData.ai_PT12 ;      }
                                        },
                                {display: '二次供压', name: 'p4017', width: 60,render:function(rowData){
                                       return  rowData.ai_PT21 == null?'-':""+rowData.ai_PT21 ;      }
                                       },
                                {display: '二次回压', name: 'p4018', width: 60 ,render:function(rowData){
                                        return  rowData.ai_PT22 == null?'-':""+rowData.ai_PT22 ;      }
                                        },
                                {display: '调节阀开度', name: 'p4021', width: 60,render:function(rowData){
                                       return  rowData.ai_OPEN == null?'-':""+rowData.ai_OPEN ;      }
                                        },

                                    {display: '循环泵频率', name: 'p4023', width: 60 ,render:function(rowData){
                                            return  rowData.ai_HZ21 == null?'-':""+rowData.ai_HZ11 ;      }
                                            },

                                    {display: '补水泵频率', name: 'p4026', width: 60   ,render:function(rowData){
                                              return  rowData.ai_HZ31 == null?'-':""+rowData.ai_HZ31 ;      }
                                              },

                                    {display: '水箱液位', name: 'p4029', width: 60 ,render:function(rowData){
                                              return  rowData.ai_LEVEL == null?'-':""+rowData.ai_LEVEL ;      }
                                              },
                             {
                                display: '查看', name: 'stationCode', width: 120, render: function (rowData) {
                                     return '<a class="custom-a-style" href="javascript:void(0);" alt="点击查看温度" onclick="showTemp('+ rowData.stationCode +',\''+rowData.id+ '\')">查看温度数据</a><br/>'+
                                   '<a class="custom-a-style" href="javascript:void(0);" alt="点击查看温度曲线" onclick="showTempInChart('+ rowData.stationCode +',\''+rowData.id+ '\')">查看温度曲线</a>';
                                    }
                             }

             ];


         var _stationService = app.createService('heatexchangestation');
                _stationService.getAll({}, {"page": 1, "pagesize": 999}, function (data) {
                    stationJson = data;
                });

         var _unitService = app.createService('heatexchangerunit');
                _unitService.getAll({}, {"page": 1, "pagesize": 998}, function (data) {
                    unitJson = data;
                });

        var _stationCodeService = app.createService('rtustation');
             _stationCodeService.getAll({}, {"page": 1, "pagesize": 999}, function (data) {
                 stationCodeJson = data;
             });

        loadGrid();

        function loadGrid() {
            var params=$('#search_form').serializeArray();
             for(var i in params)
                    {
                        if(params[i].name=="searchMinDate")
                        {
                            var val=params[i].value;
                            if(val)
                            {
                                var date=new Date(val);
                                if(date){params[i].value=date.getTime();}
                            }
                            else
                            {
                                params[i].value=-1;
                            }
                        }
                        if(params[i].name=="searchMaxDate")
                        {
                            var val=params[i].value;
                            if(val)
                            {
                                var date=new Date(val);
                                if(date){params[i].value=date.getTime();}
                            }
                            else
                            {
                                params[i].value=-1;
                            }
                        }

                    }
            maingrid = $("#maingrid").ligerGrid({
                columns: col,
                dataAction: 'server',
                url: "/admin/paralist/getPaging",//从服务端加载数据
                parms: $('#search_form').serializeArray(),//这里是关键，传递搜索条件的参数  serializeArray是jquery自带的吧form转json传递的方法
                checkbox: false,
                rownumbers: true,
                pageSize: 20,
                usePager: true,
                width: '99%',
                height: '98%',
                fixedCellHeight: false,
                //toolbar: PostToolbarOptions,
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

        //绑定公司
        bindCompany();
        $("#searchCompanyID").change(function () {
            bindStation("searchCompanyID", "searchStationID");
            bindStationCode();
        });

        //绑定换热机组和小区
        $("#searchStationID").change(function () {
            bindHeatExchangeUnit("searchStationID", "searchSubID");
        });


    });

})();


function bindCompany() {
    //绑定分公司{"searchParentID": -2
    var _companyService = app.createService('company');
    _companyService.getAll({}, {"page": 1, "pagesize": 20}, function (data) {
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

function bindStation(companyIDStr, stationIDStr) {
    //绑定换热站
    $("#" + stationIDStr).empty();
    $("#" + stationIDStr).append("<option value=\"-1\">--请选择换热站--</option>");

    var companyId = $("#" + companyIDStr).val();
    if (parseInt(companyId) > 0 && stationJson != '') {
        var parentStation = JSON.parse(stationJson);
        if (parentStation.Rows.length > 0) {
            for (var i = 0; i < parentStation.Rows.length; i++) {
                if (parentStation.Rows[i].companyID == companyId && parentStation.Rows[i].status == 1)
                    $("#" + stationIDStr).append("<option value='" + parentStation.Rows[i].id + "'>" + parentStation.Rows[i].name + "</option>");
            }
        }
    }
}
function bindStationCode(companyIDStr, stationIDStr) {
    //绑定换热站
    $("#searchDeviceSN").empty();
    $("#searchDeviceSN" ).append("<option value=\"-1\">--请选择换热站注册码--</option>");

    var companyId = $("#searchCompanyID").val();
    if (parseInt(companyId) > 0 && stationCodeJson != '') {
        var parentStationC = JSON.parse(stationCodeJson);
        if (parentStationC.Rows.length > 0) {
            for (var i = 0; i < parentStationC.Rows.length; i++) {
                if (parentStationC.Rows[i].companyID == companyId && parentStationC.Rows[i].status == 1)
                    $("#searchDeviceSN" ).append("<option value='" + parentStationC.Rows[i].DeviceSN + "'>" + parentStationC.Rows[i].DeviceSN + "</option>");
            }
        }
    }
}

function bindHeatExchangeUnit(stationIDStr, heatExchangerUnitIDStr) {
    //绑定换热机组
    $("#" + heatExchangerUnitIDStr).empty();
    $("#" + heatExchangerUnitIDStr).append("<option value=\"-1\">--请选择换热机组--</option>");

    var stationID = $("#" + stationIDStr).val();
    if (parseInt(stationID) > 0 && unitJson != '') {
        var parentUnit = JSON.parse(unitJson);
        if (parentUnit.Rows.length > 0) {
           var cnt = 0
            for (var i = 0; i < parentUnit.Rows.length; i++) {
                if (parentUnit.Rows[i].stationID == stationID)
                   { $("#" + heatExchangerUnitIDStr).append("<option value='" +(cnt +1)+ "'>" + parentUnit.Rows[i].unitNumber + "</option>");
                      cnt =cnt +1 ;
                   }
            }
        }
    }
}


//TBD --补充按照参数名称进行
function showTemp(stationID,subId,paraIdx) {
    var subGrid=  $("#templGrid").ligerGrid({
        columns: [
            {display: '参数', name: 'para', width: 200},
            /*{display: '设备温度', name: 'temp2', width: 80},*/
            //{display: '信号强度', name: 'level', width: 80},
            {
                display: '采集时间', name: 'addTime', width: 270, render: function (rowData) {
                    return rowData.addTime == null ? "" : new Date(rowData.addTime).format('Y-m-d H:i:s');
                }
            }
        ],
        dataAction: 'server',
        url: "/admin/paralist/getpaging",//从服务端加载数据
        parms: {stationID:stationID,subID: subID, paraIdx: paraIdx,minDate:0,maxDate:0},
        //page: 1,
        checkbox: false,
        rownumbers: true,
        pageSize: 20,
        usePager: true,
        width: '98%',
        height: '80%'
    });
    subGrid.changePage('first');
    $("#ParaChartModal").html('历史数据(参数编号：<a title="在[历史参数管理]中查看" href="/admin/paralist/realTimelist?stationID='+stationID+"&subID="+subID+"&paraIdx="+paraIdx+'">' +"查看历史数据"+ '</a>)');
    $('#ParaChartModal').modal("show");
}



