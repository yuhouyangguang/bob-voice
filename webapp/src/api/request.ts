import axios, { AxiosError } from 'axios';
import type { AxiosResponse, InternalAxiosRequestConfig } from 'axios';

const request = axios.create({
  baseURL: '/api/v1',
  withCredentials: true,
  timeout: 60000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor: attach token from localStorage if present
request.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem('bob_voice_token');
    if (token && config.headers) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    return config;
  },
  (error: AxiosError) => {
    console.error('[DEBUG] request interceptor error:', error.message);
    return Promise.reject(error);
  }
);

// Response interceptor: handle 401 → redirect to /login
request.interceptors.response.use(
  (response: AxiosResponse) => response,
  (error: AxiosError) => {
    const status = error.response?.status;
    const url = error.config?.url ?? '';

    if (status === 401 && !url.includes('/auth/login')) {
      // Clear stored auth state
      localStorage.removeItem('bob_voice_token');
      // Redirect to login
      window.location.href = '/login';
    }

    const message =
      (error.response?.data as { message?: string })?.message ??
      error.message ??
      '未知错误';

    console.error(`[DEBUG] API error ${status} on ${url}:`, message);
    return Promise.reject(error);
  }
);

export default request;
