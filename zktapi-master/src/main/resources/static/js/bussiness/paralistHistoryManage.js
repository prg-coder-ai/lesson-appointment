//机组参数列表
var maingrid;
var stationJson = '';
var unitJson = '';
var StationID=-1 ; //换热站id
var unitIndex=-1;  //机组序号
var paraIndex =-1; //参数索引
var unitID =-1;
var companyId=-1;
var StationID =-1;
(function () {
    $(function () {


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
//大小写x无关。于Mapper/xm 配合使用-- 属性要首字母小写
//System.out.println(rowData);
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
                display: '查看', name: 'StationID', width: 60, render: function (rowData) {
                    return "<a class='custom-a-style' href='javascript:void(0);' alt='点击查看曲线' onclick='showTemp(" + rowData.stationID + ")'>查看参数曲线</a>";
                }
            }

        ];
        var _stationService = app.createService('heatexchangestation');
        _stationService.getAll({}, {"page": 1, "pagesize": 9999}, function (data) {
            stationJson = data;
        });

        var _unitService = app.createService('heatexchangerunit');
        _unitService.getAll({}, {"page": 1, "pagesize": 9999}, function (data) {
            unitJson = data;
        });
        loadGrid();

        //绑定分公司
        bindCompany();

        //绑定换热站
        $("#searchCompanyID").change(function () {
            bindStation();
        });
        //绑定机组
        $("#searchStationID").change(function () {
            bindUnit();
        });
        bindParaIdx();


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
                url: "/admin/paralist/history/getPaging",//从服务端加载数据
                parms:params ,//这里是关键，传递搜索条件的参数  serializeArray是jquery自带的吧form转json传递的方法
                checkbox: false,
                rownumbers: true,
                pageSize: 20,
                usePager: true,
                width: '99%',
                height: '98%',
                fixedCellHeight: false,
                onLoaded:function(grid){
                    //设置分页输入框的宽度
                    var manager = $("#maingrid").ligerGetGridManager();
                    var data = manager.getData();
                    var total=manager.currentData.Total*1;
                    var pageSize=manager.options.pageSize*1;
                    var size=parseInt((total/pageSize).toString()).toString().length;
                    $(".pcontrol input").css("width",size*10+"px").attr("maxLength",size);
                    manager.toggleLoading(false);//隐藏加载层
                }

            });

        }

//绑定分公司
      function bindCompany() {
            var _companyService = app.createService('company');
            _companyService.getAll({ }, {"page": 1, "pagesize": 20}, function (data) {
                var parentCompany = JSON.parse(data);
                if (parentCompany.Rows.length > 0)
                {
                    $("#searchCompanyID").empty();
                    $("#searchCompanyID").append("<option value=\"-1\">--请选择公司--</option>");
                    for (var i = 0; i < parentCompany.Rows.length; i++)
                   if (parentCompany.Rows[i].status == 1)
                              if((bid == -1)
                              ||   (parentCompany.Rows[i].id == bid)
                                ||(parentCompany.Rows[i].parentID == bid)
                                  )
                    {
                        $("#searchCompanyID").append("<option value='" + parentCompany.Rows[i].id + "'>" + parentCompany.Rows[i].name + "</option>");
                    }
                }
            });
        }

//绑定换热站
      function bindStation() {
            $("#searchStationID").empty();
            $("#searchStationID").append("<option value=\"-1\">--请选择换热站--</option>");
            StationID=-1;
            var companyId = $("#searchCompanyID").val();
            if (parseInt(companyId) > 0 && stationJson != '') {
                var parentStation = JSON.parse(stationJson);
                if (parentStation.Rows.length > 0) {
                    for (var i = 0; i < parentStation.Rows.length; i++) {
                        if (parentStation.Rows[i].companyID == companyId && parentStation.Rows[i].status == 1)
                            $("#searchStationID").append("<option value='" + parentStation.Rows[i].id + "'>" + parentStation.Rows[i].name + "</option>");
                    }
                }
            }
        }

