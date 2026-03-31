//********调整测温点的经纬度的工具*************************


var parentCompany={id:1,name:'中电洲际'};//中电洲际公司编号
var companyList=[{id:2,name:"滏东分公司"},{id:3,name:"丛台分公司"},{id:4,name:"滏河分公司"},{id:5,name:"铁西分公司"},{id:6,name:"中华分公司"}];
var alarmConfig={"id":3,"lowAlarm2":15,"lowAlarm1":18,"highAlarm1":26,"highAlarm2":30,"color_low2":"#0048FF","color_low1":"#00FF1E","color_Normal":"#010A01","color_High1":"#FF6600","color_High2":"#FF0000"};//报警配置数据
var lastZoom=13; //地图进行缩放操作之前的缩放级别
var initPosition=[114.500299,36.599669];//地图初始中心点
var map = new BMap.Map("container",{enableMapClick:false,minZoom:13,maxZoom:20});          // 创建地图实例
var initZoom=13;//初始缩放级别
var point = new BMap.Point(114.5329180000, 36.6005840000);
map.centerAndZoom(point, 13);             // 初始化地图，设置中心点坐标和地图级别
map.enableScrollWheelZoom(); // 允许滚轮缩放


var heatMapPointList=[];//tempList;
var pointList=[];
var infoWindow=null;
var pointCollection=null;

var tree=null;

if(!isSupportCanvas()){
    alert('热力图目前只支持有canvas支持的浏览器,您所使用的浏览器不能使用热力图功能~')
}

/*
var heatmapOverlay
heatmapOverlay = new BMapLib.HeatmapOverlay({"radius": 35});
map.addOverlay(heatmapOverlay);
if(heatMapPointList.length>0) {
    heatmapOverlay.setDataSet({data: heatMapPointList, max: 27});
}
*/

/*map.addEventListener("zoomend", function(evt) {

    var zoom = map.getZoom();
    $("#spnZoomGrade").text(zoom);
    if (lastZoom<=16 &&  zoom > 16) {
        closeHeatmap();
        showLotOfPoints(pointList);
    }
    else if(lastZoom>16 && zoom<=16)
    {
        map.closeInfoWindow();
        clearLotOfPoints();
        showHeatMap();
    }
    lastZoom=zoom;
    //var offsetPoint = new BMap.Pixel(evt.offsetX, evt.offsetY);
    //记录鼠标当前点坐标<br>   alert(offsetPoint.x+","+offsetPointY);
});*/

var local = new BMap.LocalSearch(map, {
    renderOptions:{map: map}
});

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
    var zoom = map.getZoom();
    return zoom<=16;
}

function isShowPoints()
{
    var zoom = map.getZoom();
    return zoom>16;
}

//创建热力图
function createHeatMap(){
    heatmapOverlay.setDataSet({data: heatMapPointList, max: 27});
    //heatmapOverlay.show();
}

//显示热力图
function showHeatMap(dataList) {
    clearLotOfPoints();
    if (dataList != null && dataList.length > 0) {
        createHeatMapDataSet(dataList);
        heatmapOverlay.setDataSet({data: heatMapPointList, max: 27});
    }
    heatmapOverlay.show();
}

//只设置热力图数据，不显示
function setHeatMapData(dataList)
{
    if (dataList != null && dataList.length > 0) {
        createHeatMapDataSet(dataList);
        heatmapOverlay.setDataSet({data: heatMapPointList, max: 27});
    }
}

//隐藏热力图
function closeHeatmap(){
    heatmapOverlay.hide();
}

function setGradient(){
    /*格式如下所示:
   {
         0:'rgb(102, 255, 0)',
         .5:'rgb(255, 170, 0)',
         1:'rgb(255, 0, 0)'
   }*/
    var gradient = {};
    var colors = document.querySelectorAll("input[type='color']");
    colors = [].slice.call(colors,0);
    colors.forEach(function(ele){
        gradient[ele.getAttribute("data-key")] = ele.value;
    });
    heatmapOverlay.setOptions({"gradient":gradient});
}

