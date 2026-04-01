import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'

// ─── Constants ────────────────────────────────────────────────────────────────

const PURPLE = '#7c6af7'
const GREEN  = '#4ade80'
const RED    = '#f87171'
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

const SAMPLE_CSV = `date,account,value,cost_basis
2026-01-01,Robinhood,10000,10000
2026-01-01,401k,25000,22000
2026-02-01,Robinhood,10800,10500
2026-02-01,401k,25900,22500
2026-03-01,Robinhood,10400,10500
2026-03-01,401k,26800,23000
2026-04-01,Robinhood,11600,11000
2026-04-01,401k,28100,23500`

const STORAGE_KEY = 'returns_tracker_data'

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

// ─── CSV Parsing ─────────────────────────────────────────────────────────────

function parseCSV(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  if (lines.length < 2) return { data: [], error: 'Need at least a header row and one data row.' }

  const header = lines[0].toLowerCase().split(',').map(h => h.trim())
  const dateIdx = header.indexOf('date')
  const valueIdx = header.indexOf('value')
  const costIdx = header.indexOf('cost_basis')
  const accountIdx = header.indexOf('account')

  if (dateIdx === -1 || valueIdx === -1 || costIdx === -1) {
    return { data: [], error: 'Header must include: date, value, cost_basis (account is optional).' }
  }

  const data = []
  const errors = []

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map(c => c.trim())
    const dateRaw = cols[dateIdx]
    const valueRaw = cols[valueIdx]
    const costRaw = cols[costIdx]
    const account = accountIdx !== -1 && cols[accountIdx] ? cols[accountIdx] : 'Default'

    const date = new Date(dateRaw)
    if (isNaN(date.getTime())) { errors.push(`Row ${i + 1}: invalid date "${dateRaw}"`); continue }

    const value = parseFloat(valueRaw)
    const cost_basis = parseFloat(costRaw)
    if (!isFinite(value) || value < 0) { errors.push(`Row ${i + 1}: invalid value "${valueRaw}"`); continue }
    if (!isFinite(cost_basis) || cost_basis < 0) { errors.push(`Row ${i + 1}: invalid cost_basis "${costRaw}"`); continue }

    data.push({ id: `${dateRaw}_${account}_${i}`, date, account, value, cost_basis })
  }

  if (data.length < 2) {
    return { data: [], error: errors.length ? errors.join(' | ') : 'Need at least 2 valid data rows.' }
  }

  data.sort((a, b) => a.date - b.date)
  return { data, error: null }
}

// ─── Calculation Helpers ──────────────────────────────────────────────────────

// Get latest entry per account as of a given date (Date object)
function latestPerAccountAsOf(sorted, asOfDate) {
  const byAccount = {}
  for (const row of sorted) {
    if (row.date <= asOfDate) byAccount[row.account] = row
  }
  return Object.values(byAccount)
}

// Sum value and cost_basis across an array of entries
function sumEntries(entries) {
  return entries.reduce((acc, e) => ({ value: acc.value + e.value, cost_basis: acc.cost_basis + e.cost_basis }), { value: 0, cost_basis: 0 })
}

function calcSummary(sorted) {
  if (!sorted.length) return null
  const today = new Date()
  const latest = latestPerAccountAsOf(sorted, today)
  const { value: totalValue, cost_basis: totalCost } = sumEntries(latest)

  // YTD: Jan 1 of current year
  const jan1 = new Date(today.getFullYear(), 0, 1)
  const ytdEntries = latestPerAccountAsOf(sorted, jan1)
  const ytdStart = sumEntries(ytdEntries).value || totalValue
  const ytdPct = ytdStart ? (totalValue - ytdStart) / ytdStart * 100 : null

  // MTD: 1st of current month
  const month1 = new Date(today.getFullYear(), today.getMonth(), 1)
  const mtdEntries = latestPerAccountAsOf(sorted, month1)
  const mtdStart = sumEntries(mtdEntries).value || totalValue
  const mtdPct = mtdStart ? (totalValue - mtdStart) / mtdStart * 100 : null

  return {
    totalValue,
    totalCost,
    totalMultiple: totalCost ? totalValue / totalCost : null,
    totalReturnPct: totalCost ? (totalValue - totalCost) / totalCost * 100 : null,
    ytdPct,
    mtdPct,
  }
}

