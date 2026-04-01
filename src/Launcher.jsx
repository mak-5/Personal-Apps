import { useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'

const APPS = [
  {
    path: '/flight-dashboard',
    name: 'FlightScan',
    tagline: 'Deal hunter · price tracker',
    icon: '✈',
    accent: '#00d4aa',
    bg: 'linear-gradient(135deg, #0a1f1c 0%, #0c1a26 100%)',
    status: 'live',
  },
  {
    path: '/finance-pwa',
    name: 'FinanceOS',
    tagline: 'Budgets · transactions · net worth',
    icon: '◈',
    accent: '#7c6af7',
    bg: 'linear-gradient(135deg, #120f1f 0%, #0f1420 100%)',
    status: 'live',
  },
  {
    path: '/returns-tracker',
    name: 'Returns Tracker',
    tagline: 'Investment growth · returns · performance',
    icon: '📈',
    accent: '#7c6af7',
    bg: 'linear-gradient(135deg, #0f0c1e 0%, #0c0f1a 100%)',
    status: 'live',
  },
  {
    path: null,
    name: 'PL Simulator',
    tagline: 'Premier League points table',
    icon: '⚽',
    accent: '#38003c',
    bg: 'linear-gradient(135deg, #0f0a12 0%, #130a0f 100%)',
    status: 'soon',
  },
]

function Clock() {
  const [time, setTime] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  return (
    <div style={{ textAlign: 'right' }}>
      <div style={{ fontSize: '28px', fontFamily: "'Syne', sans-serif", fontWeight: 800, letterSpacing: '-1px', lineHeight: 1 }}>
        {time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
      </div>
      <div style={{ fontSize: '11px', color: '#555', marginTop: '2px' }}>
        {time.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
      </div>
    </div>
  )
}

export default function Launcher() {
  const navigate = useNavigate()
  const [hovered, setHovered] = useState(null)

  return (
    <div style={{
      fontFamily: "'DM Mono', monospace",
      background: 'var(--bg)',
      minHeight: '100dvh',
      padding: '28px 24px',
      paddingTop: 'calc(28px + env(safe-area-inset-top))',
      paddingBottom: 'calc(28px + env(safe-area-inset-bottom))',
      maxWidth: '560px',
      margin: '0 auto',
      display: 'flex',
      flexDirection: 'column',
    }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Syne:wght@700;800&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '40px' }}>
        <div>
          <div style={{ fontSize: '13px', color: '#555', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '4px' }}>
            Personal Hub
          </div>
          <div style={{ fontSize: '24px', fontFamily: "'Syne', sans-serif", fontWeight: 800, letterSpacing: '-0.5px' }}>
            Akshay<span style={{ color: 'var(--accent)' }}>.</span>apps
          </div>
        </div>
        <Clock />
      </div>

      {/* App Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', flex: 1 }}>
        {APPS.map((app, i) => (
          <div
            key={app.name}
            onClick={() => app.path && navigate(app.path)}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
            style={{
              background: app.bg,
              border: `1px solid ${hovered === i && app.path ? app.accent + '55' : '#1e1e2e'}`,
              borderRadius: '16px',
              padding: '22px 24px',
              cursor: app.path ? 'pointer' : 'default',
              opacity: app.status === 'soon' ? 0.5 : 1,
              transform: hovered === i && app.path ? 'translateX(4px)' : 'translateX(0)',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              gap: '20px',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            {/* Glow blob */}
            <div style={{
              position: 'absolute', top: '-20px', right: '-20px',
              width: '80px', height: '80px',
              background: app.accent,
              borderRadius: '50%',
              opacity: hovered === i && app.path ? 0.12 : 0.06,
              filter: 'blur(20px)',
              transition: 'opacity 0.3s',
              pointerEvents: 'none',
            }} />

            {/* Icon */}
            <div style={{
              width: '52px', height: '52px',
              background: app.accent + '22',
              border: `1px solid ${app.accent}44`,
              borderRadius: '14px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '22px',
              flexShrink: 0,
            }}>
              {app.icon}
            </div>

            {/* Text */}
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '16px', fontFamily: "'Syne', sans-serif", fontWeight: 800, color: '#fff', letterSpacing: '-0.3px' }}>
                {app.name}
              </div>
              <div style={{ fontSize: '11px', color: '#666', marginTop: '3px' }}>{app.tagline}</div>
            </div>

            {/* Status / Arrow */}
            <div style={{ flexShrink: 0 }}>
              {app.status === 'soon'
                ? <span style={{ fontSize: '10px', color: '#444', textTransform: 'uppercase', letterSpacing: '1px' }}>Soon</span>
                : <span style={{ fontSize: '18px', color: app.accent, opacity: hovered === i ? 1 : 0.4, transition: 'opacity 0.2s' }}>→</span>
              }
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{ marginTop: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: '10px', color: '#333', textTransform: 'uppercase', letterSpacing: '1px' }}>
          {APPS.filter(a => a.status === 'live').length} apps live
        </div>
        <div style={{ fontSize: '10px', color: '#333' }}>
          Add to homescreen for best experience
        </div>
      </div>
    </div>
  )
}
