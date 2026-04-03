
/**
 * 通用API数据获取函数
 * @param {string} url - 请求的API地址
 * @param {Object} options - fetch 选项，如 method, headers, body 等
 * @returns {Promise<any>} - 解析后的JSON 或抛出错误
 */
async function fetchData(url, options = {}) {
  try {
    const response = await fetch(url, options);
    if (!response.ok) {
      throw new Error(`API 请求失败: ${response.status} ${response.statusText}`);
    }
    // 兼容部分无内容返回
    const text = await response.text();
    try {
      return text ? JSON.parse(text) : {};
    } catch (e) {
      // 返回非JSON时直接返回文本
      return text;
    }
  } catch (error) {
    console.error('获取数据出错:', error);
    throw error;
  }
}
/**
 * 更新实体的数值
 * @param {string} entityApi - 实体的API地址，如 '/api/course/123'
 * @param {Object} updateData - 需要更新的字段和值，如 {name: '新课程名', status: '已确认'}
 * @returns {Promise<any>} - 返回API响应
 */
async function updateEntityValue(entityApi, updateData) {
  // 默认以PUT更新，部分API可能需要PATCH
  return await fetchData(entityApi, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(updateData)
  });
}
/**
 * 添加一个新实体
 * @param {string} entityApi - 实体对应的API地址，如 '/api/course'
 * @param {Object} entityData - 实体的数据对象
 * @returns {Promise<any>} - 返回API响应
 */
async function createEntity(entityApi, entityData) {
  return await fetchData(entityApi, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(entityData)
  });
}
