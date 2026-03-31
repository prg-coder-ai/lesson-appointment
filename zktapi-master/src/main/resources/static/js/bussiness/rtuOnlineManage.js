//报警参数监视
var maingrid;
var maingridHist;
var _$modal;
var _$form;

var companyID =0 ;// -公司ID
var companyName = 0;//公司名称
var currentAlarm = "";//保存报警状态
var bid = 0;//公司ID
var sid = 0;//stationID
var user_info =0;
 var currentAlarmtext="系统正常";
  var col = [
                  {display: '编号', name: 'id', width: 90    ,render:function(rowData){
                                       return rowData.id==0?"-":rowData.id;
                                                                              }   },
                  {display: '公司名称', name: 'companyName', width: 90, render:function(rowData){
                                       return rowData.companyName== null ?"-":rowData.companyName;}
                                       },

             {display: '站名', name: 'stationName', width: 60,render:function(rowData){
                           return  rowData.stationName     }},
            {display: '远传标记', name: 'stationCode', width: 60,render:function(rowData){
                                       return  rowData.stationCode     }},
             {display: '在线状态', name: 'offline', width: 60,render:function(rowData){
                                           return rowData.offline==0?"在线":"离线" }
                                           },
            {display: '更新时间', name: 'addTime', width: 145, render: function (rowData) {
                                    return rowData.addTime == null ? "-" :
                                    new Date(rowData.addTime).format('Y-m-d H:i:s');
                                }
                            }
              ];

(function () {
    $(function () {
            user_info = getLoginUser() ;
            if(user_info)
              { bid=  user_info["companyID"];
               sid=  user_info["stationID"];
               }

        toastr.options.positionClass = 'toast-center-center';
        //检索
        $("#search").click(function () {
           loadGrid();
           maingrid.changePage('first');

             // loadGridHistory();
              //maingridHist.changePage('first');
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

        //检索
        $("#refresh").click(function () {
           loadGrid();
          // maingrid.changePage('first');

        });
         loadGrid();
<!--根据登录者的companyID，查找报警数据 1、缺省为 登录者的companyID，2 选择后，为serachCompanyID  -->

        //绑定公司
        bindCompany();
        $("#searchCompanyID").change(function () {
           loadGrid();
        });
    });

})();

 function loadGrid() {
            maingridHist = $("#maingrid").ligerGrid({
                columns: col,
                dataAction: 'server',
                url: "/admin/online/getPaging",//从服务端加载数据
                parms:  $('#search_form').serializeArray(),//这里是关键，传递搜索条件的参数  serializeArray是jquery自带的吧form转json传递的方法
                checkbox: false,
                rownumbers: true,
                pageSize: 1,
                usePager: true,
                width: '99%',
                height: '90%',
                fixedCellHeight: true,
                onLoaded:function(grid){
                    //设置分页输入框的宽度
                    var manager1 = $("#maingrid").ligerGetGridManager();
                    var data1 = manager1.getData();

                    var total1=manager1.currentData.Total*1;
                    var pageSize1=manager1.options.pageSize*1;
                    var size1=parseInt((total1/pageSize1).toString()).toString().length;
                    $(".pcontrol input").css("width",size1*15+"px").attr("maxLength",size1);
                    manager1.toggleLoading(false);//隐藏加载层
                }
            });
        }
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
 /*获取登录用户信息*/
              function getLoginUser() {
                  var userStr = localStorage.getItem('loginUser');
                  var user = JSON.parse(userStr);
                  //user.isManager = isManager(user);
                  return user;
              }

function LoadAlarmByCompandID()
{
    //console .logg("LoadAlarmByCompandID---");
    //console .logg(searchCompanyID);
     $.ajax({
           url: '/admin/alarm/getPaging',
           //data: {searchCompanyID:searchCompanyID },
           data:  $('#search_form').serializeArray(),
           method: 'POST',
           success: function (data) {
             //console .logg(data);
               var alarmdata = JSON.parse(data);
                     //console .logg("alarmdata---");
                     //console .logg(alarmdata);

                       if (alarmdata.Rows.length > 0) {
                           //setdata to
                             currentAlarm = alarmdata.Rows[0];//.almtext;
                             currentAlarmtext = currentAlarm.almtext;
                             //console .logg(currentAlarm);
                             //console .logg("currentAlarmtext：");
                             //console .logg(currentAlarmtext);
                           } else
                           {  currentAlarm = "";
                           }
               },
            error:function(err){
                    //console .logg("alarmdata--err");
                                        //console .logg(err);
                }
               });
}



