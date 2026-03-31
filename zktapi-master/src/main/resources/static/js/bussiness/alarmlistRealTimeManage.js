//报警参数监视
var maingrid;
var maingridHist;
var _$modal;
var _$form;
 var currentAlarmtext="系统正常";
 var atestStr="{abc:123}";
var alarmdata;
var companyID =0 ;// -公司ID
var companyName = 0;//公司名称
var currentAlarm = "";//保存报警状态
var bid = 0;//公司ID
var sid = 0;//stationID
var user_info =0;

(function () {
    $(function () {
            user_info = getLoginUser() ;
             ////console .log("loginUser--:");
            // console.log(user_info);
               bid=  user_info["companyID"];
               sid=  user_info["stationID"];
            LoadAlarmByCompanyID();
//console.log("currentAlarmtext000--:");
  //           console.log(currentAlarmtext);
              /*获取登录用户信息*/
              function getLoginUser() {
                  var userStr = localStorage.getItem('loginUser');
                  var user = JSON.parse(userStr);
                  //user.isManager = isManager(user);
                  return user;
              }

        toastr.options.positionClass = 'toast-center-center';
        //检索
        $("#search").click(function () {
           loadGrid();
           //  maingrid.changePage('first');

              loadGridHistory();
              maingridHist.changePage('first');
        });
        $("#search_form").keydown(function(e){
            if(e.keyCode==13)
            {
                e.stopPropagation();
                e.preventDefault();
              loadGrid();
               // maingrid.changePage('first');

                 loadGridHistory();
                 maingridHist.changePage('first');
            }
        });

        //检索
        $("#refresh").click(function () {
          LoadAlarmByCompanyID();
        });

         var col = [
                 {display: '编号', name: 'id', width: 60    ,render:function(rowData){
                                      return rowData.id==0?"-":rowData.id;
                                                                             }   },
                 {display: '公司名称', name: 'companyCode', width: 120, render:function(rowData){
                                      return rowData.companyCode== null ?"-":rowData.companyCode;}
                                      },

                 {display: '接收时间', name: 'addTime', width: 145, render: function (rowData) {
                         return rowData.addTime == null ? "-" : new Date(rowData.addTime).format('Y-m-d H:i:s');
                     }
                 },
            {display: '当前编号', name: 'alarmNO', width: 60,render:function(rowData){
                          return  rowData.alarmno     }},
            {display: '确认编号', name: 'ALARMCLRNO', width: 60,render:function(rowData){
                                          return rowData.alarmclrno }
                                          },
                        {display: '报警计数', name: 'alarmCounter', width: 60,render:function(rowData){
                                           return rowData.alarmCounter  ;      }
                                           },
                         {display: '当前信息', name: 'almtext', width: 260,render:function(rowData){
                               return rowData.almtext == null?'-': ""+rowData.almtext  ;      }
                                                                          },
                        {display: '未确认数', name: 'unAckAlarmCounter', width: 60,render:function(rowData){
                                        return  rowData.unAckAlarmCounter == null?'-':rowData.unAckAlarmCounter;
                                        }
                                        },
                        {display: 'newAlarm', name: 'newAlarm', width: 60,render:function(rowData){
                                     return rowData.newAlarm == null?'-':(rowData.newAlarm==1)?"新告警":"已确认";
                                      }
                                     },
                        {display: '报警状态', name: 'enableAlarm', width: 60,render:function(rowData){
                                 return  rowData.enableAlarm == null?'-':""+(rowData.enableAlarm ==1)?"允许告警":"禁止确认";
                                  }
                                 }
             ];


    //     loadGrid();
         loadGridHistory();
         LoadAlarmByCompanyID();

<!--根据登录者的companyID，查找报警数据 1、缺省为 登录者的companyID，2 选择后，为serachCompanyID  -->
 function loadGridHistory() {
            maingridHist = $("#maingrid_history").ligerGrid({
                columns: col,
                dataAction: 'server',
                url: "/admin/alarm/gethist",//从服务端加载数据
                parms:  $('#search_form').serializeArray(),//这里是关键，传递搜索条件的参数  serializeArray是jquery自带的吧form转json传递的方法
                checkbox: false,
                rownumbers: true,
                pageSize: 20,
                usePager: true,
                width: '99%',
                height: '90%',
                fixedCellHeight: false,
                onLoaded:function(grid){
                    //设置分页输入框的宽度
                    var manager = $("#maingrid_history").ligerGetGridManager();
                    var data = manager.getData();

                    var total=manager.currentData.Total*1;
                    var pageSize=manager.options.pageSize*1;
                    var size=parseInt((total/pageSize).toString()).toString().length;
                    $(".pcontrol input").css("width",size*15+"px").attr("maxLength",size);
                    manager.toggleLoading(false);//隐藏加载层
                }
            });
        }

 function loadGrid() {
            maingridHist = $("#maingrid").ligerGrid({
                columns: col,
                dataAction: 'server',
                url: "/admin/alarm/getPaging",//从服务端加载数据
                parms:  $('#search_form').serializeArray(),//这里是关键，传递搜索条件的参数  serializeArray是jquery自带的吧form转json传递的方法
                checkbox: false,
                rownumbers: true,
                pageSize: 1,
                usePager: false,
                width: '99%',
                height: '20%',
                fixedCellHeight: true,
                onLoaded:function(grid){
                    //设置分页输入框的宽度
                    var manager1 = $("#maingrid").ligerGetGridManager();
                    var data1 = manager1.getData();

                    //console .log("data---:");console.log(parms);

                    var total1=manager1.currentData.Total*1;
                    var pageSize1=manager1.options.pageSize*1;
                    var size1=parseInt((total1/pageSize1).toString()).toString().length;
                    $(".pcontrol input").css("width",size1*15+"px").attr("maxLength",size1);
                    manager1.toggleLoading(false);//隐藏加载层
                }
            });
        }
        //绑定公司
        bindCompany();
      //  console.log("currentAlarmtext2--:");
        //             console.log(currentAlarmtext);
        $("#searchCompanyID").change(function () {
          // loadGrid();
           //loadGridHistory();
           LoadAlarmByCompanyID();
           //console.log("currentAlarmtext3--:");
           //console.log(currentAlarmtext);
        });
    });

})();


function bindCompany() {
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
//
function LoadAlarmByCompanyID()
{
  //  console.log("LoadAlarmByCompandID---");
  //  console.log(atestStr);

    //  var alarmdata = JSON.parse(atestStr);
    //   currentAlarm = alarmdata.alrmStr;//.almtext;
    //    console.log("currentAlarm:");
     //   console.log(currentAlarm);
      // currentAlarmtext = currentAlarm.almtext;
      // console.log("currentAlarmtext:");
       // console.log(currentAlarmtext);
     /*$.ajax({
           url: '/admin/alarm/getPaging',
           data:  $('#search_form').serializeArray(),
           method: 'POST',
           success: function (data) {
            // console.log(data);
               var alarmdata = JSON.parse(data);
                     //console .log("alarmdata---");
                     //console .log(alarmdata);

                       if (alarmdata.Rows.length > 0) {
                           //setdata to
                             currentAlarm = alarmdata.Rows[0];//.almtext;
                             currentAlarmtext = currentAlarm.almtext;
                             //console .log(currentAlarm);
                             //console .log("currentAlarmtext：");
                             //console .log(currentAlarmtext);
                           } else
                           {  currentAlarm = "";
                           }
               },
            error:function(err){
                    //console .log("alarmdata--err");
                                        //console .log(err);
                }
               });*/
}



