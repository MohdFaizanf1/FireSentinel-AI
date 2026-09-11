import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: '#0D1117',
            color: '#F0E6D3',
            border: '1px solid rgba(255,107,0,0.3)',
            fontFamily: 'Barlow, sans-serif',
          },
        }}
      />
    </BrowserRouter>
  </React.StrictMode>
)
