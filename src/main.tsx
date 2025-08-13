import React from 'react'
import ReactDOM from 'react-dom/client'
import AppBootstrap from './AppBootstrap.tsx'
import './index.css'

if ((import.meta as any).env?.PROD) {
  console.log = () => {};
  console.warn = () => {};
  console.error = () => {};
  console.debug = () => {};
} 

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppBootstrap />
  </React.StrictMode>,
)