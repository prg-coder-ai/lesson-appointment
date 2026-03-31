var parentCompany={id:2,name:'晋城'};//中电洲际公司编号
var companyList=[{id:2,name:"滏东分公司"},{id:3,name:"丛台分公司"},{id:4,name:"滏河分公司"},{id:5,name:"铁西分公司"},{id:6,name:"中华分公司"}];
var alarmConfig={"id":3,"lowAlarm2":15,"lowAlarm1":18,"highAlarm1":26,"highAlarm2":30,"color_low2":"#0048FF","color_low1":"#00FF1E","color_Normal":"#010A01","color_High1":"#FF6600","color_High2":"#FF0000"};//报警配置数据
var lastZoom=14; //地图进行缩放操作之前的缩放级别

var initPosition=[112.945386,35.644014];//晋城地图初始中心点
var point = new BMap.Point(initPosition[0],initPosition[1]);

//var centerPoint ={ lati:34.84241,logi:114.836687}
//var initPosition=[114.813917,34.816951];//兰考地图初始中心点
//var point = new BMap.Point(initPosition[0],initPosition[1]);


function getLoginUser() {
                  var userStr = localStorage.getItem('loginUser');
                  var user = JSON.parse(userStr);
                   console.log(userStr);
                  return user;
              }
//获取公司各站地址
function getStationPos(companyID,callback)
{
   $.ajax({
            url:"/admin//heatexchangestation/getStations",
            type:"POST",
            data:{CompanyID:companyID,
                 page:1,
                pagesize:200
            },
            success:function(data){
                // console.log("get---");
               // console.log(data);
               callback(data);
            },
            error:function(err){
                reject(err);
            }
        });
}

//读取登录用户的companyID
      var user_info = getLoginUser() ;
      console.log(user_info);

                   bid=  user_info["companyID"];
                   sid=  user_info["stationID"];


    getStationPos(bid,function(data)     {
           //console .logg("stlist--");
           var stlist  = JSON.parse(data).Rows;
           //console .logg(stlist);

        var sumLongi =0.0,sumLati=0.0,cnt=0;
        for (s in stlist) {//计算中心点
                  sumLongi +=   stlist[s] .longi;
                  sumLati  +=   stlist[s] .lati;
                  cnt = cnt +1 ;
                  }

  var marker =[]
                           var strlist =[]
                           var p =[]
                           var label=[]
                           var infoWindow =[]
    initPosition[0]   =     sumLongi/cnt;
    initPosition[1]   =     sumLati/cnt;
          //  console.log("center:");    console.log(initPosition[0]);    console.log(initPosition[1]);
    var point = new BMap.Point(initPosition[0],initPosition[1]);
    var map = new BMap.Map("container",{enableMapClick:false,minZoom:13,maxZoom:20});          // 创建地图实例
    var initZoom=14;//初始缩放级别

    map.centerAndZoom(point, initZoom);             // 初始化地图，设置中心点坐标和地图级别
    map.enableScrollWheelZoom(); // 允许滚轮缩放


        cnt =0;
        var optsLabel = []
        var optsInfo = {
                        width : 200,     // 信息窗口宽度
                        height: 100,     // 信息窗口高度
                        borderRadius: '5px',
                        borderColor: '#ccc',
                        padding: '10px',
                        title : "换热站参数信息" , // 信息窗口标题
                        message:"msg"
        	        }
         var myIcon = new BMap.Icon("../images/uniticon3.jpg", new BMap.Size(60, 40)); // 创建标注

        for (s in stlist)
          {    // console.log(s);

               p [s] = new BMap.Point( stlist[s].longi, stlist[s].lati);
               marker[s] = new BMap.Marker(p[s],{  icon: myIcon  });
               map.addOverlay(marker[s] );//添加标记图标

             //  strlist[s]= '站名:'+ stlist[s].name  +' 供温面积:'+stlist[s].heatingArea  ;
             //  infoWindow[s]  = new BMap.InfoWindow(strlist[s], optsInfo);  // 创建信息窗口对象
              //    marker[s].addEventListener("click", function(){
               //          map.openInfoWindow(infoWindow[s],p[s] ); //开启信息窗口
              //    });

        optsLabel[s] = {
	               position : p [s],    // 指定文本标注所在的地理位置
	               offset   : new BMap.Size(0, -40)    //设置文本偏移量
	               }

	       label[s]  = new BMap.Label(  stlist[s].name  , optsLabel[s]);  // 创建文本标注对象
	       label[s].setStyle({
                    color :  'blue' ,
                    borderRadius: '2px',
                    borderColor: '#ccc',
                   // padding: '10px',
                    fontSize : '16px',
                    height : '20px',
		          lineHeight : '20px',
		          fontFamily: '微软雅黑'
	          });
	        map.addOverlay(label[s]);
	         cnt++;
       }

        var heatMapPointList=[];//tempList;
        var pointList=[];
        var infoWindow=null;
        var pointCollection=null;
        map.addEventListener("zoomend", function(evt) {
            var zoom = map.getZoom();
            $("#spnZoomGrade").text(zoom);
            if (lastZoom<=16 &&  zoom > 16) {
            }
            else if(lastZoom>16 && zoom<=16)
            {
                //map.closeInfoWindow();
            }
            lastZoom=zoom;
        });

    var local = new BMap.LocalSearch(map, {
        renderOptions:{map: map}
    });

//if(!isSupportCanvas()){
  //  alert('热力图目前只支持有canvas支持的浏览器,您所使用的浏览器不能使用热力图功能~')
//}

    function searchAddress()
    {
        var address=$("input[name='searchInput']").val();
        if(address) {
            local.search(address);
            $("input[name='searchInput']").val('');
        }
        else
            local.clearResults();
    }

 }); //showinfo



