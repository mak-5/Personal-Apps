import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'

const AIRPORTS = [
  { code: 'DFW', label: 'Dallas (DFW)' },
  { code: 'DAL', label: 'Dallas Love (DAL)' },
  { code: 'JFK', label: 'New York (JFK)' },
  { code: 'LAX', label: 'Los Angeles (LAX)' },
  { code: 'ORD', label: 'Chicago (ORD)' },
  { code: 'MIA', label: 'Miami (MIA)' },
  { code: 'SFO', label: 'San Francisco (SFO)' },
  { code: 'LHR', label: 'London (LHR)' },
  { code: 'CDG', label: 'Paris (CDG)' },
  { code: 'NRT', label: 'Tokyo (NRT)' },
  { code: 'CUN', label: 'Cancun (CUN)' },
  { code: 'anywhere', label: '✈ Anywhere (explore)' },
]

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

const MOCK_FLIGHTS = [
  { id: 1, airline: 'American', from: 'DFW', to: 'JFK', price: 187, dTime: Date.now()/1000+86400*3, duration: 240, stops: 0 },
  { id: 2, airline: 'Delta',    from: 'DFW', to: 'JFK', price: 203, dTime: Date.now()/1000+86400*5, duration: 270, stops: 0 },
  { id: 3, airline: 'United',   from: 'DFW', to: 'JFK', price: 165, dTime: Date.now()/1000+86400*7, duration: 300, stops: 1 },
  { id: 4, airline: 'Southwest',from: 'DFW', to: 'JFK', price: 149, dTime: Date.now()/1000+86400*10,duration: 240, stops: 0 },
  { id: 5, airline: 'Spirit',   from: 'DFW', to: 'JFK', price: 89,  dTime: Date.now()/1000+86400*14,duration: 330, stops: 1 },
]

function formatPrice(n) { return n != null ? `$${Math.round(n)}` : '—' }
function formatDate(ts) {
  return new Date(ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
function makePriceHistory(price, days = 14) {
  let p = price * (0.85 + Math.random() * 0.3)
  return Array.from({ length: days + 1 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (days - i))
    p = p * (0.97 + Math.random() * 0.06)
    return { date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), price: Math.round(i === days ? price : p) }
  })
}
function generateCalendarMonth(year, month, flights) {
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells = Array.from({ length: firstDay }, () => ({ day: '', price: null }))
  for (let d = 1; d <= daysInMonth; d++) {
    const flight = flights.find(f => { const fd = new Date(f.dTime*1000); return fd.getMonth()===month && fd.getDate()===d })
    cells.push({ day: d, price: flight ? flight.price : (Math.random() > 0.4 ? Math.round(100 + Math.random()*400) : null) })
  }
  return cells
}
function buildLinks(from, to) {
  const today = new Date().toISOString().slice(0,10)
  const next = new Date(Date.now()+30*86400000).toISOString().slice(0,10)
  const dest = to === 'anywhere' ? 'anywhere' : to
  return {
    google: `https://www.google.com/travel/flights#search;f=${from};t=${dest};d=${today};r=${next}`,
    kayak: `https://www.kayak.com/flights/${from}-${dest}/${today}/${next}?sort=price_a`,
    skyscanner: `https://www.skyscanner.com/transport/flights/${from.toLowerCase()}/${dest.toLowerCase()}/${today.replace(/-/g,'').slice(2)}/`,
  }
}

const S = {
  select: { background:'#0c0c0f', border:'1px solid #2a2a3a', color:'#e8e8e0', padding:'9px 12px', borderRadius:'6px', fontSize:'12px', width:'100%', fontFamily:"'DM Mono',monospace", cursor:'pointer' },
  tab: (active) => ({ background:'transparent', border:'none', borderBottom: active ? '2px solid #00d4aa' : '2px solid transparent', color: active ? '#00d4aa' : '#555', padding:'8px 14px', cursor:'pointer', fontSize:'11px', fontFamily:"'Syne',sans-serif", fontWeight:700, textTransform:'uppercase', letterSpacing:'1px', marginBottom:'-1px' }),
}

