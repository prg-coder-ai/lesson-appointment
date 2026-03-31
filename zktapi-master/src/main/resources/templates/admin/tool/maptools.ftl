<!DOCTYPE html>
<html lang="en">
<head>
    <title>测温点坐标调整</title>
    <link href="/LigerUI/lib1.1.3/ligerUI/skins/Aqua/css/ligerui-all.css" rel="stylesheet" type="text/css" />

    <script src="/LigerUI/lib1.1.3/jquery/jquery-1.9.0.min.js" type="text/javascript"></script>
    <script type="text/javascript" src="http://api.map.baidu.com/api?v=2.0&ak=6QD6MAZ8r4xtF4iSGVpzzDQIEUcRWnYm"></script>
    <script type="text/javascript" src="http://api.map.baidu.com/library/TextIconOverlay/1.2/src/TextIconOverlay_min.js"></script>




    <script src="/LigerUI/lib1.1.3/ligerUI/js/core/base.js" type="text/javascript"></script>
    <script src="/LigerUI/lib/ligerUI/js/plugins/ligerDialog.js" type="text/javascript"></script>
    <script src="/LigerUI/lib1.1.3/ligerUI/js/plugins/ligerTree.js" type="text/javascript"></script>
    <script src="/js/underscore.js"></script>
    <script src="/js/main.js"></script>
    <style>
        #container{height:100%;}
    </style>
    <script type="text/javascript">
        var map;
        var local;
        $(function(){
            map = new BMap.Map("container",{enableMapClick:false,minZoom:1,maxZoom:20});          // 创建地图实例
            var initZoom=13;//初始缩放级别
            var point = new BMap.Point(114.5329180000, 36.6005840000);
            map.centerAndZoom(point, 13);             // 初始化地图，设置中心点坐标和地图级别
            map.enableScrollWheelZoom(); // 允许滚轮缩放
            map.addControl(new BMap.NavigationControl());

            local = new BMap.LocalSearch(map, {
                renderOptions:{map: map}
            });
        });

        function drawMarker(positionList) {
            $.ligerDialog.waitting('加载中...');
            setTimeout(function(){$.ligerDialog.closeWaitting();},5000);
            map.clearOverlays();
            var centerPoint = new BMap.Point(positionList[0].longi, positionList[0].lati);
            map.centerAndZoom(centerPoint, 17);
            for (var i in positionList)
            {
                var point = new BMap.Point(positionList[i].longi, positionList[i].lati);
                var marker = new BMap.Marker(point);
                marker.enableDragging();
                map.addOverlay(marker);    //增加点
                marker.address=getAddress(positionList[i]);
                marker.positionID=positionList[i].id;
                marker.longi=positionList[i].longi;
                marker.lati=positionList[i].lati;
                //拖拽前
                marker.addEventListener("dragstart", function (e) {
                    showPositionInfo(this);
                 });
                //标注拖拽后的位置
                marker.addEventListener("dragging", function (e) {
                    $("#longiInfo1").html(e.point.lng);
                    $("#hdLongi").val(e.point.lng);
                    $("#latiInfo1").html(e.point.lat);
                    $("#hdLati").val(e.point.lat);
                });
                //标注拖拽后的位置
                marker.addEventListener("dragend", function (e) {
                    $("#longiInfo1").html(e.point.lng);
                    $("#hdLongi").val(e.point.lng);
                    $("#latiInfo1").html(e.point.lat);
                    $("#hdLati").val(e.point.lat);
                });

                marker.addEventListener("click", function (e) {
                        showPositionInfo(this);
                        var infoWindow = new BMap.InfoWindow("<div>"+this.address+"</div>");
                        this.openInfoWindow(infoWindow);
                        $("#longiInfo1").html(e.point.lng);
                        $("#hdLongi").val(e.point.lng);
                        $("#latiInfo1").html(e.point.lat);
                        $("#hdLati").val(e.point.lat);

                });
            }
            $.ligerDialog.closeWaitting();
        }


        function  getAddress(posTemp) {
            return  '<div style="background-color:#efefef;padding:2px 0;">测温点信息</div>'+
                    '<div>编号:'+posTemp.id+'<div/>'+
                    '<div>地址：'+posTemp.communityName+(posTemp.buildingNo?posTemp.buildingNo:posTemp.buildingName)+'栋'+posTemp.subNumber+'单元'+posTemp.floorNumber+'层'+posTemp.apartNumber+'室'+'</div>'+
                    '<div><span>热力公司：</span><span>'+posTemp.companyName+'</span></div><div><span>换热站：</span><span>'+posTemp.stationName+'（'+posTemp.stationUnitName+'）</span></div>';
        }


        var tree;
        var companyList=[];
        var stationList=[];
        var communityList=[];
        var postionList=[];
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

        //创建tree的数据
        function createData()
        {
            var data=[];
            for(var i in companyList)
            {
                data.push({text:companyList[i].name+'('+getPositioinCountInArea('company',companyList[i].id)+')',id:companyList[i].id,dtype:'company',children:createStationTree(companyList[i].id)});
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
                data.push({text:stations[i].name+'('+getPositioinCountInArea('station',stations[i].id)+')',id:stations[i].id,dtype:'station',children:createCommunityTree(stations[i].id)});
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
                data.push({text:comms[i].name+'('+getPositioinCountInArea('community',comms[i].id)+')',id:comms[i].id,dtype:'community'});
            }
            return data;
        }

        function onNodeClick(node)
        {
            var points=[];
          /*  if(node.data.dtype=='company')
            {
                 tree.expandNode(node);
            }
            else*/
            if(node.data.dtype=='station')
            {
                points=_.filter(postionList,function (item) {
                    return item.stationID==node.data.id;
                });

            }
            else  if(node.data.dtype=='community')
            {
                points=_.filter(postionList,function (item) {
                    return item.communityID==node.data.id;
                });
            }
            if(points.length>0)
            {

                drawMarker(points);
            }
            else {
                map.clearOverlays();
                clearPositionInfo();
            }

            //alert(JSON.stringify(points));
        }

        $(function ()
        {
            tree = $("#tree1").ligerTree({
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
                },
                onSelect: onNodeClick,
            });
            tree =$("#tree1").ligerGetTreeManager();
            //获取配置
            getAlarmConfig()
                    .then(function(configResult){
                        if(configResult.length>0) {
                            alarmConfig =configResult[0];
                        }
                        //分公司
                        $.ajax({
                            url:"/admin/company/getPaging",
                            type:"POST",
                            data:{"searchParentID": -2,
                                "page": 1,
                                "pagesize": 20
                            },
                            success:function(data){
                                var companies = JSON.parse(data);
                                if (companies.Rows.length > 0) {
                                    companyList=_.filter(companies.Rows,function(item){return item.status==1;});
                                }
                            },
                            error:function(err){

                            }
                        });

                        $.ajax({
                            url:"/admin/heatexchangestation/getPaging",
                            type:"POST",
                            data:{
                                "page": 1,
                                "pagesize": 9999
                            },
                            success:function(data){
                                var stations = JSON.parse(data);
                                stationList=stations.Rows;

                            },
                            error:function(err){

                            }
                        });

                        $.ajax({
                            url:"/admin/community/getPaging",
                            type:"POST",
                            data:{
                                "page": 1,
                                "pagesize": 500000
                            },
                            success:function(data){
                                var communites = JSON.parse(data);
                                communityList=communites.Rows;
                            },
                            error:function(err){

                            }
                        });

                        //获取测温点实时温度数据
                        return getTempList(1,50000);
                    })
                    .then(function(data){

                        postionList=data;
                        f_load();
                        //合并测温点温度数据
                        //savePointList(data);

                        //showLotOfPoints(data);

                    });

            $("#btnSave").on("click",function() {
                var positionID = $("#hdPositionID").val();
                var lati = $("#hdLati").val();
                var longi = $("#hdLongi").val();
                if(!positionID || !lati || !longi) { alert('数据有误！');return ;}
                if (!$("#latiInfo1").text() || !$("#longiInfo1").text())
                {  alert('请修改坐标后保存！');return ;  }

                var manager = $.ligerDialog.waitting('正在保存中,请稍候...'); setTimeout(function () { manager.close(); }, 1000);

                  $.ajax({
                     url:"/admin/position/changeLatiLongi",
                     type:"POST",
                     data:{"id": $("#hdPositionID").val(),
                         "lati": $("#hdLati").val(),
                         "longi": $("#hdLongi").val()
                     },
                      beforeSend: function (request) {
                          request.setRequestHeader("authorization", getToken());
                      },
                     success:function(data){
                         if(data.error.length==0)
                         {
                             var manager = $.ligerDialog.waitting('保存成功！'); setTimeout(function () { manager.close(); }, 1000);
                         }
                         changeMarkerPosition(positionID,longi,lati);
                         clearPositionInfo();
                     },
                     error:function(err){
                         var manager = $.ligerDialog.waitting(err.join(",")); setTimeout(function () { manager.close(); }, 1000);
                     }
                 });
            });

            $("#searchContainer").keydown(function(e){
                if(e.keyCode==13)
                {
                    e.stopPropagation();
                    e.preventDefault();
                    searchAddress();
                }
            });
        });

        $(".nodescount").live('change', function ()
        {
            showNodesCountMessage();
        });


        function f_load()
        {
            var data = createData();
            var op = {
                isExpand: parseInt($("#expandLevel").val()),
                delay: []
            };
            $(".delayChk").each(function ()
            {
                if (this.checked)
                {
                    op.delay.push(parseInt(this.value));
                }
            });
            if (!op.delay.length) op.delay = false;
            tree.set(op);
            var time1 = new Date();
            tree.set('data', data);
            var time2 = new Date();
            var showed = $("#tree1 li").length;
            var h = "节点总数:" + getNodesCount() + ",已渲染节点总数:" + showed + ",耗时:" + (time2 - time1) + "毫秒";
            $("#message").append("<p>" + h + "</p>");
            alert(h);
        }

        //获取区域内测温点的数量
        //参数说明：type: company,station,community；；；；
        //         id:区域id
        function getPositioinCountInArea(type,id)
        {
            var points=[];
            if(type=='company')
            {
                points=_.filter(postionList,function (item) {
                    return item.companyID==id;
                });

            }
            else
                if(type=='station')
            {
                points=_.filter(postionList,function (item) {
                    return item.stationID==id;
                });

            }
            else  if(type=='community')
            {
                points=_.filter(postionList,function (item) {
                    return item.communityID==id;
                });
            }
            return points.length;
        }


        function getNodesCount(level)
        {
            if (level == null) level = getMaxLevel();
            if (level == 0) return 0;
            var sum = 1;
            for (var i = 1; i <= level; i++)
            {
                var value =  $("#nodescount" + i).val();
                if (value == "0" || !value) continue;
                sum = sum * parseInt(value);
            }
            return sum + getNodesCount(level - 1);
        }
        function getMaxLevel()
        {
            for (var i = 4; i >= 1; i--)
            {
                var value =  $("#nodescount" + i).val();
                if (value == "0" || !value) continue;
                return i;
            }
        }
        function showNodesCountMessage()
        {
            $("#nodesCountMessage").html("总节点数:" + getNodesCount());
        }


        //在信息窗中显示测温点信息
        function showPositionInfo(marker)
        {
            var prevPositionID=$("#hdPositionID").val();
            $("#positionInfo").html(marker.address);
            $("#longiInfo").html(marker.longi);
            $("#hdLongi").val(marker.longi);
            $("#latiInfo").html(marker.lati);
            $("#hdLati").val(marker.lati);
            $("#hdPositionID").val(marker.positionID);
            if(prevPositionID!=marker.positionID) {
                $("#latiInfo1").html('');
                $("#longiInfo1").html('');
            }

        }

        function clearPositionInfo()
        {
            $("#positionInfo").html('');
            $("#longiInfo").html('');
            $("#hdLongi").val('');
            $("#latiInfo").html('');
            $("#hdLati").val('');
            $("#hdPositionID").val('');
            $("#longiInfo1").html('');
            $("#latiInfo1").html('');
        }

        function changeMarkerPosition(positionID,longi,lati)
        {
            var allOverlay = map.getOverlays();
            for (var i = 0; i < allOverlay.length -1; i++){
                if(allOverlay[i].positionID==positionID){
                    allOverlay[i].setPosition(new BMap.Point(longi,lati));
                    break;
                }
            }

            var position=_.find(postionList,function (item) { return item.id==positionID;});
            if(position)
            {
                position.lati=lati;
                position.longi=longi;
            }

        }


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
    </script>
