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
  return '$' + Math.round(n).toLocaleString('en-US')
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

// ─── Modified Dietz Helpers ───────────────────────────────────────────────────
// cost_basis is stored as a RUNNING TOTAL per account.
// An incremental deposit occurs whenever cost_basis increases vs the prior row
// for the same account. We derive cash flows from those increases.

// Returns the total incremental deposits that occurred strictly within (startDate, endDate]
function cashFlowsInPeriod(sorted, startDate, endDate) {
  const accounts = [...new Set(sorted.map(e => e.account))]
  let total = 0
  for (const account of accounts) {
    let prevCost = 0
    for (const row of sorted.filter(e => e.account === account)) {
      if (row.cost_basis > prevCost) {
        // cost_basis increased → this row records a deposit
        if (row.date > startDate && row.date <= endDate) {
          total += row.cost_basis - prevCost
        }
        prevCost = row.cost_basis
      }
      // cost_basis == prevCost (carried forward) or 0 (value-only row): no new deposit
    }
  }
  return total
}

// Modified Dietz: (EndValue − StartValue − CashFlows) / (StartValue + CashFlows)
// Returns a percentage (e.g. 50.0 for 50%).  Returns null when there is no basis.
function modifiedDietz(sorted, startDate, endDate) {
  const startValue = totalValueAsOf(sorted, startDate)
  const endValue   = totalValueAsOf(sorted, endDate)
  if (!endValue) return null
  const cf  = cashFlowsInPeriod(sorted, startDate, endDate)
  const den = startValue + cf
  if (!den) return null
  return (endValue - startValue - cf) / den * 100
}

// Same as modifiedDietz but also returns the component values for display
function modifiedDietzDetail(sorted, startDate, endDate) {
  const startValue = totalValueAsOf(sorted, startDate)
  const endValue   = totalValueAsOf(sorted, endDate)
  const cf         = cashFlowsInPeriod(sorted, startDate, endDate)
  const den        = startValue + cf
  const gain       = endValue - startValue - cf   // pure investment return (excl. new money)
  const pct        = den ? gain / den * 100 : null
  return { startValue, endValue, cf, gain, pct }
}

// Per-account Modified Dietz for a period
function modifiedDietzByAccount(sorted, startDate, endDate) {
  const today = endDate
  return [...new Set(sorted.map(e => e.account))].map(account => {
    const acct      = sorted.filter(e => e.account === account)
    const startVal  = acct.filter(e => e.date <= startDate).reduce((_, r) => r.value, 0)
    const endVal    = acct.filter(e => e.date <= today).reduce((_, r) => r.value, 0)
    if (!endVal) return { account, pct: null, apy: null, gain: null, startVal, endVal }

    // Incremental deposits for this account within the period
    let prevCost = 0, cf = 0
    for (const row of acct) {
      if (row.cost_basis > prevCost) {
        if (row.date > startDate && row.date <= today) cf += row.cost_basis - prevCost
        prevCost = row.cost_basis
      }
    }

    const den        = startVal + cf
    const gain       = endVal - startVal - cf
    const pct        = den ? gain / den * 100 : null
    const periodDays = Math.max(1, (today - startDate) / 86400000)
    const apy        = (den && endVal / den > 0) ? (Math.pow(endVal / den, 365 / periodDays) - 1) * 100 : null
    return { account, pct, apy, gain, startVal, endVal, cf }
  })
}

function calcSummary(sorted) {
  if (!sorted.length) return null
  const today    = new Date()
  const totalVal = totalValueAsOf(sorted, today)
  const totalCost= totalCostAsOf(sorted, today)

  // All-time ROIC: simple (value − total deposited) / total deposited
  const roic          = totalCost ? (totalVal - totalCost) / totalCost * 100 : null
  const totalMultiple = totalCost ? totalVal / totalCost : null

  // Modified Dietz for rolling windows and YTD
  const jan1     = new Date(today.getFullYear(), 0, 1)
  const ago1m    = new Date(today.getFullYear(), today.getMonth() - 1,  today.getDate())
  const ago3m    = new Date(today.getFullYear(), today.getMonth() - 3,  today.getDate())
  const ago6m    = new Date(today.getFullYear(), today.getMonth() - 6,  today.getDate())
  const ytdPct   = modifiedDietz(sorted, jan1,  today)
  const mo1Pct   = modifiedDietz(sorted, ago1m, today)
  const mo3Pct   = modifiedDietz(sorted, ago3m, today)
  const mo6Pct   = modifiedDietz(sorted, ago6m, today)

  // Prior full year Modified Dietz
  const prevYear      = today.getFullYear() - 1
  const prevYearStart = new Date(prevYear, 0, 1)
  const prevYearEnd   = new Date(prevYear, 11, 31, 23, 59, 59)
  const prevYearPct   = modifiedDietz(sorted, prevYearStart, prevYearEnd)

  return {
    totalVal, totalCost, totalMultiple,
    roic, ytdPct, mo1Pct, mo3Pct, mo6Pct,
    prevYear, prevYearPct,
  }
}