//绑定机组
      function bindUnit() {
        $("#searchSubID").empty();
        $("#searchSubID").append("<option value=\"-1\">-- 请选择机组--</option>");

         StationID = $("#searchStationID").val();

            var _unitService = app.createService('heatexchangerunit');
                  _unitService.getAll({"stationID":StationID}, {"page": 1, "pagesize": 99}, function (data) {
                      unitJson = data;
                  });
        if (parseInt(StationID) >= 0 && unitJson != '') {
            var parentUnit = JSON.parse(unitJson );
             var cnt =1
             if (parentUnit.Rows.length > 0) {
                  for (var i = 0; i < parentUnit.Rows.length; i++) {
                   if (parentUnit.Rows[i].stationID == StationID) // && parentUnit.Rows[i].status == 1)
                     { $("#searchSubID").append("<option value='" +  cnt + "'>" + parentUnit.Rows[i].unitNumber + "</option>");
                        cnt++;
                      }
                  }
             }
       }
      }
//绑定参数序号:将参数名称列表，作为测试参数范围的依据 -TBD
      function bindParaIdx() {
        $("#searchParaIdx").empty();
        $("#searchParaIdx").append("<option value=\"-1\">--请选择参数--</option>");
         {     for (var i = 0; i < 29; i++) {
                        $("#searchParaIdx").append("<option value='" +  (4001  + i)+ "'>" + "p"+(4001  + i) + "</option>");
                }
        }
        }

   });

  })();

/**************************显示折线图********************************/
//获取折线图展示时的最后时间节点（半点或者整点）
function getEndTimePoint()
{
    var now = new Date();
    if (now.getMinutes() > 0) {
        now.setMinutes(60);
    }
    return now;
}
//创建整点的时间轴数组
function createEChartXData() {
    var xData = [];
    var now  =getEndTimePoint();

    for (var i = 48; i>0; i--) {
        var str = now.format('H:M');
        if (str == '00:00') {
            str = now.format('m月d日');
        }
        else if (i == 1)
        {
            str = now.format('m月d日');
        }
        xData.push(str);
        now.setMinutes(-30);

    }
    return xData.reverse();

}

var myChart=null; //折线图形对象
var eChartLine={ //折线图对象
    positionID:0 //测温点编号
    };
