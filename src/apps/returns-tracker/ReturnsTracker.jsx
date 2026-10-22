import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'

// ─── Constants ────────────────────────────────────────────────────────────────

const PURPLE = '#7c6af7'
const GREEN  = '#4ade80'
const RED    = '#f87171'
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

// ─── Shared Styles ────────────────────────────────────────────────────────────

const S = {
  tab: (active) => ({
    background: 'transparent',
    border: 'none',
    borderBottom: active ? `2px solid ${PURPLE}` : '2px solid transparent',
    color: active ? PURPLE : '#555',
    padding: '8px 14px',
    cursor: 'pointer',
    fontSize: '11px',
    fontFamily: "'Syne', sans-serif",
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '1px',
    marginBottom: '-1px',
    whiteSpace: 'nowrap',
  }),
  card: {
    background: '#13131a',
    border: '1px solid #1e1e2e',
    borderRadius: '12px',
    padding: '16px 20px',
  },
  th: {
    padding: '8px 14px',
    fontSize: '10px',
    color: '#444',
    textTransform: 'uppercase',
    letterSpacing: '1px',
    fontWeight: 400,
    textAlign: 'right',
    whiteSpace: 'nowrap',
  },
  thLeft: {
    padding: '8px 14px',
    fontSize: '10px',
    color: '#444',
    textTransform: 'uppercase',
    letterSpacing: '1px',
    fontWeight: 400,
    textAlign: 'left',
    whiteSpace: 'nowrap',
  },
  td: {
    padding: '11px 14px',
    fontSize: '12px',
    textAlign: 'right',
    borderTop: '1px solid #111118',
    whiteSpace: 'nowrap',
  },
  tdLeft: {
    padding: '11px 14px',
    fontSize: '12px',
    textAlign: 'left',
    borderTop: '1px solid #111118',
    whiteSpace: 'nowrap',
  },
  input: {
    background: '#0c0c0f',
    border: '1px solid #2a2a3a',
    color: '#e8e8e0',
    padding: '7px 10px',
    borderRadius: '6px',
    fontSize: '12px',
    fontFamily: "'DM Mono', monospace",
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  },
  btn: (variant = 'default') => ({
    background: variant === 'primary' ? PURPLE : variant === 'danger' ? 'transparent' : '#1a1a28',
    border: `1px solid ${variant === 'danger' ? RED + '66' : variant === 'primary' ? PURPLE : '#2a2a3a'}`,
    color: variant === 'danger' ? RED : '#e8e8e0',
    padding: '7px 14px',
    borderRadius: '6px',
    fontSize: '11px',
    fontFamily: "'DM Mono', monospace",
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  }),
  periodBtn: (active) => ({
    background: active ? PURPLE + '22' : 'transparent',
    border: `1px solid ${active ? PURPLE : '#2a2a3a'}`,
    color: active ? PURPLE : '#666',
    padding: '5px 12px',
    borderRadius: '20px',
    fontSize: '11px',
    fontFamily: "'DM Mono', monospace",
    cursor: 'pointer',
    fontWeight: active ? 500 : 400,
  }),
  iconBtn: {
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    padding: '4px 6px',
    borderRadius: '4px',
    fontSize: '13px',
    lineHeight: 1,
  },
}

// ─── Formatters ───────────────────────────────────────────────────────────────

