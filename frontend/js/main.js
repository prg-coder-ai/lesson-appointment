// 页面加载完成后，自动请求API，渲染数据
window.onload = function() {
    // 调用api.js中的请求方法，获取数据库数据
    getRequest(api.getDataList, function(dataList) {
        // 获取渲染容器
        const container = document.getElementById("dataContainer");
        // 清空容器（避免重复渲染）
        container.innerHTML = "";
        
        // 循环渲染数据（根据后端返回的实体类字段调整，如name、value）
        dataList.forEach(item => {
            const itemDiv = document.createElement("div");
            itemDiv.className = "data-item";
            // 渲染数据（替换为你的实体类字段，如item.id、item.name）
            itemDiv.innerHTML = `
                <p>ID：${item.id}</p>
                <p>名称：${item.name}</p>
                <p>内容：${item.content}</p>
                <hr>
            `;
            container.appendChild(itemDiv);
        });
    });
}