function showLotOfPoints(dataList)
{
    clearLotOfPoints();
    var points = [];  // 添加海量点数据
    for (var i = 0; i < dataList.length; i++) {
        var point=new BMap.Point(dataList[i].longi, dataList[i].lati);
        point.pid=dataList[i].id;
        point.address=getAddress(dataList[i]);
        point.temp1=dataList[i].temp1;
        point.updateTime=dataList[i].updateTime;
        point.companyName=dataList[i].companyName;
        point.stationName=dataList[i].stationName;
        point.stationUnitName=dataList[i].stationUnitName;
        points.push(point);
    }
    var options = {
        size: BMAP_POINT_SIZE_BIG,
        shape: BMAP_POINT_SHAPE_WATERDROP,
        color: '#d340c3'
    }

    pointCollection = new BMap.PointCollection(points, options);  // 初始化PointCollection
    var showInfoFun=function (e) {
        var date=new Date(e.point.updateTime);
        var updateTime=dateFormat(date,'Y-m-d H:i:s');
        var color=e.point.temp1<alarmConfig.lowAlarm1?alarmConfig.color_low1:e.point.temp1>=alarmConfig.lowAlarm1 && e.point.temp1<=alarmConfig.highAlarm1?alarmConfig.color_Normal:alarmConfig.color_High2;
        var html= '<div><span>当前温度：</span><span style="color:'+color+'">'+e.point.temp1.toFixed(1)+'℃</span></div><div><span>采集时间：</span><span>'+updateTime+'</span></div><div><span>热力公司：</span><span>'+e.point.companyName+'</span></div><div><span>换热站：</span><span>'+e.point.stationName+'（'+e.point.stationUnitName+'）</span></div>';
        var opts = {
            width : 250,     // 信息窗口宽度
            height: 100,     // 信息窗口高度
            title : '<div><span>测温点：</span><span><a target="_blank" href="/admin/position/list?positionID='+e.point.pid+'">'+e.point.address+'</a></span></div>' , // 信息窗口标题
            enableMessage:true//设置允许信息窗发送短息
        };
        infoWindow = new BMap.InfoWindow(html,opts);  // 创建信息窗口对象
        map.openInfoWindow(infoWindow,new BMap.Point(e.point.lng,e.point.lat)); //开启信息窗口
        //alert('单击点的坐标为：' + e.point.lng + ',' + e.point.lat);  // 监听点击事件
    };

    pointCollection.addEventListener('mouseover', showInfoFun);
    pointCollection.addEventListener('click', showInfoFun);
    pointCollection.addEventListener('mouseout', function (e) {
        infoWindow=null;
    });

    map.addOverlay(pointCollection);  // 添加Overlay
}

function clearLotOfPoints()
{
    //if(pointCollection)
    //  pointCollection.hide();
    map.removeOverlay(pointCollection);

}

//判断浏览区是否支持canvas
function isSupportCanvas(){
    var elem = document.createElement('canvas');
    return !!(elem.getContext && elem.getContext('2d'));
}
var companyList=[];
var stationList=[];
var communityList=[];

