import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use(config => {
  const token = localStorage.getItem('mwz_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      const url = err.config?.url || ''
      // Email and chat endpoints handle 401 gracefully in their own catch blocks
      // — don't redirect to login for these, they show an inline error instead
      const noRedirect = ['/email/', '/chat/unread']
      if (!noRedirect.some(u => url.includes(u))) {
        localStorage.removeItem('mwz_user')
        localStorage.removeItem('mwz_token')
        window.location.href = '/login'
      }
    }
    return Promise.reject(err)
  }
)

export default api