function calcAnnualRows(sorted) {
  if (!sorted.length) return []
  const years = [...new Set(sorted.map(e => e.date.getFullYear()))].sort((a, b) => b - a)
  const today = new Date()

  return years.map(year => {
    const yearStart = new Date(year, 0, 1)
    const yearEnd = year === today.getFullYear() ? today : new Date(year, 11, 31, 23, 59, 59)
    const startEntries = latestPerAccountAsOf(sorted, yearStart)
    const endEntries = latestPerAccountAsOf(sorted, yearEnd)
    const startVal = sumEntries(startEntries).value
    const endVal = sumEntries(endEntries).value
    const gain = endVal - startVal
    const pct = startVal ? gain / startVal * 100 : null
    return { year, startVal, endVal, gain, pct, isCurrent: year === today.getFullYear() }
  })
}

function calcPeriodPerf(sorted, startDate) {
  if (!sorted.length) return null
  const today = new Date()
  const startEntries = latestPerAccountAsOf(sorted, startDate)
  if (!startEntries.length) return null
  const { value: startTotal } = sumEntries(startEntries)
  const { value: currentTotal } = sumEntries(latestPerAccountAsOf(sorted, today))
  if (!startTotal) return null
  const periodDays = Math.max(1, (today - startDate) / 86400000)
  const periodReturn = (currentTotal - startTotal) / startTotal * 100
  const apy = (Math.pow(currentTotal / startTotal, 365 / periodDays) - 1) * 100
  const gain = currentTotal - startTotal
  return { periodReturn, apy, gain, startTotal, currentTotal, periodDays: Math.round(periodDays) }
}

function calcPeriodPerfByAccount(sorted, startDate) {
  const accounts = [...new Set(sorted.map(e => e.account))]
  const today = new Date()
  return accounts.map(account => {
    const acctSorted = sorted.filter(e => e.account === account)
    const startEntries = acctSorted.filter(e => e.date <= startDate)
    if (!startEntries.length) return { account, periodReturn: null, apy: null, gain: null, startVal: null, currentVal: null }
    const startVal = startEntries[startEntries.length - 1].value
    const currentEntries = acctSorted.filter(e => e.date <= today)
    const currentVal = currentEntries.length ? currentEntries[currentEntries.length - 1].value : startVal
    const periodDays = Math.max(1, (today - startDate) / 86400000)
    const periodReturn = (currentVal - startVal) / startVal * 100
    const apy = (Math.pow(currentVal / startVal, 365 / periodDays) - 1) * 100
    const gain = currentVal - startVal
    return { account, periodReturn, apy, gain, startVal, currentVal }
  })
}

function getPeriodStartDate(period, customYear, customMonth) {
  const today = new Date()
  if (period === '1M') return new Date(today.getFullYear(), today.getMonth() - 1, today.getDate())
  if (period === '3M') return new Date(today.getFullYear(), today.getMonth() - 3, today.getDate())
  if (period === '6M') return new Date(today.getFullYear(), today.getMonth() - 6, today.getDate())
  if (period === 'YTD') return new Date(today.getFullYear(), 0, 1)
  if (period === '1Y') return new Date(today.getFullYear() - 1, today.getMonth(), today.getDate())
  if (period === '3Y') return new Date(today.getFullYear() - 3, today.getMonth(), today.getDate())
  if (period === '5Y') return new Date(today.getFullYear() - 5, today.getMonth(), today.getDate())
  // Custom
  const y = parseInt(customYear)
  const m = customMonth ? parseInt(customMonth) - 1 : 0
  return new Date(y, m, 1)
}

function buildChartPoints(sorted) {
  if (!sorted.length) return []
  // Group by date, sum across accounts
  const byDate = {}
  for (const row of sorted) {
    const key = row.date.toISOString().slice(0, 10)
    if (!byDate[key]) byDate[key] = { date: row.date, value: 0, cost_basis: 0 }
    byDate[key].value += row.value
    byDate[key].cost_basis += row.cost_basis
  }
  return Object.values(byDate)
    .sort((a, b) => a.date - b.date)
    .map(d => ({
      label: d.date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
      value: Math.round(d.value),
      cost_basis: Math.round(d.cost_basis),
    }))
}

function getAccountList(sorted) {
  return [...new Set(sorted.map(e => e.account))]
}

// ─── Sub-components ───────────────────────────────────────────────────────────

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

