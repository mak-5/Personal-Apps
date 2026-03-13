import { useNavigate } from 'react-router-dom'

export default function FinancePWA() {
  const navigate = useNavigate()
  return (
    <div style={{ fontFamily:"'DM Mono',monospace", background:'#0c0c0f', minHeight:'100dvh', color:'#e8e8e0', padding:'20px', paddingTop:'calc(20px + env(safe-area-inset-top))', display:'flex', flexDirection:'column' }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Syne:wght@700;800&display=swap" rel="stylesheet" />
      <div style={{ display:'flex', alignItems:'center', gap:'14px', marginBottom:'40px' }}>
        <button onClick={()=>navigate('/')} style={{ background:'transparent', border:'1px solid #2a2a3a', color:'#555', padding:'6px 10px', borderRadius:'6px', cursor:'pointer', fontSize:'14px' }}>←</button>
        <div>
          <div style={{ fontSize:'18px', fontFamily:"'Syne',sans-serif", fontWeight:800 }}>◈ FINANCE<span style={{color:'#7c6af7'}}>OS</span></div>
          <div style={{ fontSize:'10px', color:'#444' }}>budgets · transactions · net worth</div>
        </div>
      </div>
      <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:'16px', textAlign:'center' }}>
        <div style={{ fontSize:'48px' }}>◈</div>
        <div style={{ fontFamily:"'Syne',sans-serif", fontWeight:800, fontSize:'20px' }}>Coming Soon</div>
        <div style={{ fontSize:'12px', color:'#555', maxWidth:'280px', lineHeight:1.7 }}>
          Your Plaid + FastAPI + Supabase finance PWA will live here.<br/>
          Drop in your existing components and they'll route automatically.
        </div>
        <div style={{ marginTop:'8px', fontSize:'11px', color:'#333', fontFamily:"'Syne',sans-serif", border:'1px solid #1e1e2e', padding:'10px 20px', borderRadius:'8px' }}>
          → Add your components to<br/><span style={{color:'#7c6af7'}}>src/apps/finance-pwa/</span>
        </div>
      </div>
    </div>
  )
}