function fmt$(n) {
  if (n == null || !isFinite(n)) return '—'
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtPct(n) {
  if (n == null || !isFinite(n)) return '—'
  return (n >= 0 ? '+' : '') + n.toFixed(1) + '%'
}
function fmtMult(n) {
  if (n == null || !isFinite(n)) return '—'
  return n.toFixed(2) + 'x'
}
function returnColor(pct) {
  if (pct == null || !isFinite(pct)) return '#e8e8e0'
  return pct > 0 ? GREEN : pct < 0 ? RED : '#e8e8e0'
}
function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

// ─── Calculation Helpers ──────────────────────────────────────────────────────

// Latest row per account (used for value tracking)
function latestPerAccountAsOf(sorted, asOfDate) {
  const byAccount = {}
  for (const row of sorted) {
    if (row.date <= asOfDate) byAccount[row.account] = row
  }
  return Object.values(byAccount)
}

// Latest non-zero cost_basis per account (deposits only)
function latestCostBasisPerAccount(sorted, asOfDate) {
  const byAccount = {}
  for (const row of sorted) {
    if (row.date <= asOfDate && row.cost_basis > 0) byAccount[row.account] = row
  }
  return Object.values(byAccount)
}

function sumEntries(entries) {
  return entries.reduce(
    (acc, e) => ({ value: acc.value + e.value, cost_basis: acc.cost_basis + e.cost_basis }),
    { value: 0, cost_basis: 0 }
  )
}

// Total value as of date (latest snapshot per account)
function totalValueAsOf(sorted, asOfDate) {
  return latestPerAccountAsOf(sorted, asOfDate).reduce((a, e) => a + e.value, 0)
}

// Total invested as of date (latest non-zero cost_basis per account)
function totalCostAsOf(sorted, asOfDate) {
  return latestCostBasisPerAccount(sorted, asOfDate).reduce((a, e) => a + e.cost_basis, 0)
}

// ─── TWR (Time-Weighted Return) Helpers ──────────────────────────────────────
// cost_basis stored as running total per account.
// Deposit events = rows where cost_basis increases vs prior row for same account.
// startDate is EXCLUSIVE (use Dec 31 prior year as baseline); endDate is INCLUSIVE.

// Incremental deposit events within (startDate, endDate] for all accounts
function depositEventsInPeriod(sorted, startDate, endDate) {
  const events = []
  for (const account of [...new Set(sorted.map(e => e.account))]) {
    let prevCost = 0
    for (const row of sorted.filter(e => e.account === account)) {
      if (row.cost_basis > prevCost) {
        if (row.date > startDate && row.date <= endDate)
          events.push({ date: row.date, amount: row.cost_basis - prevCost, account })
        prevCost = row.cost_basis
      }
    }
  }
  return events.sort((a, b) => a.date - b.date)
}

// True TWR: chains sub-period returns around each cash flow.
// Uses Dec 31 prior year as baseline (pass startDate = Dec 31 prior year).
function calcTWR(sorted, startDate, endDate) {
  const startValue = totalValueAsOf(sorted, startDate)
  const endValue   = totalValueAsOf(sorted, endDate)
  if (!endValue) return null
  const events = depositEventsInPeriod(sorted, startDate, endDate)
  if (!events.length) {
    return startValue ? (endValue / startValue - 1) * 100 : null
  }
  let factor = 1, prevVal = startValue
  for (const { date, amount } of events) {
    const postDeposit = totalValueAsOf(sorted, date)
    const preDeposit  = postDeposit - amount
    if (prevVal > 0) factor *= preDeposit / prevVal
    prevVal = postDeposit
  }
  if (prevVal > 0) factor *= endValue / prevVal
  return (factor - 1) * 100
}

// TWR for a single account
function calcTWRAccount(sorted, account, startDate, endDate) {
  return calcTWR(sorted.filter(e => e.account === account), startDate, endDate)
}

// Annualise a TWR over the actual period length
function calcAPY(twrPct, startDate, endDate) {
  if (twrPct == null || !isFinite(twrPct)) return null
  const years = (endDate - startDate) / (365.25 * 86400000)
  if (years < 1 / 365) return null
  return (Math.pow(1 + twrPct / 100, 1 / years) - 1) * 100
}

// Canonical year window: Dec 31 prior year → Dec 31 of year (or today)
function yearWindow(year) {
  const today = new Date()
  return {
    startDate: new Date(year - 1, 11, 31, 23, 59, 59),
    endDate:   year === today.getFullYear() ? today : new Date(year, 11, 31, 23, 59, 59),
  }
}

function calcSummary(sorted) {
  if (!sorted.length) return null
  const today     = new Date()
  const totalVal  = totalValueAsOf(sorted, today)
  const totalCost = totalCostAsOf(sorted, today)

  // All-time ROIC
  const roic          = totalCost ? (totalVal - totalCost) / totalCost * 100 : null
  const totalMultiple = totalCost ? totalVal / totalCost : null

  // YTD TWR + APY (baseline = Dec 31 prior year)
  const { startDate: ytdStart, endDate: ytdEnd } = yearWindow(today.getFullYear())
  const ytdTWR = calcTWR(sorted, ytdStart, ytdEnd)
  const ytdAPY = calcAPY(ytdTWR, ytdStart, ytdEnd)

  // All-time TWR + APY (baseline = Dec 31 before first data year)
  const firstYear  = sorted[0].date.getFullYear()
  const atStart    = new Date(firstYear - 1, 11, 31, 23, 59, 59)
  const allTimeTWR = calcTWR(sorted, atStart, today)
  const allTimeAPY = calcAPY(allTimeTWR, atStart, today)

  return { totalVal, totalCost, totalMultiple, roic, ytdTWR, ytdAPY, allTimeTWR, allTimeAPY }
}

function calcAnnualRows(sorted) {
  if (!sorted.length) return []
  const years = [...new Set(sorted.map(e => e.date.getFullYear()))].sort((a, b) => b - a)
  return years.map(year => {
    const { startDate, endDate } = yearWindow(year)
    const startValue = totalValueAsOf(sorted, startDate)
    const endValue   = totalValueAsOf(sorted, endDate)
    const cf         = depositEventsInPeriod(sorted, startDate, endDate)
                         .reduce((s, e) => s + e.amount, 0)
    const twr        = calcTWR(sorted, startDate, endDate)
    const apy        = calcAPY(twr, startDate, endDate)
    const today      = new Date()
    return { year, startValue, endValue, cf, twr, apy, isCurrent: year === today.getFullYear() }
  })
}

function buildChartPoints(sorted) {
  if (!sorted.length) return []
  // Get all unique dates sorted ascending
  const dates = [...new Set(sorted.map(r => r.date.toISOString().slice(0, 10)))]
    .sort()
    .map(d => new Date(d + 'T00:00:00'))

  return dates.map(date => ({
    label: date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
    // Latest value per account as of this date
    value: Math.round(latestPerAccountAsOf(sorted, date).reduce((a, e) => a + e.value, 0)),
    // Latest non-zero cost_basis per account as of this date (cumulative deposits)
    cost_basis: Math.round(latestCostBasisPerAccount(sorted, date).reduce((a, e) => a + e.cost_basis, 0)),
  }))
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function DateInput({ value, onChange, inputStyle }) {
  const ref = useRef(null)
  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
      <button
        type="button"
        onClick={() => { try { ref.current?.showPicker() } catch { ref.current?.click() } }}
        style={{ position: 'absolute', left: '7px', background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: '#666', lineHeight: 1, zIndex: 1, display: 'flex', alignItems: 'center' }}
        tabIndex={-1}
        title="Open calendar"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2"/>
          <line x1="16" y1="2" x2="16" y2="6"/>
          <line x1="8" y1="2" x2="8" y2="6"/>
          <line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
      </button>
      <input ref={ref} type="date" value={value} onChange={onChange} style={{ ...S.input, paddingLeft: '28px', ...inputStyle }} />
    </div>
  )
}

function StatCard({ label, value, sub, color }) {
  return (
    <div style={{ ...S.card, textAlign: 'center' }}>
      <div style={{ fontSize: '24px', fontFamily: "'Syne', sans-serif", fontWeight: 800, color: color || '#e8e8e0', lineHeight: 1 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: '11px', color: '#555', marginTop: '4px' }}>{sub}</div>}
      <div style={{ fontSize: '10px', color: '#444', marginTop: '6px', textTransform: 'uppercase', letterSpacing: '0.8px' }}>{label}</div>
    </div>
  )
}

