import axios from 'axios';
import { ElMessage } from 'element-plus';

export const http = axios.create({
  baseURL: '/api',
  timeout: 60_000,
});

http.interceptors.response.use(
  (res) => res,
  (err) => {
    const data = err?.response?.data;
    const message = data?.message ?? err?.message ?? '请求失败';
    ElMessage.error(message);
    return Promise.reject(err);
  },
);