$(document).ready(function(){
    $("#searchContainer").keydown(function(e){
        if(e.keyCode==13)
        {
            e.stopPropagation();
            e.preventDefault();
            searchAddress();
        }
    });

});

function isShowHeatmap()
{
    return false;//任何时候都显示热力图
   // var zoom = map.getZoom();
    //return zoom<=16;
}

function isShowPoints()
{
    var zoom = map.getZoom();
    return zoom>16;
}



//判断浏览区是否支持canvas
function isSupportCanvas(){
    var elem = document.createElement('canvas');
    return !!(elem.getContext && elem.getContext('2d'));
}



function showOprationTip(text)
{
    $("#oprationTip").text(text);
}

function showHighAlarmTemp()
{
    $("#highAlarmContainer").toggle();
}
function showLowAlarmTemp()
{
    $("#lowAlarmContainer").toggle();
}

function showLastTemp()
{
    $("#realTimeInfo").toggle();
}


//获取测温点实时温度数据
function getTempList(pageIndex,pageSize)
{
    return new Promise(function(resolve,reject){
        $.ajax({
            url:"/admin/positiontemp/getPaging",
            type:"POST",
            data:{jtStartIndex:pageIndex,
                jtPageSize:pageSize,
                jtSorting:"updatetime desc"
            },
            success:function(data){
                resolve(JSON.parse(data).Rows);
            },
            error:function(err){
                reject(err);
            }
        });
    },60000);
}


/*
** 时间戳转换成指定格式日期
** eg.
** dateFormat(11111111111111, 'Y年m月d日 H时i分')
** → "2322年02月06日 03时45分"
*/
var dateFormat = function (timestamp, formats) {
    // formats格式包括
    // 1. Y-m-d
    // 2. Y-m-d H:i:s
    // 3. Y年m月d日
    // 4. Y年m月d日 H时i分
    formats = formats || 'Y-m-d';

    var zero = function (value) {
        if (value < 10) {
            return '0' + value;
        }
        return value;
    };

    var myDate = timestamp? new Date(timestamp): new Date();

    var year = myDate.getFullYear();
    var month = zero(myDate.getMonth() + 1);
    var day = zero(myDate.getDate());

    var hour = zero(myDate.getHours());
    var minite = zero(myDate.getMinutes());
    var second = zero(myDate.getSeconds());

    return formats.replace(/Y|m|d|H|i|s/ig, function (matches) {
        return ({
            Y: year,
            m: month,
            d: day,
            H: hour,
            i: minite,
            s: second
        })[matches];
    });
};


