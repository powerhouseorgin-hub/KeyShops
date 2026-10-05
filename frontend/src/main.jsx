import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './styles/index.css'
import { AuthProvider } from './context/AuthContext.jsx'
import AppUpdateGate from './components/AppUpdateGate.jsx'
import { DownloadsProvider } from './context/DownloadsContext.jsx'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <DownloadsProvider>
        <App />
      </DownloadsProvider>
    </AuthProvider>
    <AppUpdateGate />
  </React.StrictMode>,
)