function calcAnnualRows(sorted) {
  if (!sorted.length) return []
  const years = [...new Set(sorted.map(e => e.date.getFullYear()))].sort((a, b) => b - a)
  const today = new Date()
  return years.map(year => {
    const yearStart = new Date(year, 0, 1)
    const yearEnd   = year === today.getFullYear() ? today : new Date(year, 11, 31, 23, 59, 59)
    const { startValue, endValue, cf, gain, pct } = modifiedDietzDetail(sorted, yearStart, yearEnd)
    return { year, startValue, endValue, cf, gain, pct, isCurrent: year === today.getFullYear() }
  })
}

function calcPeriodPerf(sorted, startDate) {
  if (!sorted.length) return null
  const today = new Date()
  const { startValue, endValue, cf, gain, pct } = modifiedDietzDetail(sorted, startDate, today)
  if (!endValue) return null
  const den        = startValue + cf
  const periodDays = Math.max(1, (today - startDate) / 86400000)
  const apy        = (den && endValue / den > 0) ? (Math.pow(endValue / den, 365 / periodDays) - 1) * 100 : null
  return { periodReturn: pct, apy, gain, startTotal: startValue, currentTotal: endValue, cf, periodDays: Math.round(periodDays) }
}

function calcPeriodPerfByAccount(sorted, startDate) {
  return modifiedDietzByAccount(sorted, startDate, new Date())
}