export default function FlightDashboard() {
  const navigate = useNavigate()
  const [from, setFrom] = useState('DFW')
  const [to, setTo]     = useState('anywhere')
  const [flights, setFlights] = useState(MOCK_FLIGHTS)
  const [loading, setLoading] = useState(false)
  const [sortBy, setSortBy]   = useState('price')
  const [tab, setTab]         = useState('results')
  const [selected, setSelected] = useState(null)
  const [alerts, setAlerts]   = useState([{ id:1, route:'DFW → Anywhere', threshold:200, active:true }])
  const [alertPrice, setAlertPrice] = useState('')
  const [calMonth, setCalMonth] = useState(new Date().getMonth())
  const [calYear, setCalYear]   = useState(new Date().getFullYear())
  const [apiKey, setApiKey] = useState(localStorage.getItem('tequila_key') || '')
  const [showKey, setShowKey] = useState(false)

  const sorted = [...flights].sort((a,b) => sortBy==='price' ? a.price-b.price : sortBy==='duration' ? a.duration-b.duration : a.dTime-b.dTime)
  const minPrice = Math.min(...flights.map(f=>f.price))
  const avgPrice = Math.round(flights.reduce((a,f)=>a+f.price,0)/flights.length)
  const links = buildLinks(from, to)
  const calData = generateCalendarMonth(calYear, calMonth, flights)
  const history = makePriceHistory(selected?.price || flights[0]?.price || 200)

  const search = async () => {
    setLoading(true)
    if (apiKey) {
      try {
        const today = new Date().toISOString().slice(0,10)
        const future = new Date(Date.now()+90*86400000).toISOString().slice(0,10)
        const res = await fetch(`https://api.tequila.kiwi.com/v2/search?fly_from=${from}&fly_to=${to==='anywhere'?'anywhere':to}&date_from=${today}&date_to=${future}&nights_in_dst_from=2&nights_in_dst_to=14&max_fly_duration=24&ret_from_diff_city=false&ret_to_diff_city=false&one_for_city=1&vehicle_type=aircraft&curr=USD&locale=en-us&limit=10&sort=price`, {
          headers: { apikey: apiKey }
        })
        const data = await res.json()
        if (data.data?.length) {
          setFlights(data.data.map((f,i) => ({
            id: i,
            airline: f.airlines?.[0] || 'Unknown',
            from: f.flyFrom,
            to: f.flyTo,
            price: f.price,
            dTime: f.dTime,
            duration: Math.round(f.duration?.total / 60),
            stops: f.route?.length - 1 || 0,
            deep_link: f.deep_link,
          })))
          setLoading(false)
          return
        }
      } catch(e) { console.warn('API error, falling back to demo', e) }
    }
    // Demo fallback
    setTimeout(() => {
      setFlights(MOCK_FLIGHTS.map(f => ({ ...f, price: f.price + Math.round((Math.random()-.5)*40) })))
      setLoading(false)
    }, 800)
  }

  const saveKey = (k) => { setApiKey(k); localStorage.setItem('tequila_key', k) }

  return (
    <div style={{ fontFamily:"'DM Mono',monospace", background:'#0c0c0f', minHeight:'100dvh', color:'#e8e8e0', padding:'20px', paddingTop:'calc(20px + env(safe-area-inset-top))', paddingBottom:'calc(20px + env(safe-area-inset-bottom))', maxWidth:'960px', margin:'0 auto' }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Syne:wght@700;800&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'24px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:'14px' }}>
          <button onClick={() => navigate('/')} style={{ background:'transparent', border:'1px solid #2a2a3a', color:'#555', padding:'6px 10px', borderRadius:'6px', cursor:'pointer', fontSize:'14px' }}>←</button>
          <div>
            <div style={{ fontSize:'18px', fontFamily:"'Syne',sans-serif", fontWeight:800 }}>✈ FLIGHT<span style={{color:'#00d4aa'}}>SCAN</span></div>
            <div style={{ fontSize:'10px', color:'#444' }}>deal hunter · price tracker</div>
          </div>
        </div>
        <button onClick={() => setShowKey(v=>!v)} style={{ background:'transparent', border:'1px solid #2a2a3a', color: apiKey ? '#00d4aa' : '#666', padding:'6px 12px', borderRadius:'6px', cursor:'pointer', fontSize:'11px' }}>
          {apiKey ? '✓ API Key' : '⚙ API Key'}
        </button>
      </div>

      {/* API Key panel */}
      {showKey && (
        <div style={{ background:'#13131a', border:'1px solid #2a2a3a', borderRadius:'10px', padding:'16px', marginBottom:'16px' }}>
          <div style={{ fontSize:'11px', color:'#555', marginBottom:'8px' }}>
            Free key from <a href="https://tequila.kiwi.com" target="_blank" rel="noreferrer" style={{color:'#00d4aa'}}>tequila.kiwi.com</a> · without it, runs on demo data
          </div>
          <div style={{ display:'flex', gap:'8px' }}>
            <input value={apiKey} onChange={e=>saveKey(e.target.value)} placeholder="Paste Tequila API key..." style={{ ...S.select, flex:1 }} />
            <button onClick={()=>setShowKey(false)} style={{ background:'#00d4aa', color:'#000', border:'none', padding:'8px 16px', borderRadius:'6px', cursor:'pointer', fontFamily:"'Syne',sans-serif", fontWeight:700, fontSize:'12px' }}>Save</button>
          </div>
        </div>
      )}

      {/* Search */}
      <div style={{ background:'#13131a', border:'1px solid #1e1e2e', borderRadius:'12px', padding:'16px', marginBottom:'16px', display:'grid', gridTemplateColumns:'1fr 1fr auto auto', gap:'10px', alignItems:'end' }}>
        <div>
          <div style={{ fontSize:'10px', color:'#555', marginBottom:'5px', textTransform:'uppercase', letterSpacing:'1px' }}>From</div>
          <select value={from} onChange={e=>setFrom(e.target.value)} style={S.select}>
            {AIRPORTS.filter(a=>a.code!=='anywhere').map(a=><option key={a.code} value={a.code}>{a.label}</option>)}
          </select>
        </div>
        <div>
          <div style={{ fontSize:'10px', color:'#555', marginBottom:'5px', textTransform:'uppercase', letterSpacing:'1px' }}>To</div>
          <select value={to} onChange={e=>setTo(e.target.value)} style={S.select}>
            {AIRPORTS.map(a=><option key={a.code} value={a.code}>{a.label}</option>)}
          </select>
        </div>
        <div style={{ fontSize:'10px', color:'#555' }}>{apiKey ? '● Live' : '● Demo'}</div>
        <button onClick={search} disabled={loading} style={{ background: loading ? '#1a2a26' : '#00d4aa', color: loading ? '#00d4aa' : '#000', border:'none', padding:'10px 20px', borderRadius:'8px', fontFamily:"'Syne',sans-serif", fontWeight:700, fontSize:'13px', cursor: loading?'not-allowed':'pointer', whiteSpace:'nowrap' }}>
          {loading ? 'Scanning...' : 'Search'}
        </button>
      </div>

      {/* Stats */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'10px', marginBottom:'16px' }}>
        {[
          { label:'Lowest', value:formatPrice(minPrice), color:'#00d4aa' },
          { label:'Average', value:formatPrice(avgPrice), color:'#e8e8e0' },
          { label:'Results', value:flights.length, color:'#e8e8e0' },
          { label:'Alerts', value:alerts.filter(a=>a.active).length, color:'#f5c518' },
        ].map((s,i)=>(
          <div key={i} style={{ background:'#13131a', border:'1px solid #1e1e2e', borderRadius:'10px', padding:'14px', textAlign:'center' }}>
            <div style={{ fontSize:'20px', fontFamily:"'Syne',sans-serif", fontWeight:800, color:s.color }}>{s.value}</div>
            <div style={{ fontSize:'10px', color:'#555', marginTop:'3px', textTransform:'uppercase', letterSpacing:'1px' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Deep links */}
      <div style={{ display:'flex', gap:'8px', marginBottom:'16px', flexWrap:'wrap', alignItems:'center' }}>
        <span style={{ fontSize:'10px', color:'#444', textTransform:'uppercase', letterSpacing:'1px' }}>Open on →</span>
        {[{name:'Google Flights',url:links.google,color:'#4285f4'},{name:'Kayak',url:links.kayak,color:'#ff690f'},{name:'Skyscanner',url:links.skyscanner,color:'#0770e3'}].map(s=>(
          <a key={s.name} href={s.url} target="_blank" rel="noreferrer" style={{ border:`1px solid ${s.color}44`, color:s.color, padding:'5px 12px', borderRadius:'20px', fontSize:'11px', textDecoration:'none', fontFamily:"'Syne',sans-serif", fontWeight:700 }}>↗ {s.name}</a>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:'2px', borderBottom:'1px solid #1e1e2e', marginBottom:'14px' }}>
        {['results','calendar','history','alerts'].map(t=>(
          <button key={t} onClick={()=>setTab(t)} style={S.tab(tab===t)}>{t === 'alerts' ? `Alerts (${alerts.length})` : t.charAt(0).toUpperCase()+t.slice(1)}</button>
        ))}
      </div>

      {/* Results */}
      {tab==='results' && (
        <div style={{ background:'#13131a', border:'1px solid #1e1e2e', borderRadius:'12px', overflow:'hidden' }}>
          <div style={{ display:'flex', justifyContent:'space-between', padding:'12px 16px', borderBottom:'1px solid #1a1a26', alignItems:'center' }}>
            <span style={{ fontSize:'11px', color:'#555' }}>{flights.length} deals · {apiKey ? 'live data' : 'demo — add API key for live prices'}</span>
            <div style={{ display:'flex', gap:'6px' }}>
              {['price','duration','date'].map(s=>(
                <button key={s} onClick={()=>setSortBy(s)} style={{ background:sortBy===s?'#00d4aa18':'transparent', border:sortBy===s?'1px solid #00d4aa44':'1px solid #1e1e2e', color:sortBy===s?'#00d4aa':'#555', padding:'3px 8px', borderRadius:'4px', fontSize:'10px', cursor:'pointer', fontFamily:'inherit', textTransform:'uppercase' }}>{s}</button>
              ))}
            </div>
          </div>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', minWidth:'500px' }}>
              <thead>
                <tr style={{ fontSize:'10px', color:'#444', textTransform:'uppercase', letterSpacing:'1px' }}>
                  {['Airline','Route','Date','Duration','Stops','Price',''].map((h,i)=>(
                    <th key={i} style={{ padding:'8px 14px', textAlign: i>=4?'center':'left', fontWeight:400 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((f,i)=>(
                  <tr key={f.id} onClick={()=>setSelected(f)} style={{ borderTop:'1px solid #1a1a26', background: selected?.id===f.id ? '#0a1f1c' : i%2===0?'transparent':'#0f0f15', cursor:'pointer' }}>
                    <td style={{ padding:'11px 14px', fontSize:'12px' }}>{f.airline}</td>
                    <td style={{ padding:'11px 14px', fontSize:'12px', color:'#00d4aa' }}>{f.from} → {f.to}</td>
                    <td style={{ padding:'11px 14px', fontSize:'12px' }}>{formatDate(f.dTime)}</td>
                    <td style={{ padding:'11px 14px', fontSize:'12px', color:'#888' }}>{Math.floor(f.duration/60)}h {f.duration%60}m</td>
                    <td style={{ padding:'11px 14px', fontSize:'12px', textAlign:'center', color: f.stops===0?'#00d4aa':'#f5c518' }}>{f.stops===0?'Direct':`${f.stops}x`}</td>
                    <td style={{ padding:'11px 14px', textAlign:'center' }}>
                      <span style={{ fontFamily:"'Syne',sans-serif", fontWeight:800, fontSize:'15px', color: f.price===minPrice?'#00d4aa':'#e8e8e0' }}>{formatPrice(f.price)}</span>
                      {f.price===minPrice && <div style={{ fontSize:'8px', color:'#00d4aa' }}>BEST</div>}
                    </td>
                    <td style={{ padding:'11px 14px', textAlign:'center' }}>
                      <a href={f.deep_link || links.google} target="_blank" rel="noreferrer" onClick={e=>e.stopPropagation()} style={{ background:'#00d4aa18', border:'1px solid #00d4aa44', color:'#00d4aa', padding:'3px 10px', borderRadius:'4px', fontSize:'10px', textDecoration:'none', fontFamily:"'Syne',sans-serif", fontWeight:700 }}>Book</a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Calendar */}
      {tab==='calendar' && (
        <div style={{ background:'#13131a', border:'1px solid #1e1e2e', borderRadius:'12px', padding:'20px' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'16px' }}>
            <div style={{ fontFamily:"'Syne',sans-serif", fontWeight:800, fontSize:'16px' }}>{MONTHS[calMonth]} {calYear}</div>
            <div style={{ display:'flex', gap:'6px' }}>
              {[[-1,'←'],[1,'→']].map(([d,l])=>(
                <button key={l} onClick={()=>{ let m=calMonth+d,y=calYear; if(m<0){m=11;y--} if(m>11){m=0;y++} setCalMonth(m);setCalYear(y) }} style={{ background:'transparent', border:'1px solid #2a2a3a', color:'#888', width:'30px', height:'30px', borderRadius:'6px', cursor:'pointer' }}>{l}</button>
              ))}
            </div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:'3px' }}>
            {['S','M','T','W','T','F','S'].map((d,i)=><div key={i} style={{ textAlign:'center', fontSize:'10px', color:'#444', paddingBottom:'4px' }}>{d}</div>)}
            {calData.map((day,i)=>{
              const prices = calData.filter(d=>d.price).map(d=>d.price)
              const min=Math.min(...prices), max=Math.max(...prices)
              const ratio = day.price ? (day.price-min)/(max-min+1) : null
              const bg = ratio==null ? '#1a1a1a' : `hsl(${Math.round(140-ratio*120)},60%,${Math.round(20+(1-ratio)*20)}%)`
              return (
                <div key={i} title={day.price ? `${formatPrice(day.price)}` : ''} style={{ background:bg, borderRadius:'4px', padding:'4px 2px', textAlign:'center', cursor:day.price?'pointer':'default', border:'1px solid rgba(255,255,255,0.04)' }}>
                  <div style={{ fontSize:'9px', color:'#888' }}>{day.day}</div>
                  {day.price && <div style={{ fontSize:'8px', color:'#e8e8e0' }}>{formatPrice(day.price)}</div>}
                </div>
              )
            })}
          </div>
          <div style={{ display:'flex', gap:'16px', justifyContent:'center', marginTop:'14px' }}>
            {[['hsl(140,60%,30%)','Cheapest'],['hsl(20,60%,25%)','Priciest']].map(([c,l])=>(
              <div key={l} style={{ display:'flex', alignItems:'center', gap:'6px', fontSize:'10px', color:'#555' }}>
                <div style={{ width:'14px', height:'14px', background:c, borderRadius:'3px' }} /> {l}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Price History */}
      {tab==='history' && (
        <div style={{ background:'#13131a', border:'1px solid #1e1e2e', borderRadius:'12px', padding:'20px' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'16px' }}>
            <div>
              <div style={{ fontFamily:"'Syne',sans-serif", fontWeight:800, fontSize:'16px' }}>Price History</div>
              <div style={{ fontSize:'11px', color:'#555', marginTop:'2px' }}>{selected ? `${selected.airline} · ${selected.from}→${selected.to}` : 'Click a flight in Results to track it'}</div>
            </div>
            <div style={{ fontSize:'22px', fontFamily:"'Syne',sans-serif", fontWeight:800, color:'#00d4aa' }}>{formatPrice(selected?.price || flights[0]?.price)}</div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={history}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
              <XAxis dataKey="date" tick={{ fill:'#555', fontSize:10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill:'#555', fontSize:10 }} axisLine={false} tickLine={false} tickFormatter={v=>`$${v}`} />
              <Tooltip contentStyle={{ background:'#16161e', border:'1px solid #2a2a3a', borderRadius:'8px', fontSize:'12px' }} formatter={v=>[`$${v}`,'Price']} />
              <Line type="monotone" dataKey="price" stroke="#00d4aa" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Alerts */}
      {tab==='alerts' && (
        <div style={{ background:'#13131a', border:'1px solid #1e1e2e', borderRadius:'12px', padding:'20px' }}>
          <div style={{ fontFamily:"'Syne',sans-serif", fontWeight:800, fontSize:'16px', marginBottom:'16px' }}>Price Alerts</div>
          <div style={{ background:'#0f0f15', border:'1px solid #1e1e2e', borderRadius:'8px', padding:'14px', marginBottom:'16px', display:'grid', gridTemplateColumns:'1fr auto auto', gap:'10px', alignItems:'center' }}>
            <div style={{ fontSize:'13px', color:'#00d4aa' }}>{from} → {to==='anywhere'?'Anywhere':to}</div>
            <input type="number" placeholder="Max $" value={alertPrice} onChange={e=>setAlertPrice(e.target.value)} style={{ ...S.select, width:'90px' }} />
            <button onClick={()=>{ if(!alertPrice) return; setAlerts(p=>[...p,{id:Date.now(),route:`${from} → ${to==='anywhere'?'Anywhere':to}`,threshold:parseInt(alertPrice),active:true}]); setAlertPrice('') }} style={{ background:'#00d4aa', color:'#000', border:'none', padding:'9px 14px', borderRadius:'6px', cursor:'pointer', fontFamily:"'Syne',sans-serif", fontWeight:700, fontSize:'12px', whiteSpace:'nowrap' }}>+ Add</button>
          </div>
          {alerts.map(a=>(
            <div key={a.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'12px 14px', borderRadius:'8px', background:'#0f0f15', border:'1px solid #1a1a26', marginBottom:'8px' }}>
              <div>
                <div style={{ fontSize:'13px', color:'#00d4aa', fontFamily:"'Syne',sans-serif", fontWeight:700 }}>{a.route}</div>
                <div style={{ fontSize:'11px', color:'#555', marginTop:'2px' }}>Alert below <span style={{color:'#f5c518'}}>${a.threshold}</span></div>
              </div>
              <div style={{ display:'flex', gap:'6px' }}>
                <button onClick={()=>setAlerts(p=>p.map(x=>x.id===a.id?{...x,active:!x.active}:x))} style={{ background:'transparent', border:'1px solid #2a2a3a', color:'#888', padding:'4px 10px', borderRadius:'4px', cursor:'pointer', fontSize:'11px' }}>{a.active?'Pause':'Resume'}</button>
                <button onClick={()=>setAlerts(p=>p.filter(x=>x.id!==a.id))} style={{ background:'transparent', border:'1px solid #3a1a1a', color:'#cc4444', padding:'4px 10px', borderRadius:'4px', cursor:'pointer', fontSize:'11px' }}>✕</button>
              </div>
            </div>
          ))}
          {alerts.length===0 && <div style={{ textAlign:'center', color:'#555', fontSize:'12px', padding:'32px 0' }}>No alerts set.</div>}
        </div>
      )}
    </div>
  )
}
