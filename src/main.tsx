import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'

// src/main.tsx
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const swUrl = new URL('sw.js', import.meta.env.BASE_URL).toString()
    navigator.serviceWorker.register(swUrl).catch(() => {})
  })
}


ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