</head>
<body  class="nav-sm">
<div id="container" style="width:100%;position:static;height:1000px;"></div>
<div style="width:290px; height:600px; margin:10px; position: fixed; top:0;left:0; border:1px solid #ccc; overflow:auto;background-color:#fff;  ">
   <div style="width:100%;height:40px;line-height:40px;font-size:15px;padding-left:10px;background-color:#efefef;">测温点坐标调整工具</div>
    <div style="color:red;padding:2px 10px;border-bottom:solid 1px #ccc;margin-bottom:5px;">数据级别：公司->换热站->小区</div>
    <ul id="tree1"></ul>
</div>
<div id="help">
</div>
<div id="message">

</div>
<div style="display:none">

</div>
<div id="oprationDesk" style="position: fixed;right:0;bottom:100px;background-color:#fff;padding:10px;min-width:240px;">
    <div><h3>调整坐标</h3></div>
    <hr/>
    <div id="positionInfo"></div>
    <br/>
    <div>坐标信息：</div>
    <hr/>
    <div>经度:<span id="longiInfo"></span></div>
    <div>纬度:<span id="latiInfo"></span></div>
    <br/>
    <div>修改后的坐标：</div>
    <hr/>
    <div>经度:<span id="longiInfo1"></span></div>
    <div>纬度:<span id="latiInfo1"></span></div>
    <br/>
    <div><button class="btn btn-info" id="btnSave" >保存</button></div>
    <div id="msg"></div>
    <input type="hidden" name="hdPositionID" id="hdPositionID" value="0">
    <input type="hidden" name="hdLati" id="hdLati" value="0">
    <input type="hidden" name="hdLongi" id="hdLongi" value="0">
</div>

<div class="input-group" style="position: fixed;top:0;right:0;background-color:#fff;padding:5px 10px;" id="searchContainer">
    <input type="text" class="form-control" name="searchInput" placeholder="请输入地址">
    <span class="input-group-btn">
						<button class="btn btn-default" type="button" style="line-height:16px;"  onclick="searchAddress()">
							查找
						</button>
					</span>
</div>
</body>
</html>