function getPeriodStartDate(period, customYear, customMonth) {
  const today = new Date()
  if (period === '1M')  return new Date(today.getFullYear(), today.getMonth() - 1, today.getDate())
  if (period === '3M')  return new Date(today.getFullYear(), today.getMonth() - 3, today.getDate())
  if (period === '6M')  return new Date(today.getFullYear(), today.getMonth() - 6, today.getDate())
  if (period === 'YTD') return new Date(today.getFullYear(), 0, 1)
  if (period === '1Y')  return new Date(today.getFullYear() - 1, today.getMonth(), today.getDate())
  if (period === '3Y')  return new Date(today.getFullYear() - 3, today.getMonth(), today.getDate())
  if (period === '5Y')  return new Date(today.getFullYear() - 5, today.getMonth(), today.getDate())
  const y = parseInt(customYear)
  const m = customMonth ? parseInt(customMonth) - 1 : 0
  return new Date(y, m, 1)
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

function SkeletonRow() {
  return (
    <tr>
      {[1,2,3,4,5].map(i => (
        <td key={i} style={{ ...S.td, padding: '12px 14px' }}>
          <div style={{ height: '10px', borderRadius: '4px', background: '#1e1e2e', width: i === 1 ? '60px' : '80px' }} />
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
  const [perfPeriod, setPerfPeriod] = useState('YTD')
  const [customYear, setCustomYear] = useState('2026')
  const [customMonth, setCustomMonth] = useState('')
  const [isCustom, setIsCustom]     = useState(false)

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
  const sortedData    = useMemo(() => [...rawData].sort((a, b) => a.date - b.date), [rawData])
  const summary       = useMemo(() => calcSummary(sortedData), [sortedData])
  const annualRows    = useMemo(() => calcAnnualRows(sortedData), [sortedData])
  const chartPoints   = useMemo(() => buildChartPoints(sortedData), [sortedData])
  const accounts      = useMemo(() => [...new Set(sortedData.map(e => e.account))], [sortedData])

  const perfStartDate = useMemo(() => {
    if (isCustom) return getPeriodStartDate(null, customYear, customMonth)
    return getPeriodStartDate(perfPeriod)
  }, [perfPeriod, isCustom, customYear, customMonth])

  const perfTotal     = useMemo(() => calcPeriodPerf(sortedData, perfStartDate), [sortedData, perfStartDate])
  const perfByAccount = useMemo(() => calcPeriodPerfByAccount(sortedData, perfStartDate), [sortedData, perfStartDate])

  const availableYears = useMemo(() => {
    const y = new Date().getFullYear()
    return Array.from({ length: y - 2025 }, (_, i) => 2026 + i)
  }, [])

  const hasData = sortedData.length > 0
  const multiAccount = accounts.length > 1

  // Per-account status for blurbs (last value, last deposit, stale warning)
  const accountStatus = useMemo(() => accounts.map(account => {
    const rows = sortedData.filter(e => e.account === account)
    const lastValueRow = [...rows].reverse().find(e => e.value > 0)
    const lastValue     = lastValueRow?.value ?? 0
    const lastValueDate = lastValueRow?.date ?? null
    // Detect deposit events: cost_basis increases vs previous row for same account
    let prevCost = 0, lastDepositDate = null
    for (const row of rows) {
      if (row.cost_basis > prevCost) { lastDepositDate = row.date; prevCost = row.cost_basis }
    }
    const stale = lastDepositDate && lastValueDate && lastValueDate < lastDepositDate
    return { account, lastValue, lastValueDate, lastDepositDate, stale }
  }), [sortedData, accounts])

  // ── Handlers ───────────────────────────────────────────────────────────────

  // Record a deposit: bumps cost_basis AND market value by the deposit amount
  async function handleRecordDeposit() {
    if (!depAccount || !depAmount || !depDate) return
    setDepSaving(true)
    setDbError('')
    try {
      const amount  = parseFloat(depAmount)
      const rows    = sortedData.filter(e => e.account === depAccount)
      const lastVal = [...rows].reverse().find(e => e.value > 0)?.value ?? 0
      let prevCost = 0
      for (const row of rows) { if (row.cost_basis > prevCost) prevCost = row.cost_basis }
      await apiPost('/api/snapshots', {
        date: depDate, account: depAccount,
        value: lastVal + amount,
        cost_basis: prevCost + amount,
      })
      setDepAmount('')
      await fetchAll()
    } catch (e) { setDbError(e.message) }
    finally { setDepSaving(false) }
  }

  // Update market value only (cost_basis carries forward unchanged)
  async function handleUpdateMarketValue() {
    if (!mvAccount || !mvValue || !mvDate) return
    setMvSaving(true)
    setDbError('')
    try {
      const rows = sortedData.filter(e => e.account === mvAccount)
      let prevCost = 0
      for (const row of rows) { if (row.cost_basis > prevCost) prevCost = row.cost_basis }
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
        {['overview', 'performance', 'chart', 'annual', 'data'].map(t => (
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
            {/* Rolling returns grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '10px' }}>
              <StatCard label="YTD" value={fmtPct(summary?.ytdPct)} color={returnColor(summary?.ytdPct)} />
              <StatCard label="1M" value={fmtPct(summary?.mo1Pct)} color={returnColor(summary?.mo1Pct)} />
              <StatCard label="3M" value={fmtPct(summary?.mo3Pct)} color={returnColor(summary?.mo3Pct)} />
              <StatCard label="6M" value={fmtPct(summary?.mo6Pct)} color={returnColor(summary?.mo6Pct)} />
              <StatCard label={summary?.prevYear ? String(summary.prevYear) : 'Prior Year'} value={fmtPct(summary?.prevYearPct)} color={returnColor(summary?.prevYearPct)} />
              <StatCard label="All-Time ROIC" value={fmtPct(summary?.roic)} sub={fmtMult(summary?.totalMultiple)} color={returnColor(summary?.roic)} />
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

      {/* ── Performance ── */}
      {tab === 'performance' && (
        !hasData ? <EmptyState onGoToData={() => setTab('data')} /> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {['1M','3M','6M','YTD','1Y','3Y','5Y'].map(p => (
                <button key={p} style={S.periodBtn(!isCustom && perfPeriod === p)} onClick={() => { setPerfPeriod(p); setIsCustom(false) }}>{p}</button>
              ))}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '11px', color: '#555' }}>Custom from:</span>
              <select value={customYear} onChange={e => { setCustomYear(e.target.value); setIsCustom(true) }} style={{ ...S.input, width: 'auto', padding: '5px 10px' }}>
                {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              <select value={customMonth} onChange={e => { setCustomMonth(e.target.value); setIsCustom(true) }} style={{ ...S.input, width: 'auto', padding: '5px 10px' }}>
                <option value="">Full year</option>
                {MONTHS_SHORT.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
              </select>
              {isCustom && <span style={{ fontSize: '11px', color: '#555' }}>From {MONTHS_SHORT[customMonth ? parseInt(customMonth) - 1 : 0]} {customYear} → Today</span>}
            </div>

            {perfTotal ? (
              <div style={S.card}>
                <div style={{ fontSize: '11px', color: '#555', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '16px' }}>
                  Total Portfolio · {perfTotal.periodDays} days
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '0', overflow: 'hidden', borderRadius: '8px', border: '1px solid #1e1e2e' }}>
                  {[
                    { label: 'Return', val: fmtPct(perfTotal.periodReturn), color: returnColor(perfTotal.periodReturn) },
                    { label: 'APY', val: fmtPct(perfTotal.apy), color: returnColor(perfTotal.apy) },
                    { label: '$ Gain', val: fmt$(perfTotal.gain), color: returnColor(perfTotal.gain) },
                  ].map((item, i) => (
                    <div key={i} style={{ textAlign: 'center', padding: '16px 8px', borderRight: i < 2 ? '1px solid #1e1e2e' : 'none', background: '#0f0f18' }}>
                      <div style={{ fontSize: '20px', fontFamily: "'Syne',sans-serif", fontWeight: 800, color: item.color }}>{item.val}</div>
                      <div style={{ fontSize: '10px', color: '#444', marginTop: '4px', textTransform: 'uppercase', letterSpacing: '0.8px' }}>{item.label}</div>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '12px', fontSize: '11px', color: '#555' }}>
                  <span>Start: {fmt$(perfTotal.startTotal)}</span>
                  <span>Now: {fmt$(perfTotal.currentTotal)}</span>
                </div>
              </div>
            ) : (
              <div style={{ ...S.card, color: '#555', fontSize: '12px', textAlign: 'center' }}>No data available for this period</div>
            )}

            {summary && (
              <div style={S.card}>
                <div style={{ fontSize: '11px', color: '#555', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '14px' }}>Return on Invested Money (all-time)</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '12px', textAlign: 'center' }}>
                  {[
                    { label: 'Multiple', val: fmtMult(summary.totalMultiple), color: PURPLE },
                    { label: 'All-Time ROIC', val: fmtPct(summary.roic), color: returnColor(summary.roic) },
                    { label: 'Unrealized', val: fmt$(summary.totalVal - summary.totalCost), color: returnColor(summary.roic) },
                  ].map((item, i) => (
                    <div key={i}>
                      <div style={{ fontSize: '18px', fontFamily: "'Syne',sans-serif", fontWeight: 800, color: item.color }}>{item.val}</div>
                      <div style={{ fontSize: '10px', color: '#444', marginTop: '4px', textTransform: 'uppercase', letterSpacing: '0.8px' }}>{item.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {multiAccount && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ fontSize: '11px', color: '#555', textTransform: 'uppercase', letterSpacing: '1px' }}>By Account</div>
                {perfByAccount.map(acct => (
                  <div key={acct.account} style={{ ...S.card, display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                    <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: '13px', minWidth: '90px' }}>{acct.account}</div>
                    <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '8px', textAlign: 'center' }}>
                      {[
                        { label: 'Return (MD)', val: fmtPct(acct.pct), color: returnColor(acct.pct) },
                        { label: 'APY', val: fmtPct(acct.apy), color: returnColor(acct.apy) },
                        { label: 'Gain', val: fmt$(acct.gain), color: returnColor(acct.gain) },
                      ].map((item, i) => (
                        <div key={i}>
                          <div style={{ fontSize: '14px', fontWeight: 700, color: item.color }}>{item.val}</div>
                          <div style={{ fontSize: '9px', color: '#444', textTransform: 'uppercase' }}>{item.label}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
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
                  <th style={S.th}>Start</th>
                  <th style={S.th}>Deposits</th>
                  <th style={S.th}>End Value</th>
                  <th style={S.th}>Return (MD)</th>
                </tr></thead>
                <tbody>
                  {loading ? [1,2,3].map(i => <SkeletonRow key={i} />) : annualRows.map(row => (
                    <tr key={row.year}>
                      <td style={S.tdLeft}>{row.year}{row.isCurrent ? <span style={{ color: '#444', fontSize: '10px' }}> YTD</span> : ''}</td>
                      <td style={S.td}>{fmt$(row.startValue)}</td>
                      <td style={S.td}>{fmt$(row.cf)}</td>
                      <td style={S.td}>{fmt$(row.endValue)}</td>
                      <td style={{ ...S.td, color: returnColor(row.pct), fontFamily: "'Syne',sans-serif", fontWeight: 800 }}>{fmtPct(row.pct)}</td>
                    </tr>
                  ))}
                </tbody>
                {hasData && (() => {
                  const now     = new Date()
                  const totCost = totalCostAsOf(sortedData, now)
                  const totVal  = totalValueAsOf(sortedData, now)
                  const gain    = totVal - totCost
                  const pct     = totCost ? gain / totCost * 100 : null   // ROIC (all-time)
                  return (
                    <tfoot><tr style={{ background: '#0a0a12' }}>
                      <td style={{ ...S.tdLeft, borderTop: '1px solid #2a2a3a', color: '#888', fontWeight: 500 }}>All-time ROIC</td>
                      <td style={{ ...S.td, borderTop: '1px solid #2a2a3a', color: '#888' }} colSpan={2}>{fmt$(totCost)} invested</td>
                      <td style={{ ...S.td, borderTop: '1px solid #2a2a3a', color: '#888' }}>{fmt$(totVal)}</td>
                      <td style={{ ...S.td, borderTop: '1px solid #2a2a3a', color: returnColor(pct), fontFamily: "'Syne',sans-serif", fontWeight: 800 }}>{fmtPct(pct)}</td>
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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '10px' }}>
              {accountStatus.map(({ account, lastValue, lastValueDate, lastDepositDate, stale }) => (
                <div key={account} style={{ ...S.card, position: 'relative', borderColor: stale ? '#f8717144' : '#1e1e2e' }}>
                  {stale && (
                    <div style={{ position: 'absolute', top: '10px', right: '12px', fontSize: '14px' }} title="Market value not updated since last deposit">⚠️</div>
                  )}
                  <div style={{ fontSize: '11px', color: '#555', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>{account}</div>
                  <div style={{ fontSize: '22px', fontFamily: "'Syne',sans-serif", fontWeight: 800, color: PURPLE }}>{fmt$(lastValue)}</div>
                  <div style={{ fontSize: '10px', color: '#444', marginTop: '6px' }}>
                    Value updated: <span style={{ color: '#666' }}>{lastValueDate ? lastValueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</span>
                  </div>
                  {lastDepositDate && (
                    <div style={{ fontSize: '10px', color: stale ? '#f87171aa' : '#444', marginTop: '2px' }}>
                      Last deposit: <span style={{ color: stale ? '#f87171' : '#666' }}>{lastDepositDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                      {stale && <span style={{ marginLeft: '4px', color: '#f87171', fontSize: '9px' }}>· update needed</span>}
                    </div>
                  )}
                </div>
              ))}
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
            {depAccount && depAmount && (() => {
              const rows   = sortedData.filter(e => e.account === depAccount)
              const lastVal = [...rows].reverse().find(e => e.value > 0)?.value ?? 0
              const amt     = parseFloat(depAmount) || 0
              return amt > 0 ? (
                <div style={{ fontSize: '10px', color: '#555', marginTop: '10px' }}>
                  New market value for <span style={{ color: '#888' }}>{depAccount}</span>: {fmt$(lastVal)} + {fmt$(amt)} = <span style={{ color: GREEN }}>{fmt$(lastVal + amt)}</span>
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

                  {loading ? [1,2,3].map(i => <SkeletonRow key={i} />) : [...sortedData].reverse().map(row => (
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
