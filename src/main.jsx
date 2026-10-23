import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import PermitTracker from './apps/permit-tracker/PermitTracker.jsx'
import './index.css'

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<PermitTracker />} />
      <Route path="/permit-tracker" element={<PermitTracker />} />
    </Routes>
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <AppRoutes />
    </BrowserRouter>
  </StrictMode>
)
