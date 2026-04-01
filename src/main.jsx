import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom'
import Launcher from './Launcher.jsx'
import FlightDashboard from './apps/flight-dashboard/FlightDashboard.jsx'
import FinancePWA from './apps/finance-pwa/FinancePWA.jsx'
import ReturnsTracker from './apps/returns-tracker/ReturnsTracker.jsx'
import { useAppUrlOpen } from './hooks/useSiri.js'
import './index.css'

// Handles Siri / deep link navigation (akshay-apps://flight-dashboard)
function AppRoutes() {
  const navigate = useNavigate()
  useAppUrlOpen(navigate)
  return (
    <Routes>
      <Route path="/" element={<Launcher />} />
      <Route path="/flight-dashboard" element={<FlightDashboard />} />
      <Route path="/finance-pwa" element={<FinancePWA />} />
      <Route path="/returns-tracker" element={<ReturnsTracker />} />
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