//取数据，显示折线
function showTemp(StationID,subID,startTime,endTime) {
    $.ligerDialog.waitting('加载中...'); setTimeout(function () { $.ligerDialog.closeWaitting(); }, 2000);
    eChartLine.StationID = StationID;
    eChartLine.subID = subID;

    var xData = [];//createEChartXData();// ['00:00', '00:30', '01:00', '01:30', '02:00', '02:30', '03:00', '03:30', '04:00', '04:30', '05:00', '05:30', '06:00', '06:30'];
    var tempData = [];// [11, 11, 15, 13, 12, 13, 10, 26, 33, 31, 28, 18, 21, 30];
    myChart = echarts.init(document.getElementById('mainChart'));
    //处理查询时间范围
    if(!startTime)
    {
        startTime=moment().add(-1,'d');
    }
    else
    {
        startTime=moment(startTime);
    }
    if(!endTime)
    {
        endTime=moment();
    }
    else {
        endTime=moment(endTime);
    }
    $("#startTime").ligerGetDateEditorManager().setValue(startTime.format("YYYY-MM-DD HH:mm:ss"));//.format("Y-m-d H:i"));
    $("#endTime").ligerGetDateEditorManager().setValue(endTime.format("YYYY-MM-DD HH:mm:ss"));//.format("Y-m-d H:i"));
    $("#paralistModalTitle").html("历史参数曲线(机组：" + subID+")");
    $('#paralistModal').modal("show");
    $.ajax({
        url: '/admin/paralist/history/getPaging',
        data: {stationID:StationID, subID: subID, startTime:startTime.valueOf(),endTime: endTime.valueOf(), sortname: "AddTime", sortorder: "asc"},
        beforeSend: function (request) {
            request.setRequestHeader("authorization", getToken());
        },
        method: "Post",
        success: function (data) {

            var tData = JSON.parse(data);
            var max=0,min=0;
            if (tData != null && tData.Rows != null & tData.Rows.length > 0) {
                var maxTempPoint=_.max(tData.Rows,function(item) {return item.p4008;});
                max=maxTempPoint.p4008;
                var minTempPoint=_.min(tData.Rows,function(item) {return item.p4008;});
                min=minTempPoint.p4008;
                for (var i =0;i<tData.Rows.length; i++) {
                    var itemDate=new Date(tData.Rows[i].addTime);
                    if(i==0)
                    {
                        xData.push(itemDate.format('m月d日'));
                    }
                    else if(itemDate.getHours()==0  && new Date(tData.Rows[i-1].addTime).getHours()!=0)
                    {
                        xData.push(itemDate.format('m月d日'));
                    }
                    else {
                        xData.push(new Date(tData.Rows[i].addTime).format('H:i'));
                    }
                    tempData.push(tData.Rows[i].ai_TT11);
                    /*  if(tempData.length>=600)
                    /*  if(tempData.length>=600)
                          break;*/
                }
                var option = {
                    title: {
                        text: '',
                        subtext: '',
                        x: 'center',
                        y: 'top',
                        textAlign: 'center'
                    },
                    tooltip: {
                        trigger: 'axis'
                    },
                    legend: {
                        orient: 'horizontal',
                        x: 'center',
                        y: 'bottom',
                        data: ['参数1']
                    },
                    grid: {
                        left: '5%',
                        right: '5%',
                    },
                    toolbox: {
                        show: true,
                        feature: {
                            mark: {show: true},
                            dataView: {show: true, readOnly: false},
                            magicType: {show: true, type: ['line', 'bar']},
                            restore: {show: true},
                            saveAsImage: {show: true}
                        }
                    },
                    calculable: true,
                    xAxis: [
                        {
                            type: 'category',
                            boundaryGap: false,
                            data: xData
                        }
                    ],
                    yAxis: [
                        {
                            min:0,//min,
                            max:60,//max
                            type: 'value',
                            axisLabel: {
                                formatter: '{value} °C'
                            }
                        }
                    ],
                    series: [
                        {
                            name: '参数1',
                            type: 'line',
                            data: tempData,
                            smooth:true,
                            markPoint: {
                                data: [
                                    {type: 'max', name: '最大值'},
                                    {type: 'min', name: '最小值'}
                                ]
                            }
                        }
                    ]
                };
                myChart.setOption(option);

            } else {
                alert("该时间段内没有数据");
            }
        }
    });
}
$(document).ready(function(){
    $("#startTime").ligerDateEditor({
        format: "yyyy-MM-dd hh:mm",
        showTime:true,
        label: '',
        labelWidth: 100,
        labelWidth: 100,
        cancelable : false

    });
    $("#endTime").ligerDateEditor({
        format: "yyyy-MM-dd hh:mm",
        showTime:true,
        label: '',
        labelWidth: 100,
        labelWidth: 100,
        cancelable : false
    });
    $("#btnShowLine").on("click",function(){
        showTemp(eChartLine.positionID,$("#startTime").val(),$("#endTime").val());
    });
    $("input[name='searchMinDate']").ligerDateEditor({
        format: "yyyy-MM-dd hh:mm",
        showTime:true,
        label: '',
        labelWidth: 100,
        labelWidth: 100,
        cancelable : false

    });
    $("input[name='searchMaxDate']").ligerDateEditor({
        format: "yyyy-MM-dd hh:mm",
        showTime:true,
        label: '',
        labelWidth: 100,
        labelWidth: 100,
        cancelable : false
    });

});

$('.modal').on('shown.bs.modal', function (e) {
    // 关键代码，如没将modal设置为 block，则$modala_dialog.height() 为零
    $(this).css('display', 'block');
    var modalHeight=$(window).height() / 2 - $('.modal .modal-dialog').height() / 2;
    var modalLeft=($(window).width()-$('.modal .modal-dialog').width())/2;
    $(this).find('.modal-dialog').css({
        'margin-top': modalHeight,
        'margin-left':modalLeft,
    });
});

$('.modal').on('hidden.bs.modal', function (e) {
    myChart.clear();
    });