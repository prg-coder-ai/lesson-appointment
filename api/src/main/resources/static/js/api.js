// API请求封装（简化JS请求，避免重复代码）
const api = {
    // 后端API接口地址（相对路径，端口由Spring Boot配置决定，无需写localhost:8088）
    getDataList: "/api/v1/data/list" // 对应后端IndexController的API接口
};

// 封装GET请求（获取数据库数据）
function getRequest(url, callback) {
    fetch(url, {
        method: "GET",
        headers: {
            "Content-Type": "application/json;charset=UTF-8"
        }
    })
    .then(response => response.json()) // 解析后端返回的JSON数据
    .then(data => {
        callback(data); // 回调函数，将数据传递给页面渲染
    })
    .catch(error => {
        console.error("API请求失败：", error);
    });
}