(function () {
    $(function() {

        //获取配置
        getAlarmConfig()
            .then(function(configResult){
                if(configResult.length>0) {
                    alarmConfig =configResult[0];
                }

                //分公司
                var _companyService = app.createService('company');
                _companyService.getAll({"searchParentID": -2}, {"page": 1, "pagesize": 20}, function (data) {
                    var parentCompany = JSON.parse(data);
                    if (parentCompany.Rows.length > 0) {
                        companyList=_.filter(parentCompany.Rows,function(item){return item.status==1;});
                    }
                });

                var _stationService = app.createService('heatexchangestation');
                _stationService.getAll({}, {"page": 1, "pagesize": 9999}, function (data) {
                    var sList = JSON.parse(data);
                    stationList=sList.Rows;
                });

                var _communityService = app.createService('community');
                _communityService.getAll({}, {"page": 1, "pagesize": 9999}, function (data) {
                    var sList = JSON.parse(data);
                    communityList=sList.Rows;
                });

                //获取测温点实时温度数据
                return getTempList(1,50000);
            })
            .then(function(data){
                return;
                 $("#tree1").ligerTree({
                    nodeWidth: 200,
                    checkbox: false,
                    idFieldName: 'id',
                    delay: [1,2],//1级和2级都延迟
                    slide: false,
                    onAfterAppend: function ()
                    {
                    },
                    onBeforeAppend: function ()
                    {
                    }
                });
                tree =$("#tree1").ligerGetTreeManager();
                f_load();
                //合并测温点温度数据
                savePointList(data);

                //使用测温点温度数据显示热力图
                //positions=setStyle(data);
                //createHeatMapDataSet(data);
                //创建热力图
                //createHeatMap();
                showLotOfPoints(data);

            })
            /*.then(function(data){
                //显示统计图（饼图、折线图）
                 $("#companyChars").show();
                 $("#rightToolPercent").show();
                return showCharts();
            })
            .then(function(data){
                //温度报警数据展示

                createAlarmHtml();
                $("#rightToolAlarm").show();
                $("#companyChars").css("backgroundColor","#fff");
                $("#rightToolPercent").css("backgroundColor","#fff");
            })*/
        ;

        /* $("#companiesClose").click(function () {
            toggleCompanyChart();
            // $("#companyChars").toggle(1000);
        });
        $("#parentCompanyClose").click(function () {
            toggleParentCompanyChart();
            // $("#rightToolPercent").toggle(1000);
        });
        $("#realTimeTempClose").click(function () {
            $("#realTimeInfo").hide();
        });
        $("#alarmHighClose").click(function () {
            $("#highAlarmContainer").hide();
        });

        $("#alarmLowClose").click(function () {
            $("#lowAlarmContainer").hide();
        });

        setTimeout(function(){
            fetchPositionTemp();
        },20000);

        setTimeout(function(){
            updateCharts();
        },18000);*/
    });
})();

//保存点
function savePointList(dataList)
{
    //合并测温点温度数据
    var notExistsPoint=[];
    for(var i=0;i<dataList.length;i++) {
        var orgPoint = _.find(pointList, function (item) {
            return item.id == dataList[i].id;
        });
        if (orgPoint) {
            orgPoint.updateTime = dataList[i].updateTime;
            orgPoint.temp1 = dataList[i].temp1;
        }
        else
        {
            notExistsPoint.push(dataList[i]);
        }
    }
    if(notExistsPoint.length>0)
    {
        pointList=notExistsPoint.concat(pointList);
    }
}

function getAlarmConfig()
{
    return new Promise(function(resolve,reject){
        $.ajax({
            url:"/admin/alarmconfig/getPaging",
            type:"POST",
            data:{page:1,
                pageSize:1,
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


function  getAddress(posTemp) {
     return  posTemp.communityName+(posTemp.buildingNo?posTemp.buildingNo:posTemp.buildingName)+'栋'+posTemp.subNumber+'单元'+posTemp.floorNumber+'层'+posTemp.apartNumber+'室';
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


function f_load()
{
    var data = createData();
    alert(JSON.stringify(data));
    var op = {
        isExpand: 1,
        delay: [1,2,3]
    };
    if (!op.delay.length) op.delay = false;
    tree.set(op);
    /*var time1 = new Date();
    tree.set('data', data);
    var time2 = new Date();
    var showed = $("#companyTree li").length;*/
    //var h = "节点总数:" + getNodesCount() + ",已渲染节点总数:" + showed + ",耗时:" + (time2 - time1) + "毫秒";

    //alert(h);
}
//创建tree的数据
function createData()
{
    var data=[];
    for(var i in companyList)
    {
        data.push({text:companyList[i].name,id:companyList[i].id,dtype:'company',children:createStationTree(companyList[i].id)});
    }
    return data;
}

function createStationTree(companyID)
{
    var data=[];
    var stations=_.filter(stationList,function (item) {
        return item.companyID == companyID && item.status==1;
    });
    for(var i in stations){
        data.push({text:stations[i].name,id:stations[i].id,dtype:'station',children:createCommunityTree(stations[i].id)});
    }
    return data;
}

function createCommunityTree(stationID)
{
    var data=[];
    var comms=_.filter(communityList,function (item) {
        return item.stationID == stationID && item.status==1;
    });
    for(var i in comms){
        data.push({text:comms[i].name,id:comms[i].id,dtype:'community'});
    }
    return data;
}