function EmptyState({ onGoToData }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: '12px', textAlign: 'center', paddingTop: '60px' }}>
      <div style={{ fontSize: '40px' }}>📊</div>
      <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: '16px' }}>No data yet</div>
      <div style={{ fontSize: '12px', color: '#555', lineHeight: 1.7, maxWidth: '260px' }}>
        Import a CSV to start tracking your investment returns.
      </div>
      <button onClick={onGoToData} style={{ ...S.btn('primary'), marginTop: '8px', padding: '9px 20px', fontSize: '12px' }}>
        + Import CSV
      </button>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ReturnsTracker() {
  const navigate = useNavigate()

  // ── State ──────────────────────────────────────────────────────────────────
  const [rawData, setRawData] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (!saved) return []
      return JSON.parse(saved).map(d => ({ ...d, date: new Date(d.date) }))
    } catch { return [] }
  })

  const [tab, setTab]               = useState('overview')
  const [perfPeriod, setPerfPeriod] = useState('YTD')
  const [customYear, setCustomYear] = useState('2026')
  const [customMonth, setCustomMonth] = useState('')
  const [isCustom, setIsCustom]     = useState(false)

  const [csvText, setCsvText]       = useState('')
  const [csvError, setCsvError]     = useState('')
  const [showSample, setShowSample] = useState(false)
  const [showCsvImport, setShowCsvImport] = useState(false)

  const [editingId, setEditingId]   = useState(null)
  const [editDraft, setEditDraft]   = useState({})
  const [addingNew, setAddingNew]   = useState(false)
  const [newDraft, setNewDraft]     = useState({ date: '', account: '', value: '', cost_basis: '' })
  const [deleteConfirmId, setDeleteConfirmId] = useState(null)

  // ── Derived Data ───────────────────────────────────────────────────────────
  const sortedData = useMemo(() => [...rawData].sort((a, b) => a.date - b.date), [rawData])
  const summary    = useMemo(() => calcSummary(sortedData), [sortedData])
  const annualRows = useMemo(() => calcAnnualRows(sortedData), [sortedData])
  const chartPoints = useMemo(() => buildChartPoints(sortedData), [sortedData])
  const accounts   = useMemo(() => getAccountList(sortedData), [sortedData])

  const perfStartDate = useMemo(() => {
    if (isCustom) return getPeriodStartDate(null, customYear, customMonth)
    return getPeriodStartDate(perfPeriod)
  }, [perfPeriod, isCustom, customYear, customMonth])

  const perfTotal      = useMemo(() => calcPeriodPerf(sortedData, perfStartDate), [sortedData, perfStartDate])
  const perfByAccount  = useMemo(() => calcPeriodPerfByAccount(sortedData, perfStartDate), [sortedData, perfStartDate])

  const availableYears = useMemo(() => {
    const thisYear = new Date().getFullYear()
    const years = []
    for (let y = 2026; y <= thisYear; y++) years.push(y)
    return years
  }, [])

  // ── Persistence helper ─────────────────────────────────────────────────────
  function saveData(data) {
    setRawData(data)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data.map(d => ({ ...d, date: d.date.toISOString() }))))
  }

  // ── CSV Import ─────────────────────────────────────────────────────────────
  function handleImport() {
    const { data, error } = parseCSV(csvText)
    if (error) { setCsvError(error); return }
    const existing = rawData.filter(e => !data.find(d =>
      d.date.toDateString() === e.date.toDateString() && d.account === e.account
    ))
    saveData([...existing, ...data])
    setCsvError('')
    setCsvText('')
    setShowCsvImport(false)
    setTab('overview')
  }

  // ── Data editing ───────────────────────────────────────────────────────────
  function startEdit(row) {
    setEditingId(row.id)
    setEditDraft({
      date: row.date.toISOString().slice(0, 10),
      account: row.account,
      value: String(row.value),
      cost_basis: String(row.cost_basis),
    })
  }
  function saveEdit(id) {
    const d = new Date(editDraft.date)
    if (isNaN(d)) return
    const updated = rawData.map(r => r.id === id
      ? { ...r, date: d, account: editDraft.account || 'Default', value: parseFloat(editDraft.value), cost_basis: parseFloat(editDraft.cost_basis) }
      : r)
    saveData(updated)
    setEditingId(null)
  }
  function deleteRow(id) {
    saveData(rawData.filter(r => r.id !== id))
    setDeleteConfirmId(null)
  }
  function saveNewEntry() {
    const d = new Date(newDraft.date)
    if (isNaN(d)) return
    const entry = {
      id: `manual_${Date.now()}`,
      date: d,
      account: newDraft.account || 'Default',
      value: parseFloat(newDraft.value),
      cost_basis: parseFloat(newDraft.cost_basis),
    }
    if (!isFinite(entry.value) || !isFinite(entry.cost_basis)) return
    saveData([...rawData, entry])
    setAddingNew(false)
    setNewDraft({ date: '', account: '', value: '', cost_basis: '' })
  }

  // ── Period selection ───────────────────────────────────────────────────────
  function selectPeriod(p) {
    setPerfPeriod(p)
    setIsCustom(false)
  }
  function selectCustom() {
    setIsCustom(true)
    setPerfPeriod(null)
  }

  const hasData = sortedData.length > 0
  const multiAccount = accounts.length > 1

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
        <button onClick={() => setTab('data')} style={{ ...S.btn('primary'), fontSize: '11px', padding: '7px 14px' }}>
          {hasData ? '+ Add / Edit' : '+ Import CSV'}
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #1e1e2e', marginBottom: '24px', overflowX: 'auto', gap: '0' }}>
        {['overview', 'performance', 'chart', 'annual', 'data'].map(t => (
          <button key={t} style={S.tab(tab === t)} onClick={() => setTab(t)}>
            {t === 'data' ? 'Data' : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* ── Overview Tab ── */}
      {tab === 'overview' && (
        !hasData
          ? <EmptyState onGoToData={() => setTab('data')} />
          : <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Summary Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
                <StatCard
                  label="Total Multiple"
                  value={fmtMult(summary?.totalMultiple)}
                  sub={`${fmt$(summary?.totalValue)} total`}
                  color={PURPLE}
                />
                <StatCard
                  label="Total Return"
                  value={fmtPct(summary?.totalReturnPct)}
                  sub={`${fmt$(summary?.totalValue - summary?.totalCost)} gain`}
                  color={returnColor(summary?.totalReturnPct)}
                />
                <StatCard
                  label="YTD Return"
                  value={fmtPct(summary?.ytdPct)}
                  color={returnColor(summary?.ytdPct)}
                />
                <StatCard
                  label="MTD Return"
                  value={fmtPct(summary?.mtdPct)}
                  color={returnColor(summary?.mtdPct)}
                />
              </div>

              {/* ROI summary */}
              <div style={{ ...S.card, display: 'flex', gap: '0', overflow: 'hidden', padding: 0 }}>
                {[
                  { label: 'Invested', val: fmt$(summary?.totalCost), color: '#e8e8e0' },
                  { label: 'Current Value', val: fmt$(summary?.totalValue), color: PURPLE },
                  { label: 'Unrealized Gain', val: fmt$(summary?.totalValue - summary?.totalCost), color: returnColor(summary?.totalReturnPct) },
                ].map((item, i) => (
                  <div key={i} style={{ flex: 1, textAlign: 'center', padding: '16px 10px', borderRight: i < 2 ? '1px solid #1e1e2e' : 'none' }}>
                    <div style={{ fontSize: '16px', fontFamily: "'Syne', sans-serif", fontWeight: 800, color: item.color }}>{item.val}</div>
                    <div style={{ fontSize: '10px', color: '#444', marginTop: '4px', textTransform: 'uppercase', letterSpacing: '0.8px' }}>{item.label}</div>
                  </div>
                ))}
              </div>

              {/* Annual preview */}
              {annualRows.length > 0 && (
                <div style={S.card}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <div style={{ fontSize: '11px', color: '#555', textTransform: 'uppercase', letterSpacing: '1px' }}>Annual Returns</div>
                    <button onClick={() => setTab('annual')} style={{ background: 'transparent', border: 'none', color: PURPLE, fontSize: '11px', cursor: 'pointer', fontFamily: "'DM Mono', monospace" }}>
                      View all →
                    </button>
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={S.thLeft}>Year</th>
                        <th style={S.th}>End Value</th>
                        <th style={S.th}>Return</th>
                      </tr>
                    </thead>
                    <tbody>
                      {annualRows.slice(0, 3).map(row => (
                        <tr key={row.year}>
                          <td style={S.tdLeft}>{row.year}{row.isCurrent ? ' (YTD)' : ''}</td>
                          <td style={S.td}>{fmt$(row.endVal)}</td>
                          <td style={{ ...S.td, color: returnColor(row.pct), fontFamily: "'Syne', sans-serif", fontWeight: 800 }}>
                            {fmtPct(row.pct)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
      )}

      {/* ── Performance Tab ── */}
      {tab === 'performance' && (
        !hasData
          ? <EmptyState onGoToData={() => setTab('data')} />
          : <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Period buttons */}
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {['1M', '3M', '6M', 'YTD', '1Y', '3Y', '5Y'].map(p => (
                  <button key={p} style={S.periodBtn(!isCustom && perfPeriod === p)} onClick={() => selectPeriod(p)}>
                    {p}
                  </button>
                ))}
              </div>

              {/* Custom date selector */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '11px', color: '#555' }}>Custom from:</span>
                <select
                  value={customYear}
                  onChange={e => { setCustomYear(e.target.value); selectCustom() }}
                  style={{ ...S.input, width: 'auto', padding: '5px 10px' }}
                >
                  {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
                <select
                  value={customMonth}
                  onChange={e => { setCustomMonth(e.target.value); selectCustom() }}
                  style={{ ...S.input, width: 'auto', padding: '5px 10px' }}
                >
                  <option value="">Full year</option>
                  {MONTHS_SHORT.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                </select>
                {isCustom && (
                  <span style={{ fontSize: '11px', color: '#555' }}>
                    From {MONTHS_SHORT[customMonth ? parseInt(customMonth) - 1 : 0]} {customYear} → Today
                  </span>
                )}
              </div>

              {/* Total performance card */}
              {perfTotal ? (
                <div style={S.card}>
                  <div style={{ fontSize: '11px', color: '#555', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '16px' }}>
                    Total Portfolio · {perfTotal.periodDays} days
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0', overflow: 'hidden', borderRadius: '8px', border: '1px solid #1e1e2e' }}>
                    {[
                      { label: 'Return', val: fmtPct(perfTotal.periodReturn), color: returnColor(perfTotal.periodReturn) },
                      { label: 'APY', val: fmtPct(perfTotal.apy), color: returnColor(perfTotal.apy) },
                      { label: '$ Gain', val: fmt$(perfTotal.gain), color: returnColor(perfTotal.gain) },
                    ].map((item, i) => (
                      <div key={i} style={{ textAlign: 'center', padding: '16px 8px', borderRight: i < 2 ? '1px solid #1e1e2e' : 'none', background: '#0f0f18' }}>
                        <div style={{ fontSize: '20px', fontFamily: "'Syne', sans-serif", fontWeight: 800, color: item.color }}>{item.val}</div>
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
                <div style={{ ...S.card, color: '#555', fontSize: '12px', textAlign: 'center' }}>
                  No data available for this period
                </div>
              )}

              {/* Return on Invested Money */}
              {summary && (
                <div style={S.card}>
                  <div style={{ fontSize: '11px', color: '#555', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '14px' }}>
                    Return on Invested Money (all-time)
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', textAlign: 'center' }}>
                    <div>
                      <div style={{ fontSize: '18px', fontFamily: "'Syne', sans-serif", fontWeight: 800, color: PURPLE }}>{fmtMult(summary.totalMultiple)}</div>
                      <div style={{ fontSize: '10px', color: '#444', marginTop: '4px', textTransform: 'uppercase', letterSpacing: '0.8px' }}>Multiple</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '18px', fontFamily: "'Syne', sans-serif", fontWeight: 800, color: returnColor(summary.totalReturnPct) }}>{fmtPct(summary.totalReturnPct)}</div>
                      <div style={{ fontSize: '10px', color: '#444', marginTop: '4px', textTransform: 'uppercase', letterSpacing: '0.8px' }}>Total ROI</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '18px', fontFamily: "'Syne', sans-serif", fontWeight: 800, color: returnColor(summary.totalReturnPct) }}>{fmt$(summary.totalValue - summary.totalCost)}</div>
                      <div style={{ fontSize: '10px', color: '#444', marginTop: '4px', textTransform: 'uppercase', letterSpacing: '0.8px' }}>Unrealized</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Per-account breakdown */}
              {multiAccount && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ fontSize: '11px', color: '#555', textTransform: 'uppercase', letterSpacing: '1px' }}>By Account</div>
                  {perfByAccount.map(acct => (
                    <div key={acct.account} style={{ ...S.card, display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                      <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: '13px', minWidth: '90px' }}>{acct.account}</div>
                      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', textAlign: 'center' }}>
                        <div>
                          <div style={{ fontSize: '14px', fontWeight: 700, color: returnColor(acct.periodReturn) }}>{fmtPct(acct.periodReturn)}</div>
                          <div style={{ fontSize: '9px', color: '#444', textTransform: 'uppercase' }}>Return</div>
                        </div>
                        <div>
                          <div style={{ fontSize: '14px', fontWeight: 700, color: returnColor(acct.apy) }}>{fmtPct(acct.apy)}</div>
                          <div style={{ fontSize: '9px', color: '#444', textTransform: 'uppercase' }}>APY</div>
                        </div>
                        <div>
                          <div style={{ fontSize: '14px', fontWeight: 700, color: returnColor(acct.gain) }}>{fmt$(acct.gain)}</div>
                          <div style={{ fontSize: '9px', color: '#444', textTransform: 'uppercase' }}>Gain</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
      )}

      {/* ── Chart Tab ── */}
      {tab === 'chart' && (
        !hasData
          ? <EmptyState onGoToData={() => setTab('data')} />
          : <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={S.card}>
                <div style={{ fontSize: '11px', color: '#555', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '16px' }}>
                  Portfolio Value Over Time
                </div>
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={chartPoints} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
                    <XAxis
                      dataKey="label"
                      tick={{ fill: '#555', fontSize: 10, fontFamily: 'DM Mono' }}
                      axisLine={false}
                      tickLine={false}
                      interval={Math.max(0, Math.ceil(chartPoints.length / 8) - 1)}
                    />
                    <YAxis
                      tick={{ fill: '#555', fontSize: 10, fontFamily: 'DM Mono' }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={v => '$' + (v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v)}
                      width={52}
                    />
                    <Tooltip
                      contentStyle={{ background: '#16161e', border: '1px solid #2a2a3a', borderRadius: '8px', fontSize: '12px', fontFamily: 'DM Mono' }}
                      formatter={(v, name) => [fmt$(v), name === 'value' ? 'Portfolio Value' : 'Cost Basis']}
                    />
                    <Line type="monotone" dataKey="value" stroke={PURPLE} strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="cost_basis" stroke="#3a3a5c" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
                  </LineChart>
                </ResponsiveContainer>
                {/* Legend */}
                <div style={{ display: 'flex', gap: '20px', marginTop: '12px', justifyContent: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#888' }}>
                    <div style={{ width: '16px', height: '2px', background: PURPLE, borderRadius: '2px' }} /> Portfolio Value
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#888' }}>
                    <div style={{ width: '16px', height: '2px', background: '#3a3a5c', borderRadius: '2px', borderTop: '2px dashed #3a3a5c' }} /> Cost Basis
                  </div>
                </div>
              </div>
            </div>
      )}

      {/* ── Annual Tab ── */}
      {tab === 'annual' && (
        !hasData
          ? <EmptyState onGoToData={() => setTab('data')} />
          : <div style={S.card}>
              <div style={{ fontSize: '11px', color: '#555', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px' }}>
                Annual Returns
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '380px' }}>
                  <thead>
                    <tr>
                      <th style={S.thLeft}>Year</th>
                      <th style={S.th}>Start</th>
                      <th style={S.th}>End</th>
                      <th style={S.th}>$ Gain</th>
                      <th style={S.th}>Return</th>
                    </tr>
                  </thead>
                  <tbody>
                    {annualRows.map(row => (
                      <tr key={row.year}>
                        <td style={S.tdLeft}>{row.year}{row.isCurrent ? <span style={{ color: '#444', fontSize: '10px' }}> YTD</span> : ''}</td>
                        <td style={S.td}>{fmt$(row.startVal)}</td>
                        <td style={S.td}>{fmt$(row.endVal)}</td>
                        <td style={{ ...S.td, color: returnColor(row.gain) }}>{fmt$(row.gain)}</td>
                        <td style={{ ...S.td, color: returnColor(row.pct), fontFamily: "'Syne', sans-serif", fontWeight: 800 }}>
                          {fmtPct(row.pct)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {/* All-time footer */}
                  {sortedData.length > 0 && (() => {
                    const first = latestPerAccountAsOf(sortedData, sortedData[0].date)
                    const last = latestPerAccountAsOf(sortedData, new Date())
                    const s = sumEntries(first)
                    const e = sumEntries(last)
                    const gain = e.value - s.value
                    const pct = s.value ? gain / s.value * 100 : null
                    return (
                      <tfoot>
                        <tr style={{ background: '#0a0a12' }}>
                          <td style={{ ...S.tdLeft, borderTop: '1px solid #2a2a3a', color: '#888', fontWeight: 500 }}>All-time</td>
                          <td style={{ ...S.td, borderTop: '1px solid #2a2a3a', color: '#888' }}>{fmt$(s.value)}</td>
                          <td style={{ ...S.td, borderTop: '1px solid #2a2a3a', color: '#888' }}>{fmt$(e.value)}</td>
                          <td style={{ ...S.td, borderTop: '1px solid #2a2a3a', color: returnColor(gain) }}>{fmt$(gain)}</td>
                          <td style={{ ...S.td, borderTop: '1px solid #2a2a3a', color: returnColor(pct), fontFamily: "'Syne', sans-serif", fontWeight: 800 }}>
                            {fmtPct(pct)}
                          </td>
                        </tr>
                      </tfoot>
                    )
                  })()}
                </table>
              </div>
            </div>
      )}

      {/* ── Data Tab ── */}
      {tab === 'data' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

          {/* Import CSV — shown first if no data, else collapsible */}
          {!hasData ? (
            <div style={S.card}>
              <div style={{ fontSize: '13px', fontFamily: "'Syne', sans-serif", fontWeight: 800, marginBottom: '6px' }}>Import Portfolio Data</div>
              <div style={{ fontSize: '11px', color: '#555', marginBottom: '14px' }}>Paste CSV with date, value, cost_basis (and optional account) columns.</div>
              <textarea
                rows={8}
                value={csvText}
                onChange={e => setCsvText(e.target.value)}
                placeholder={'date,account,value,cost_basis\n2026-01-01,Robinhood,10000,10000\n2026-01-01,401k,25000,22000'}
                style={{ ...S.input, resize: 'vertical', lineHeight: 1.6 }}
              />
              {csvError && <div style={{ color: RED, fontSize: '11px', marginTop: '8px' }}>{csvError}</div>}
              <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
                <button onClick={handleImport} style={{ ...S.btn('primary'), flex: 1, padding: '9px', fontSize: '12px' }}>Import Data</button>
                <button onClick={() => setShowSample(s => !s)} style={S.btn()}>
                  {showSample ? 'Hide sample' : 'Show sample'}
                </button>
              </div>
              {showSample && (
                <pre style={{ marginTop: '12px', background: '#0a0a0f', border: `1px solid ${PURPLE}44`, borderRadius: '8px', padding: '12px', fontSize: '11px', overflowX: 'auto', color: '#aaa', lineHeight: 1.6 }}>
                  {SAMPLE_CSV}
                </pre>
              )}
              {/* Format reference */}
              <div style={{ marginTop: '16px', fontSize: '10px', color: '#444', lineHeight: 2, borderTop: '1px solid #1e1e2e', paddingTop: '12px' }}>
                <div><span style={{ color: '#666' }}>date</span> — ISO format YYYY-MM-DD</div>
                <div><span style={{ color: '#666' }}>account</span> — account name (optional, defaults to "Default")</div>
                <div><span style={{ color: '#666' }}>value</span> — current market value of portfolio on that date</div>
                <div><span style={{ color: '#666' }}>cost_basis</span> — total amount invested (cumulative) on that date</div>
              </div>
            </div>
          ) : (
            <>
              {/* Existing data table */}
              <div style={S.card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ fontSize: '11px', color: '#555', textTransform: 'uppercase', letterSpacing: '1px' }}>
                    {sortedData.length} entries
                  </div>
                  <button onClick={() => setAddingNew(true)} style={S.btn('primary')}>+ Add Entry</button>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '420px' }}>
                    <thead>
                      <tr>
                        <th style={S.thLeft}>Date</th>
                        <th style={S.thLeft}>Account</th>
                        <th style={S.th}>Value</th>
                        <th style={S.th}>Cost Basis</th>
                        <th style={{ ...S.th, textAlign: 'center' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* Add new row */}
                      {addingNew && (
                        <tr style={{ background: PURPLE + '11' }}>
                          <td style={{ ...S.tdLeft, padding: '6px 8px' }}>
                            <input type="date" value={newDraft.date} onChange={e => setNewDraft(d => ({ ...d, date: e.target.value }))} style={{ ...S.input, padding: '5px 8px' }} />
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
                              <button onClick={saveNewEntry} style={S.btn('primary')}>Save</button>
                              <button onClick={() => setAddingNew(false)} style={S.btn()}>✕</button>
                            </div>
                          </td>
                        </tr>
                      )}
                      {[...sortedData].reverse().map(row => (
                        editingId === row.id ? (
                          <tr key={row.id} style={{ background: PURPLE + '11' }}>
                            <td style={{ ...S.tdLeft, padding: '6px 8px' }}>
                              <input type="date" value={editDraft.date} onChange={e => setEditDraft(d => ({ ...d, date: e.target.value }))} style={{ ...S.input, padding: '5px 8px' }} />
                            </td>
                            <td style={{ ...S.tdLeft, padding: '6px 8px' }}>
                              <input value={editDraft.account} onChange={e => setEditDraft(d => ({ ...d, account: e.target.value }))} style={{ ...S.input, padding: '5px 8px' }} />
                            </td>
                            <td style={{ ...S.td, padding: '6px 8px' }}>
                              <input type="number" value={editDraft.value} onChange={e => setEditDraft(d => ({ ...d, value: e.target.value }))} style={{ ...S.input, padding: '5px 8px', textAlign: 'right' }} />
                            </td>
                            <td style={{ ...S.td, padding: '6px 8px' }}>
                              <input type="number" value={editDraft.cost_basis} onChange={e => setEditDraft(d => ({ ...d, cost_basis: e.target.value }))} style={{ ...S.input, padding: '5px 8px', textAlign: 'right' }} />
                            </td>
                            <td style={{ ...S.td, textAlign: 'center', padding: '6px 8px' }}>
                              <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                                <button onClick={() => saveEdit(row.id)} style={S.btn('primary')}>Save</button>
                                <button onClick={() => setEditingId(null)} style={S.btn()}>✕</button>
                              </div>
                            </td>
                          </tr>
                        ) : deleteConfirmId === row.id ? (
                          <tr key={row.id} style={{ background: RED + '11' }}>
                            <td colSpan={4} style={{ ...S.tdLeft, color: '#e8e8e0' }}>
                              Delete {row.date.toISOString().slice(0,10)} · {row.account}?
                            </td>
                            <td style={{ ...S.td, textAlign: 'center' }}>
                              <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                                <button onClick={() => deleteRow(row.id)} style={S.btn('danger')}>Delete</button>
                                <button onClick={() => setDeleteConfirmId(null)} style={S.btn()}>Cancel</button>
                              </div>
                            </td>
                          </tr>
                        ) : (
                          <tr key={row.id}>
                            <td style={S.tdLeft}>{row.date.toISOString().slice(0, 10)}</td>
                            <td style={{ ...S.tdLeft, color: '#888' }}>{row.account}</td>
                            <td style={S.td}>{fmt$(row.value)}</td>
                            <td style={S.td}>{fmt$(row.cost_basis)}</td>
                            <td style={{ ...S.td, textAlign: 'center' }}>
                              <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                                <button onClick={() => startEdit(row)} style={{ ...S.btn(), padding: '4px 10px', fontSize: '10px' }}>Edit</button>
                                <button onClick={() => setDeleteConfirmId(row.id)} style={{ ...S.btn('danger'), padding: '4px 10px', fontSize: '10px' }}>Del</button>
                              </div>
                            </td>
                          </tr>
                        )
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Import more CSV (collapsed) */}
              <div style={S.card}>
                <button
                  onClick={() => setShowCsvImport(s => !s)}
                  style={{ background: 'transparent', border: 'none', color: '#666', fontSize: '11px', cursor: 'pointer', fontFamily: "'DM Mono', monospace", padding: 0, textAlign: 'left', width: '100%' }}
                >
                  {showCsvImport ? '▾' : '▸'} Import more via CSV
                </button>
                {showCsvImport && (
                  <div style={{ marginTop: '14px' }}>
                    <textarea
                      rows={6}
                      value={csvText}
                      onChange={e => setCsvText(e.target.value)}
                      placeholder={'date,account,value,cost_basis\n2026-05-01,Robinhood,12000,11500'}
                      style={{ ...S.input, resize: 'vertical', lineHeight: 1.6 }}
                    />
                    {csvError && <div style={{ color: RED, fontSize: '11px', marginTop: '8px' }}>{csvError}</div>}
                    <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                      <button onClick={handleImport} style={{ ...S.btn('primary'), flex: 1, padding: '8px' }}>Import</button>
                      <button onClick={() => setShowSample(s => !s)} style={S.btn()}>Sample</button>
                    </div>
                    {showSample && (
                      <pre style={{ marginTop: '10px', background: '#0a0a0f', border: `1px solid ${PURPLE}44`, borderRadius: '8px', padding: '10px', fontSize: '11px', overflowX: 'auto', color: '#aaa' }}>
                        {SAMPLE_CSV}
                      </pre>
                    )}
                  </div>
                )}
              </div>

              {/* Clear all */}
              <div style={{ textAlign: 'center', paddingBottom: '8px' }}>
                <button
                  onClick={() => { if (window.confirm('Clear all data? This cannot be undone.')) { saveData([]); setTab('data') } }}
                  style={{ ...S.btn('danger'), fontSize: '11px' }}
                >
                  Clear all data
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