function SkeletonRow({ cols = 6 }) {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} style={{ ...S.td, padding: '12px 14px' }}>
          <div style={{ height: '10px', borderRadius: '4px', background: '#1e1e2e', width: i === 0 ? '60px' : '80px' }} />
        </td>
      ))}
    </tr>
  )
}

function EmptyState({ onGoToData }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: '12px', textAlign: 'center', paddingTop: '60px' }}>
      <div style={{ fontSize: '40px' }}>📊</div>
      <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: '16px' }}>No data yet</div>
      <div style={{ fontSize: '12px', color: '#555', lineHeight: 1.7, maxWidth: '260px' }}>
        Add snapshots in the Data tab, or load data directly via your Supabase dashboard.
      </div>
      <button onClick={onGoToData} style={{ ...S.btn('primary'), marginTop: '8px', padding: '9px 20px', fontSize: '12px' }}>
        Go to Data →
      </button>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ReturnsTracker() {
  const navigate = useNavigate()

  // ── State ──────────────────────────────────────────────────────────────────
  const [rawData, setRawData]       = useState([])
  const [loading, setLoading]       = useState(true)
  const [dbError, setDbError]       = useState('')

  const [tab, setTab]               = useState('overview')
  const [blurbYear, setBlurbYear]   = useState(new Date().getFullYear() - 1) // year selector in blurbs

  // Record Deposit form
  const [depDate, setDepDate]       = useState(todayStr())
  const [depAccount, setDepAccount] = useState('')
  const [depAmount, setDepAmount]   = useState('')
  const [depSaving, setDepSaving]   = useState(false)

  // Update Market Value form (standalone)
  const [mvDate, setMvDate]         = useState(todayStr())
  const [mvAccount, setMvAccount]   = useState('')
  const [mvValue, setMvValue]       = useState('')
  const [mvSaving, setMvSaving]     = useState(false)

  // Add new entry form
  const [addingNew, setAddingNew]   = useState(false)
  const [newDraft, setNewDraft]     = useState({ date: todayStr(), account: '', value: '', cost_basis: '' })

  // Inline edit
  const [editingId, setEditingId]   = useState(null)
  const [editDraft, setEditDraft]   = useState({})

  // Delete confirm
  const [deleteConfirmId, setDeleteConfirmId] = useState(null)

  // ── Fetch from API ─────────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    setLoading(true)
    setDbError('')
    try {
      const res = await fetch('/api/snapshots')
      if (!res.ok) throw new Error(`Server error ${res.status}`)
      const data = await res.json()
      setRawData(data.map(d => ({ ...d, date: new Date(d.date + 'T00:00:00') })))
    } catch (e) {
      setDbError(e.message || 'Failed to load data. Is the FastAPI server running?')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  // ── API helpers ────────────────────────────────────────────────────────────
  async function apiPost(path, body) {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.detail || `Server error ${res.status}`)
    }
    return res.json()
  }

  async function apiPut(id, body) {
    const res = await fetch(`/api/snapshots/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.detail || `Server error ${res.status}`)
    }
    return res.json()
  }

  async function apiDelete(id) {
    const res = await fetch(`/api/snapshots/${id}`, { method: 'DELETE' })
    if (!res.ok) throw new Error(`Server error ${res.status}`)
  }

  // ── Derived Data ───────────────────────────────────────────────────────────
  const sortedData = useMemo(() => [...rawData].sort((a, b) => a.date - b.date), [rawData])
  const summary    = useMemo(() => calcSummary(sortedData), [sortedData])
  const annualRows = useMemo(() => calcAnnualRows(sortedData), [sortedData])
  const chartPoints= useMemo(() => buildChartPoints(sortedData), [sortedData])
  const accounts   = useMemo(() => [...new Set(sortedData.map(e => e.account))], [sortedData])

  // All years that have data (for year selector)
  const dataYears  = useMemo(() =>
    [...new Set(sortedData.map(e => e.date.getFullYear()))].sort((a, b) => b - a)
  , [sortedData])

  const hasData      = sortedData.length > 0
  const multiAccount = accounts.length > 1

  // Per-account blurb data: ROIC, current-year TWR/APY, selected-year TWR/APY, stale flag
  const accountStatus = useMemo(() => {
    const today    = new Date()
    const curYear  = today.getFullYear()
    const { startDate: curStart, endDate: curEnd } = yearWindow(curYear)
    const { startDate: selStart, endDate: selEnd } = yearWindow(blurbYear)

    return accounts.map(account => {
      const rows         = sortedData.filter(e => e.account === account)
      const lastValueRow = [...rows].reverse().find(e => e.value > 0)
      const lastValue    = lastValueRow?.value ?? 0
      const lastValueDate= lastValueRow?.date ?? null
      let prevCost = 0, lastDepositDate = null, totalCost = 0
      for (const row of rows) {
        if (row.cost_basis > prevCost) { lastDepositDate = row.date; prevCost = row.cost_basis }
      }
      totalCost = prevCost
      const roic  = totalCost ? (lastValue - totalCost) / totalCost * 100 : null
      const stale = lastDepositDate && lastValueDate && lastValueDate < lastDepositDate

      const curTWR = calcTWRAccount(sortedData, account, curStart, curEnd)
      const curAPY = calcAPY(curTWR, curStart, curEnd)
      const selTWR = calcTWRAccount(sortedData, account, selStart, selEnd)
      const selAPY = calcAPY(selTWR, selStart, selEnd)

      return { account, lastValue, lastValueDate, lastDepositDate, stale, roic, curTWR, curAPY, selTWR, selAPY }
    })
  }, [sortedData, accounts, blurbYear])

  // ── Handlers ───────────────────────────────────────────────────────────────

  // Record a deposit: bumps cost_basis AND market value by the deposit amount
  // Returns the running cost_basis and last known value for an account
  // as of a specific date — so back-dated entries use the correct prior baseline.
  function acctStateAsOf(account, asOfDateStr) {
    const asOf = new Date(asOfDateStr + 'T00:00:00')
    const rows  = sortedData.filter(e => e.account === account && e.date <= asOf)
    let prevCost = 0
    for (const row of rows) { if (row.cost_basis > prevCost) prevCost = row.cost_basis }
    const lastVal = [...rows].reverse().find(e => e.value > 0)?.value ?? 0
    return { prevCost, lastVal }
  }

  async function handleRecordDeposit() {
    if (!depAccount || !depAmount || !depDate) return
    setDepSaving(true)
    setDbError('')
    try {
      const amount                = parseFloat(depAmount)
      const { prevCost, lastVal } = acctStateAsOf(depAccount, depDate)
      const depDateObj            = new Date(depDate + 'T00:00:00')

      // Insert the new deposit row
      await apiPost('/api/snapshots', {
        date: depDate, account: depAccount,
        value: lastVal + amount,
        cost_basis: prevCost + amount,
      })

      // Cascade: all rows AFTER this date for the same account need their
      // cost_basis bumped by the same amount so the running total stays correct
      const rowsAfter = sortedData.filter(e => e.account === depAccount && e.date > depDateObj)
      await Promise.all(rowsAfter.map(row =>
        apiPut(row.id, { value: row.value, cost_basis: row.cost_basis + amount })
      ))

      setDepAmount('')
      await fetchAll()
    } catch (e) { setDbError(e.message) }
    finally { setDepSaving(false) }
  }

  // Update market value only (cost_basis carries forward from the correct prior date)
  async function handleUpdateMarketValue() {
    if (!mvAccount || !mvValue || !mvDate) return
    setMvSaving(true)
    setDbError('')
    try {
      const { prevCost } = acctStateAsOf(mvAccount, mvDate)
      await apiPost('/api/snapshots', {
        date: mvDate, account: mvAccount,
        value: parseFloat(mvValue), cost_basis: prevCost,
      })
      setMvValue('')
      await fetchAll()
    } catch (e) { setDbError(e.message) }
    finally { setMvSaving(false) }
  }

  async function handleAddNew() {
    if (!newDraft.date || !newDraft.value || !newDraft.cost_basis) return
    setDbError('')
    try {
      await apiPost('/api/snapshots', {
        date: newDraft.date,
        account: newDraft.account || 'Fidelity',
        value: parseFloat(newDraft.value),
        cost_basis: parseFloat(newDraft.cost_basis),
      })
      setAddingNew(false)
      setNewDraft({ date: todayStr(), account: '', value: '', cost_basis: '' })
      await fetchAll()
    } catch (e) { setDbError(e.message) }
  }

  async function handleSaveEdit(id) {
    setDbError('')
    try {
      await apiPut(id, {
        value: parseFloat(editDraft.value),
        cost_basis: parseFloat(editDraft.cost_basis),
      })
      setEditingId(null)
      await fetchAll()
    } catch (e) { setDbError(e.message) }
  }

  async function handleDelete(id) {
    setDbError('')
    try {
      await apiDelete(id)
      setDeleteConfirmId(null)
      await fetchAll()
    } catch (e) { setDbError(e.message) }
  }


  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{
      fontFamily: "'DM Mono', monospace",
      background: '#0c0c0f',
      minHeight: '100dvh',
      color: '#e8e8e0',
      padding: '20px',
      paddingTop: 'calc(20px + env(safe-area-inset-top))',
      paddingBottom: 'calc(20px + env(safe-area-inset-bottom))',
      maxWidth: '960px',
      margin: '0 auto',
      display: 'flex',
      flexDirection: 'column',
    }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Syne:wght@700;800&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <button onClick={() => navigate('/')} style={{ background: 'transparent', border: '1px solid #2a2a3a', color: '#555', padding: '6px 10px', borderRadius: '6px', cursor: 'pointer', fontSize: '14px' }}>←</button>
          <div>
            <div style={{ fontSize: '18px', fontFamily: "'Syne', sans-serif", fontWeight: 800 }}>
              📈 RETURNS<span style={{ color: PURPLE }}>.</span>tracker
            </div>
            <div style={{ fontSize: '10px', color: '#444' }}>investment growth · returns · performance</div>
          </div>
        </div>
        <button onClick={fetchAll} style={{ ...S.btn(), fontSize: '11px', padding: '6px 12px' }} title="Refresh">
          ↻ Refresh
        </button>
      </div>

      {/* Error banner */}
      {dbError && (
        <div style={{ background: RED + '18', border: `1px solid ${RED}44`, borderRadius: '8px', padding: '10px 14px', marginBottom: '16px', fontSize: '12px', color: RED, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{dbError}</span>
          <button onClick={() => setDbError('')} style={{ ...S.iconBtn, color: RED }}>✕</button>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #1e1e2e', marginBottom: '24px', overflowX: 'auto' }}>
        {['overview', 'chart', 'annual', 'data'].map(t => (
          <button key={t} style={S.tab(tab === t)} onClick={() => setTab(t)}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* ── Overview ── */}
      {tab === 'overview' && (
        loading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '12px' }}>
            {[1,2,3,4].map(i => <div key={i} style={{ ...S.card, height: '80px', background: '#13131a' }} />)}
          </div>
        ) : !hasData ? <EmptyState onGoToData={() => setTab('data')} /> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Returns grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '10px' }}>
              <StatCard label="YTD TWR" value={fmtPct(summary?.ytdTWR)} color={returnColor(summary?.ytdTWR)} />
              <StatCard label="YTD APY" value={fmtPct(summary?.ytdAPY)} color={returnColor(summary?.ytdAPY)} />
              <StatCard label="All-Time ROIC" value={fmtPct(summary?.roic)} sub={fmtMult(summary?.totalMultiple)} color={returnColor(summary?.roic)} />
              <StatCard label="All-Time TWR" value={fmtPct(summary?.allTimeTWR)} color={returnColor(summary?.allTimeTWR)} />
              <StatCard label="All-Time APY" value={fmtPct(summary?.allTimeAPY)} color={returnColor(summary?.allTimeAPY)} />
            </div>

            <div style={{ ...S.card, display: 'flex', gap: '0', overflow: 'hidden', padding: 0 }}>
              {[
                { label: 'Invested', val: fmt$(summary?.totalCost), color: '#e8e8e0' },
                { label: 'Current Value', val: fmt$(summary?.totalVal), color: PURPLE },
                { label: 'Unrealized Gain', val: fmt$(summary?.totalVal - summary?.totalCost), color: returnColor(summary?.roic) },
              ].map((item, i) => (
                <div key={i} style={{ flex: 1, textAlign: 'center', padding: '16px 10px', borderRight: i < 2 ? '1px solid #1e1e2e' : 'none' }}>
                  <div style={{ fontSize: '16px', fontFamily: "'Syne', sans-serif", fontWeight: 800, color: item.color }}>{item.val}</div>
                  <div style={{ fontSize: '10px', color: '#444', marginTop: '4px', textTransform: 'uppercase', letterSpacing: '0.8px' }}>{item.label}</div>
                </div>
              ))}
            </div>

            {annualRows.length > 0 && (
              <div style={S.card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <div style={{ fontSize: '11px', color: '#555', textTransform: 'uppercase', letterSpacing: '1px' }}>Annual Returns</div>
                  <button onClick={() => setTab('annual')} style={{ background: 'transparent', border: 'none', color: PURPLE, fontSize: '11px', cursor: 'pointer', fontFamily: "'DM Mono', monospace" }}>View all →</button>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr>
                    <th style={S.thLeft}>Year</th>
                    <th style={S.th}>End Value</th>
                    <th style={S.th}>Return</th>
                  </tr></thead>
                  <tbody>
                    {annualRows.slice(0, 3).map(row => (
                      <tr key={row.year}>
                        <td style={S.tdLeft}>{row.year}{row.isCurrent ? ' (YTD)' : ''}</td>
                        <td style={S.td}>{fmt$(row.endValue)}</td>
                        <td style={{ ...S.td, color: returnColor(row.pct), fontFamily: "'Syne',sans-serif", fontWeight: 800 }}>{fmtPct(row.pct)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )
      )}

      {/* ── Chart ── */}
      {tab === 'chart' && (
        !hasData ? <EmptyState onGoToData={() => setTab('data')} /> : (
          <div style={S.card}>
            <div style={{ fontSize: '11px', color: '#555', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '16px' }}>Portfolio Value Over Time</div>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={chartPoints} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
                <XAxis dataKey="label" tick={{ fill: '#555', fontSize: 10, fontFamily: 'DM Mono' }} axisLine={false} tickLine={false} interval={Math.max(0, Math.ceil(chartPoints.length / 8) - 1)} />
                <YAxis tick={{ fill: '#555', fontSize: 10, fontFamily: 'DM Mono' }} axisLine={false} tickLine={false} tickFormatter={v => '$' + (v >= 1000 ? (v/1000).toFixed(0)+'k' : v)} width={52} />
                <Tooltip contentStyle={{ background: '#16161e', border: '1px solid #2a2a3a', borderRadius: '8px', fontSize: '12px', fontFamily: 'DM Mono' }} formatter={(v, name) => [fmt$(v), name === 'value' ? 'Portfolio Value' : 'Cost Basis']} />
                <Line type="monotone" dataKey="value" stroke={PURPLE} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="cost_basis" stroke="#3a3a5c" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
              </LineChart>
            </ResponsiveContainer>
            <div style={{ display: 'flex', gap: '20px', marginTop: '12px', justifyContent: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#888' }}>
                <div style={{ width: '16px', height: '2px', background: PURPLE, borderRadius: '2px' }} /> Portfolio Value
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#888' }}>
                <div style={{ width: '16px', height: '2px', background: '#3a3a5c', borderRadius: '2px' }} /> Cost Basis
              </div>
            </div>
          </div>
        )
      )}

      {/* ── Annual ── */}
      {tab === 'annual' && (
        !hasData ? <EmptyState onGoToData={() => setTab('data')} /> : (
          <div style={S.card}>
            <div style={{ fontSize: '11px', color: '#555', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px' }}>Annual Returns</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '380px' }}>
                <thead><tr>
                  <th style={S.thLeft}>Year</th>
                  <th style={S.th}>Start (Dec 31)</th>
                  <th style={S.th}>Deposits</th>
                  <th style={S.th}>End Value</th>
                  <th style={S.th}>TWR</th>
                  <th style={S.th}>APY</th>
                </tr></thead>
                <tbody>
                  {loading ? [1,2,3].map(i => <SkeletonRow key={i} cols={6} />) : annualRows.map(row => (
                    <tr key={row.year}>
                      <td style={S.tdLeft}>{row.year}{row.isCurrent ? <span style={{ color: '#444', fontSize: '10px' }}> YTD</span> : ''}</td>
                      <td style={S.td}>{fmt$(row.startValue)}</td>
                      <td style={S.td}>{fmt$(row.cf)}</td>
                      <td style={S.td}>{fmt$(row.endValue)}</td>
                      <td style={{ ...S.td, color: returnColor(row.twr), fontFamily: "'Syne',sans-serif", fontWeight: 800 }}>{fmtPct(row.twr)}</td>
                      <td style={{ ...S.td, color: returnColor(row.apy) }}>{fmtPct(row.apy)}</td>
                    </tr>
                  ))}
                </tbody>
                {hasData && (() => {
                  const now     = new Date()
                  const totCost = totalCostAsOf(sortedData, now)
                  const totVal  = totalValueAsOf(sortedData, now)
                  const roic    = totCost ? (totVal - totCost) / totCost * 100 : null
                  return (
                    <tfoot><tr style={{ background: '#0a0a12' }}>
                      <td style={{ ...S.tdLeft, borderTop: '1px solid #2a2a3a', color: '#888', fontWeight: 500 }}>All-time ROIC</td>
                      <td style={{ ...S.td, borderTop: '1px solid #2a2a3a', color: '#888' }} colSpan={2}>{fmt$(totCost)} invested</td>
                      <td style={{ ...S.td, borderTop: '1px solid #2a2a3a', color: '#888' }}>{fmt$(totVal)}</td>
                      <td style={{ ...S.td, borderTop: '1px solid #2a2a3a', color: returnColor(roic), fontFamily: "'Syne',sans-serif", fontWeight: 800 }}>{fmtPct(roic)}</td>
                      <td style={{ ...S.td, borderTop: '1px solid #2a2a3a', color: returnColor(summary?.allTimeAPY) }}>{fmtPct(summary?.allTimeAPY)}</td>
                    </tr></tfoot>
                  )
                })()}
              </table>
            </div>
          </div>
        )
      )}

      {/* ── Data ── */}
      {tab === 'data' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

          {/* ── Account blurbs ── */}
          {accountStatus.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {/* Year selector for the blurbs */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '10px', color: '#555', textTransform: 'uppercase', letterSpacing: '0.8px' }}>Compare year:</span>
                <select
                  value={blurbYear}
                  onChange={e => setBlurbYear(Number(e.target.value))}
                  style={{ ...S.input, width: 'auto', padding: '4px 10px', fontSize: '11px' }}
                >
                  {dataYears.filter(y => y !== new Date().getFullYear()).map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '10px' }}>
                {accountStatus.map(({ account, lastValue, lastValueDate, lastDepositDate, stale, roic, curTWR, curAPY, selTWR, selAPY }) => {
                  const curYear = new Date().getFullYear()
                  return (
                    <div key={account} style={{ ...S.card, position: 'relative', borderColor: stale ? '#f8717144' : '#1e1e2e' }}>
                      {stale && <div style={{ position: 'absolute', top: '10px', right: '12px', fontSize: '14px' }} title="Market value not updated since last deposit">⚠️</div>}

                      {/* Account name + current value */}
                      <div style={{ fontSize: '11px', color: '#555', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>{account}</div>
                      <div style={{ fontSize: '22px', fontFamily: "'Syne',sans-serif", fontWeight: 800, color: PURPLE, marginBottom: '2px' }}>{fmt$(lastValue)}</div>
                      <div style={{ fontSize: '10px', color: '#444', marginBottom: '12px' }}>
                        Updated: <span style={{ color: '#666' }}>{lastValueDate ? lastValueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</span>
                        {lastDepositDate && <span style={{ color: stale ? '#f87171' : '#555' }}> · deposit {lastDepositDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}{stale ? ' ⚠' : ''}</span>}
                      </div>

                      {/* Metrics grid */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px', textAlign: 'center' }}>
                        {[
                          { label: 'ROIC', val: fmtPct(roic), color: returnColor(roic) },
                          { label: `${curYear} TWR`, val: fmtPct(curTWR), color: returnColor(curTWR) },
                          { label: `${curYear} APY`, val: fmtPct(curAPY), color: returnColor(curAPY) },
                          { label: `${blurbYear} TWR`, val: fmtPct(selTWR), color: returnColor(selTWR) },
                          { label: `${blurbYear} APY`, val: fmtPct(selAPY), color: returnColor(selAPY) },
                        ].map((m, i) => (
                          <div key={i} style={{ background: '#0f0f18', borderRadius: '6px', padding: '8px 4px' }}>
                            <div style={{ fontSize: '13px', fontFamily: "'Syne',sans-serif", fontWeight: 800, color: m.color }}>{m.val}</div>
                            <div style={{ fontSize: '9px', color: '#444', marginTop: '3px', textTransform: 'uppercase', letterSpacing: '0.6px' }}>{m.label}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── Record Deposits ── */}
          <div style={S.card}>
            <div style={{ fontSize: '13px', fontFamily: "'Syne',sans-serif", fontWeight: 800, marginBottom: '4px' }}>Record Deposit</div>
            <div style={{ fontSize: '10px', color: '#555', marginBottom: '14px' }}>
              Adds to cost basis and automatically bumps market value by the deposit amount.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: '10px', alignItems: 'end' }}>
              <div>
                <div style={{ fontSize: '10px', color: '#444', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.8px' }}>Date</div>
                <DateInput value={depDate} onChange={e => setDepDate(e.target.value)} />
              </div>
              <div>
                <div style={{ fontSize: '10px', color: '#444', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.8px' }}>Account</div>
                {accounts.length > 0 ? (
                  <select value={depAccount} onChange={e => setDepAccount(e.target.value)} style={S.input}>
                    <option value="">Select…</option>
                    {accounts.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                ) : (
                  <input placeholder="e.g. Fidelity" value={depAccount} onChange={e => setDepAccount(e.target.value)} style={S.input} />
                )}
              </div>
              <div>
                <div style={{ fontSize: '10px', color: '#444', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.8px' }}>Deposit Amount ($)</div>
                <input type="number" placeholder="e.g. 500" value={depAmount} onChange={e => setDepAmount(e.target.value)} style={S.input} />
              </div>
              <button onClick={handleRecordDeposit} disabled={depSaving || !depAccount || !depAmount} style={{ ...S.btn('primary'), opacity: (!depAccount || !depAmount) ? 0.5 : 1, padding: '8px 16px' }}>
                {depSaving ? '…' : 'Save'}
              </button>
            </div>
            {depAccount && depAmount && depDate && (() => {
              const { prevCost, lastVal } = acctStateAsOf(depAccount, depDate)
              const amt = parseFloat(depAmount) || 0
              return amt > 0 ? (
                <div style={{ fontSize: '10px', color: '#555', marginTop: '10px' }}>
                  <span style={{ color: '#888' }}>{depAccount}</span> as of {depDate}:&nbsp;
                  value {fmt$(lastVal)} + {fmt$(amt)} = <span style={{ color: GREEN }}>{fmt$(lastVal + amt)}</span>
                  &nbsp;·&nbsp;cost basis {fmt$(prevCost)} + {fmt$(amt)} = <span style={{ color: '#aaa' }}>{fmt$(prevCost + amt)}</span>
                </div>
              ) : null
            })()}
          </div>

          {/* ── Update Market Value ── */}
          <div style={S.card}>
            <div style={{ fontSize: '13px', fontFamily: "'Syne',sans-serif", fontWeight: 800, marginBottom: '4px' }}>Update Market Value</div>
            <div style={{ fontSize: '10px', color: '#555', marginBottom: '14px' }}>
              Record the actual market value on a given date. Cost basis carries forward unchanged.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: '10px', alignItems: 'end' }}>
              <div>
                <div style={{ fontSize: '10px', color: '#444', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.8px' }}>Date</div>
                <DateInput value={mvDate} onChange={e => setMvDate(e.target.value)} />
              </div>
              <div>
                <div style={{ fontSize: '10px', color: '#444', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.8px' }}>Account</div>
                {accounts.length > 0 ? (
                  <select value={mvAccount} onChange={e => setMvAccount(e.target.value)} style={S.input}>
                    <option value="">Select…</option>
                    {accounts.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                ) : (
                  <input placeholder="e.g. Fidelity" value={mvAccount} onChange={e => setMvAccount(e.target.value)} style={S.input} />
                )}
              </div>
              <div>
                <div style={{ fontSize: '10px', color: '#444', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.8px' }}>Market Value ($)</div>
                <input type="number" placeholder="e.g. 52430" value={mvValue} onChange={e => setMvValue(e.target.value)} style={S.input} />
              </div>
              <button onClick={handleUpdateMarketValue} disabled={mvSaving || !mvAccount || !mvValue} style={{ ...S.btn('primary'), opacity: (!mvAccount || !mvValue) ? 0.5 : 1, padding: '8px 16px' }}>
                {mvSaving ? '…' : 'Save'}
              </button>
            </div>
          </div>

          {/* ── Entries table ── */}
          <div style={S.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ fontSize: '11px', color: '#555', textTransform: 'uppercase', letterSpacing: '1px' }}>
                {sortedData.length} snapshots
              </div>
              <button onClick={() => setAddingNew(true)} style={S.btn('primary')}>+ Full Entry</button>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '480px' }}>
                <thead><tr>
                  <th style={S.thLeft}>Date</th>
                  <th style={S.thLeft}>Account</th>
                  <th style={S.th}>Value</th>
                  <th style={S.th}>Cost Basis</th>
                  <th style={{ ...S.th, textAlign: 'center' }}>Actions</th>
                </tr></thead>
                <tbody>
                  {addingNew && (
                    <tr style={{ background: PURPLE + '11' }}>
                      <td style={{ ...S.tdLeft, padding: '6px 8px' }}>
                        <DateInput value={newDraft.date} onChange={e => setNewDraft(d => ({ ...d, date: e.target.value }))} inputStyle={{ padding: '5px 8px 5px 28px' }} />
                      </td>
                      <td style={{ ...S.tdLeft, padding: '6px 8px' }}>
                        <input placeholder="Account" value={newDraft.account} onChange={e => setNewDraft(d => ({ ...d, account: e.target.value }))} style={{ ...S.input, padding: '5px 8px' }} />
                      </td>
                      <td style={{ ...S.td, padding: '6px 8px' }}>
                        <input type="number" placeholder="Value" value={newDraft.value} onChange={e => setNewDraft(d => ({ ...d, value: e.target.value }))} style={{ ...S.input, padding: '5px 8px', textAlign: 'right' }} />
                      </td>
                      <td style={{ ...S.td, padding: '6px 8px' }}>
                        <input type="number" placeholder="Cost Basis" value={newDraft.cost_basis} onChange={e => setNewDraft(d => ({ ...d, cost_basis: e.target.value }))} style={{ ...S.input, padding: '5px 8px', textAlign: 'right' }} />
                      </td>
                      <td style={{ ...S.td, textAlign: 'center', padding: '6px 8px' }}>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                          <button onClick={handleAddNew} style={S.btn('primary')}>Save</button>
                          <button onClick={() => setAddingNew(false)} style={S.btn()}>✕</button>
                        </div>
                      </td>
                    </tr>
                  )}

                  {loading ? [1,2,3].map(i => <SkeletonRow key={i} cols={5} />) : [...sortedData].reverse().map(row => (
                    <>
                      {editingId === row.id ? (
                        <tr key={row.id} style={{ background: PURPLE + '11' }}>
                          <td style={S.tdLeft}>{row.date.toISOString().slice(0,10)}</td>
                          <td style={{ ...S.tdLeft, color: '#888' }}>{row.account}</td>
                          <td style={{ ...S.td, padding: '6px 8px' }}>
                            <input type="number" value={editDraft.value} onChange={e => setEditDraft(d => ({ ...d, value: e.target.value }))} style={{ ...S.input, padding: '5px 8px', textAlign: 'right' }} />
                          </td>
                          <td style={{ ...S.td, padding: '6px 8px' }}>
                            <input type="number" value={editDraft.cost_basis} onChange={e => setEditDraft(d => ({ ...d, cost_basis: e.target.value }))} style={{ ...S.input, padding: '5px 8px', textAlign: 'right' }} />
                          </td>
                          <td style={{ ...S.td, textAlign: 'center', padding: '6px 8px' }}>
                            <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                              <button onClick={() => handleSaveEdit(row.id)} style={S.btn('primary')}>Save</button>
                              <button onClick={() => setEditingId(null)} style={S.btn()}>✕</button>
                            </div>
                          </td>
                        </tr>
                      ) : deleteConfirmId === row.id ? (
                        <tr key={row.id} style={{ background: RED + '11' }}>
                          <td colSpan={4} style={{ ...S.tdLeft, color: '#e8e8e0' }}>Delete {row.date.toISOString().slice(0,10)} · {row.account}?</td>
                          <td style={{ ...S.td, textAlign: 'center' }}>
                            <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                              <button onClick={() => handleDelete(row.id)} style={S.btn('danger')}>Delete</button>
                              <button onClick={() => setDeleteConfirmId(null)} style={S.btn()}>Cancel</button>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        <tr key={row.id}>
                          <td style={S.tdLeft}>{row.date.toISOString().slice(0,10)}</td>
                          <td style={{ ...S.tdLeft, color: '#888' }}>{row.account}</td>
                          <td style={S.td}>{fmt$(row.value)}</td>
                          <td style={S.td}>{fmt$(row.cost_basis)}</td>
                          <td style={{ ...S.td, textAlign: 'center' }}>
                            <div style={{ display: 'flex', gap: '2px', justifyContent: 'center' }}>
                              <button onClick={() => { setEditingId(row.id); setEditDraft({ value: String(row.value), cost_basis: String(row.cost_basis) }) }} style={{ ...S.iconBtn, color: '#888' }} title="Edit">✏️</button>
                              <button onClick={() => setDeleteConfirmId(row.id)} style={{ ...S.iconBtn, color: RED + 'aa' }} title="Delete">🗑</button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