function showBaseManage()
{
    location.href="/admin/company/list";
}

function getDetailAddress(position)
{
    if(position)
        return position.communityName+(position.buildingName?position.buildingName:position.buildingNo)+'栋'+position.subNumber+'单元'+position.floorNumber+'层'+position.apartNumber+'室';
    return '';
}

function formatTime(timeInt)
{
    var date=new Date(timeInt);
    return date.getHours()+':'+date.getMinutes();
}

function resetStatus()
{
    map.centerAndZoom(new BMap.Point(initPosition[0],initPosition[1]),initZoom);
}


//点聚合显示 -------------------------------------------
function showMarkerClusterer(dataList)
{
    var MAX = dataList.length;
    var markers = [];
    var pt = null;
    var i = 0;
    for (; i < MAX; i++) {
        pt = new BMap.Point(dataList[i].longi, dataList[i].lati);
        var marker=new BMap.Marker(pt);
        markers.push(marker);
        addClickHandler(getPointAnchor(dataList[i]), getTipInfo(dataList[i]),marker);
    }
//最简单的用法，生成一个marker数组，然后调用markerClusterer类即可。
    var markerClusterer = new BMapLib.MarkerClusterer(map, {markers:markers});

}

function addClickHandler(pointAnchor,content,marker){
    marker.addEventListener("click",function(e){
        openInfo(pointAnchor,content,e)}
    );
}
function openInfo(pointAnchor,content,e){
    var opts = {
        width : 250,     // 信息窗口宽度
        height: 100,     // 信息窗口高度
        title : pointAnchor , // 信息窗口标题
        enableMessage:true//设置允许信息窗发送短息
    };
    var p = e.target;
    var point = new BMap.Point(p.getPosition().lng, p.getPosition().lat);
    var infoWindow = new BMap.InfoWindow(content,opts);  // 创建信息窗口对象
    map.openInfoWindow(infoWindow,point); //开启信息窗口
}

function  getTipInfo(posTemp) {
    var date=new Date(posTemp.updateTime);
    var updateTime=dateFormat(date,'Y-m-d H:i:s');
    var color=posTemp.temp1<alarmConfig.lowAlarm1?alarmConfig.color_low1:posTemp.temp1>=alarmConfig.lowAlarm1 && posTemp.temp1<=alarmConfig.highAlarm1?alarmConfig.color_Normal:alarmConfig.color_High2;
    return '<div><span>当前温度：</span><span style="color:'+color+'">'+posTemp.temp1.toFixed(1)+'℃</span></div><div><span>采集时间：</span><span>'+updateTime+'</span></div><div><span>热力公司：</span><span>'+posTemp.companyName+'</span></div><div><span>换热站：</span><span>'+posTemp.stationName+'（'+posTemp.stationUnitName+'）</span></div>';

    //return "hello"+"<br/>"+ posTemp.communityName+(posTemp.buildingNo?posTemp.buildingNo:posTemp.buildingName)+'栋'+posTemp.subNumber+'单元'+posTemp.floorNumber+'层'+posTemp.apartNumber+'室';
}

function getPointAnchor(posTemp)
{
    return '<div><span>测温点：</span><span><a target="_blank" href="/admin/position/list?positionID='+posTemp.id+'">'+getAddress(posTemp)+'</a></span></div>';
}


//end 点聚合显示 -------------------------------------------