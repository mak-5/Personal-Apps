import { useState, useEffect, useCallback, useRef } from 'react'
import casesData from './jan2026-cases.json'

// records[i] = { c: case_number, e: employer_name, d: filing_date }
const ALL_CASES = casesData.records
const ACCENT = '#00c4ff'
const BG = '#060d14'
const STORAGE_KEY = 'permtrack_jan2026_v2'
const CONCURRENCY = 5

async function queryFLAG(caseNumbers) {
  const r = await fetch('/flag-api/recaptcha/caseStatus', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(caseNumbers),
  })
  if (!r.ok) throw new Error(`FLAG ${r.status}`)
  const { value } = await r.json()
  return value ?? []
}

function classifyStatus(status) {
  const s = (status || '').toLowerCase()
  if (s.includes('certif')) return 'certified'
  if (s.includes('analyst') || s.includes('under review')) return 'analyst_review'
  if (s.includes('rfi') || s.includes('request for info') || s.includes('information request')) return 'rfi'
  if (s.includes('denied') || s.includes('denial')) return 'denied'
  // withdrawn, on hold, audit, appeal, unknown = other
  return 'other'
}

function loadCache() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch { return null }
}

function saveCache(statusMap) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ scannedAt: new Date().toISOString(), statusMap }))
  } catch {}
}

function emptyRow() {
  return { certified: 0, analyst_review: 0, rfi: 0, denied: 0, other: 0, total: 0 }
}

// "Other" display = rfi + denied + other
// Bar = certified / (certified + analyst_review + rfi + denied)
function rowOther(r) { return r.rfi + r.denied + r.other }
function barDenom(r) { return r.certified + r.analyst_review + r.rfi + r.denied }

function buildStats(statusMap) {
  const overall = emptyRow()
  const byDate = {}
  const byCompany = {}
  const byLetter = {}

  for (const rec of ALL_CASES) {
    const status = statusMap[rec.c]
    if (!status) continue

    const field = ['certified', 'analyst_review', 'rfi', 'denied'].includes(status) ? status : 'other'

    overall[field]++
    overall.total++

    const dt = rec.d || 'unknown'
    if (!byDate[dt]) byDate[dt] = emptyRow()
    byDate[dt][field]++
    byDate[dt].total++

    const emp = rec.e || 'Unknown'
    if (!byCompany[emp]) byCompany[emp] = emptyRow()
    byCompany[emp][field]++
    byCompany[emp].total++

    const letter = (rec.e || 'Unknown').charAt(0).toUpperCase()
    const key = /[A-Z]/.test(letter) ? letter : '#'
    if (!byLetter[key]) byLetter[key] = emptyRow()
    byLetter[key][field]++
    byLetter[key].total++
  }

  overall.total = ALL_CASES.length
  return {
    overall,
    byDate: Object.entries(byDate).sort((a, b) => a[0].localeCompare(b[0])),
    byCompany: Object.entries(byCompany).sort((a, b) => b[1].total - a[1].total),
    byLetter: Object.entries(byLetter).sort((a, b) => a[0].localeCompare(b[0])),
  }
}

function pctRemaining(row) {
  if (!row.total) return '—'
  return Math.round((row.analyst_review / row.total) * 100) + '%'
}

function Bar({ row }) {
  const denom = barDenom(row)
  const ratio = denom > 0 ? row.certified / denom : 0
  const pct = Math.round(ratio * 100)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: '80px' }}>
      <div style={{ flex: 1, height: '6px', background: '#0e1a26', borderRadius: '3px', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: '#00e676', borderRadius: '3px', transition: 'width 0.3s' }} />
      </div>
      <span style={{ fontSize: '11px', color: '#00e676', minWidth: '28px', textAlign: 'right' }}>{pct}%</span>
    </div>
  )
}

const TD = { padding: '8px 14px', borderBottom: '1px solid #0e1a26', fontSize: '12px', fontFamily: "'DM Mono', monospace" }
const TH = { padding: '8px 14px', borderBottom: '1px solid #1a2a3a', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '1.5px', color: '#4a6a8a', fontFamily: "'DM Mono', monospace", background: '#070f18' }

function DeltaCell({ delta, neutral = false }) {
  if (delta == null || delta === 0) return <td style={{ ...TD, textAlign: 'right', color: '#333' }}>—</td>
  const color = neutral ? '#ff9800' : (delta > 0 ? '#00e676' : '#ff4444')
  return <td style={{ ...TD, textAlign: 'right', color, fontWeight: 600 }}>{delta > 0 ? `+${delta}` : delta}</td>
}

function RemainingBar({ row }) {
  const pct = row.total > 0 ? Math.round((row.analyst_review / row.total) * 100) : 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: '80px' }}>
      <div style={{ flex: 1, height: '6px', background: '#0e1a26', borderRadius: '3px', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: ACCENT, borderRadius: '3px', transition: 'width 0.3s' }} />
      </div>
      <span style={{ fontSize: '11px', color: ACCENT, minWidth: '28px', textAlign: 'right' }}>{pct}%</span>
    </div>
  )
}

function SortTH({ label, col, sortKey, sortDir, onSort, style }) {
  const active = sortKey === col
  return (
    <th onClick={() => onSort(col)} style={{ ...style, cursor: 'pointer', userSelect: 'none' }}>
      <span style={{ opacity: active ? 1 : 0.7 }}>{label}</span>
      {active && <span style={{ marginLeft: '4px', fontSize: '9px' }}>{sortDir === 'asc' ? '↑' : '↓'}</span>}
    </th>
  )
}

function StatsTable({ title, rows, nameLabel = 'Name', maxRows = null, prevRows = null, sortable = false }) {
  const [expanded, setExpanded] = useState(false)
  const [sortKey, setSortKey] = useState('total')
  const [sortDir, setSortDir] = useState('desc')
  const prevMap = prevRows ? new Map(prevRows) : null

  const handleSort = col => {
    if (sortKey === col) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortKey(col); setSortDir('desc') }
  }

  const sorted = sortable ? [...rows].sort(([ka, ra], [kb, rb]) => {
    let a, b
    if (sortKey === 'name') { a = ka; b = kb }
    else if (sortKey === 'certified') { a = ra.certified; b = rb.certified }
    else if (sortKey === 'analyst_review') { a = ra.analyst_review; b = rb.analyst_review }
    else if (sortKey === 'other') { a = rowOther(ra); b = rowOther(rb) }
    else if (sortKey === 'remaining') { a = ra.total ? ra.analyst_review / ra.total : 0; b = rb.total ? rb.analyst_review / rb.total : 0 }
    else if (sortKey === 'cert_rate') { a = barDenom(ra) ? ra.certified / barDenom(ra) : 0; b = barDenom(rb) ? rb.certified / barDenom(rb) : 0 }
    else { a = ra.total; b = rb.total }
    if (sortKey === 'name') return sortDir === 'asc' ? a.localeCompare(b) : b.localeCompare(a)
    return sortDir === 'asc' ? a - b : b - a
  }) : rows

  const display = maxRows && !expanded ? sorted.slice(0, maxRows) : sorted

  return (
    <div style={{ marginBottom: '32px' }}>
      <div style={{ fontSize: '12px', color: ACCENT, letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '10px' }}>
        {title}
      </div>
      <div style={{ overflowX: 'auto', borderRadius: '10px', border: '1px solid #0e1a26' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '480px' }}>
          <thead>
            <tr>
              <SortTH label={nameLabel} col="name" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} style={{ ...TH, textAlign: 'left' }} />
              <SortTH label="Total" col="total" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} style={{ ...TH, textAlign: 'right' }} />
              <SortTH label="Certified" col="certified" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} style={{ ...TH, textAlign: 'right', color: '#00c47a' }} />
              {prevMap && <th style={{ ...TH, textAlign: 'right', color: '#00e676' }}>Δ Cert</th>}
              <SortTH label="Analyst Review" col="analyst_review" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} style={{ ...TH, textAlign: 'right' }} />
              <SortTH label="Other" col="other" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} style={{ ...TH, textAlign: 'right', color: '#ff9800' }} />
              {prevMap && <th style={{ ...TH, textAlign: 'right', color: '#ff9800' }}>Δ Other</th>}
              <SortTH label="% Remaining" col="remaining" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} style={{ ...TH, textAlign: 'left', color: ACCENT, minWidth: '110px' }} />
              <SortTH label="Certified Rate" col="cert_rate" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} style={{ ...TH, textAlign: 'left', color: '#00e676', minWidth: '110px' }} />
            </tr>
          </thead>
          <tbody>
            {display.map(([key, row]) => {
              const prevRow = prevMap?.get(key)
              const deltaCert = prevRow != null ? row.certified - prevRow.certified : null
              const deltaOther = prevRow != null ? rowOther(row) - rowOther(prevRow) : null
              return (
                <tr key={key}
                  style={{ background: 'transparent', transition: 'background 0.1s' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#0a1520'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <td style={{ ...TD, color: '#ccc', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{key}</td>
                  <td style={{ ...TD, textAlign: 'right', color: '#fff' }}>{row.total.toLocaleString()}</td>
                  <td style={{ ...TD, textAlign: 'right', color: '#00e676' }}>{row.certified.toLocaleString()}</td>
                  {prevMap && <DeltaCell delta={deltaCert} />}
                  <td style={{ ...TD, textAlign: 'right', color: '#666' }}>{row.analyst_review.toLocaleString()}</td>
                  <td style={{ ...TD, textAlign: 'right', color: '#ff9800' }}>{rowOther(row).toLocaleString()}</td>
                  {prevMap && <DeltaCell delta={deltaOther} neutral />}
                  <td style={{ ...TD }}><RemainingBar row={row} /></td>
                  <td style={{ ...TD }}><Bar row={row} /></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {maxRows && rows.length > maxRows && (
        <button
          onClick={() => setExpanded(e => !e)}
          style={{ marginTop: '8px', background: 'none', border: '1px solid #1a2a3a', color: '#4a6a8a', padding: '4px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '11px', fontFamily: "'DM Mono', monospace" }}
        >
          {expanded ? 'Show less ↑' : `Show all ${rows.length} ↓`}
        </button>
      )}
    </div>
  )
}

function OverallTable({ stats, prevOverall = null }) {
  const row = stats.overall
  const deltaCert = prevOverall != null ? row.certified - prevOverall.certified : null
  const deltaOther = prevOverall != null ? rowOther(row) - rowOther(prevOverall) : null
  return (
    <div style={{ marginBottom: '32px' }}>
      <div style={{ fontSize: '12px', color: ACCENT, letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '10px' }}>
        Overall · Jan 2026 G-100 PERM
      </div>
      <div style={{ overflowX: 'auto', borderRadius: '10px', border: '1px solid #0e1a26' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '400px' }}>
          <thead>
            <tr>
              <th style={{ ...TH, textAlign: 'right' }}>Total</th>
              <th style={{ ...TH, textAlign: 'right', color: '#00c47a' }}>Certified</th>
              {prevOverall && <th style={{ ...TH, textAlign: 'right', color: '#00e676' }}>Δ Cert</th>}
              <th style={{ ...TH, textAlign: 'right' }}>Analyst Review</th>
              <th style={{ ...TH, textAlign: 'right', color: '#ff9800' }}>Other</th>
              {prevOverall && <th style={{ ...TH, textAlign: 'right', color: '#ff9800' }}>Δ Other</th>}
              <th style={{ ...TH, textAlign: 'left', color: ACCENT, minWidth: '140px' }}>% Remaining</th>
              <th style={{ ...TH, textAlign: 'left', color: '#00e676', minWidth: '140px' }}>Certified Rate</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ ...TD, textAlign: 'right', color: '#fff', fontSize: '18px', fontWeight: 700 }}>{row.total.toLocaleString()}</td>
              <td style={{ ...TD, textAlign: 'right', color: '#00e676', fontSize: '18px', fontWeight: 700 }}>{row.certified.toLocaleString()}</td>
              {prevOverall && <DeltaCell delta={deltaCert} />}
              <td style={{ ...TD, textAlign: 'right', color: '#666', fontSize: '18px' }}>{row.analyst_review.toLocaleString()}</td>
              <td style={{ ...TD, textAlign: 'right', color: '#ff9800', fontSize: '18px' }}>{rowOther(row).toLocaleString()}</td>
              {prevOverall && <DeltaCell delta={deltaOther} neutral />}
              <td style={{ ...TD }}><RemainingBar row={row} /></td>
              <td style={{ ...TD }}><Bar row={row} /></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function PermitTracker() {
  const [scanning, setScanning] = useState(false)
  const [scanProgress, setScanProgress] = useState(null)
  const [scanSummary, setScanSummary] = useState(null)
  const [stats, setStats] = useState(null)
  const [prevStats, setPrevStats] = useState(null)
  const [scannedAt, setScannedAt] = useState(null)
  const abortRef = useRef(false)

  useEffect(() => {
    const cached = loadCache()
    if (cached?.statusMap) {
      setStats(buildStats(cached.statusMap))
      setScannedAt(cached.scannedAt)
    }
  }, [])

  const startScan = useCallback(async () => {
    abortRef.current = false
    setScanning(true)

    // Carry forward all previously-resolved cases; only re-query analyst_review ones
    const prevCache = loadCache()
    const prevMap = prevCache?.statusMap ?? {}
    const prevStatsForDelta = Object.keys(prevMap).length > 0 ? buildStats(prevMap) : null
    const statusMap = { ...prevMap }

    const pending = ALL_CASES.map(r => r.c).filter(cn => {
      const prev = prevMap[cn]
      return !prev || prev === 'analyst_review'
    })

    setScanProgress({ done: 0, total: pending.length, errors: 0, skipped: ALL_CASES.length - pending.length })

    const batches = []
    for (let i = 0; i < pending.length; i += 30) batches.push(pending.slice(i, i + 30))

    let done = 0
    let errors = 0
    const queue = [...batches]

    const workers = Array.from({ length: CONCURRENCY }, async () => {
      while (queue.length > 0 && !abortRef.current) {
        const batch = queue.shift()
        if (!batch) break
        try {
          const found = await queryFLAG(batch)
          const foundMap = {}
          found.forEach(item => {
            const key = (item.caseNumber || item.id || '').toUpperCase()
            if (key) foundMap[key] = item.currentStatus || item.status || item.caseStatus || 'Found'
          })
          batch.forEach(cn => {
            const rawStatus = foundMap[cn]
            statusMap[cn] = rawStatus ? classifyStatus(rawStatus) : 'analyst_review'
          })
        } catch {
          errors++
          batch.forEach(cn => { statusMap[cn] = 'analyst_review' })
        }
        done += batch.length
        setScanProgress({ done, total: pending.length, errors, skipped: ALL_CASES.length - pending.length })
      }
    })

    await Promise.all(workers)

    if (!abortRef.current) {
      const newStats = buildStats(statusMap)
      const newCertified = newStats.overall.certified - (prevStatsForDelta?.overall.certified ?? 0)
      const newRFIs = ALL_CASES.filter(r => {
        const prev = prevMap[r.c]
        return (prev === 'analyst_review' || !prev) && statusMap[r.c] === 'rfi'
      })
      setPrevStats(prevStatsForDelta)
      setStats(newStats)
      setScannedAt(new Date().toISOString())
      saveCache(statusMap)
      setScanSummary({
        checked: pending.length,
        skipped: ALL_CASES.length - pending.length,
        newCertified: Math.max(0, newCertified),
        newRFIs,
      })
    }
    setScanning(false)
  }, [])

  const progress = scanProgress ? Math.round((scanProgress.done / scanProgress.total) * 100) : 0

  return (
    <div style={{
      fontFamily: "'DM Mono', monospace",
      background: BG,
      minHeight: '100dvh',
      padding: '24px 20px',
      paddingTop: 'calc(24px + env(safe-area-inset-top))',
      paddingBottom: 'calc(60px + env(safe-area-inset-bottom))',
      maxWidth: '900px',
      margin: '0 auto',
    }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Syne:wght@700;800&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '28px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ fontSize: '28px', fontFamily: "'Syne', sans-serif", fontWeight: 800, letterSpacing: '-1px', color: '#fff' }}>
            Jan <span style={{ color: ACCENT }}>2026</span>
          </div>
          <div style={{ fontSize: '12px', color: '#3a5a7a', marginTop: '4px' }}>
            9,403 G-100 PERM cases · queried from FLAG
          </div>
        </div>
        <button
          onClick={scanning ? () => { abortRef.current = true } : startScan}
          style={{
            background: scanning ? '#1a0a0a' : '#001a2a',
            border: `1px solid ${scanning ? '#ff4444' : ACCENT}`,
            color: scanning ? '#ff4444' : ACCENT,
            padding: '8px 18px',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '12px',
            letterSpacing: '0.5px',
            fontFamily: "'DM Mono', monospace",
          }}
        >
          {scanning ? '⏹ Stop' : '⟳ Scan FLAG'}
        </button>
      </div>

      {/* Scan progress */}
      {scanning && scanProgress && (
        <div style={{ marginBottom: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#3a5a7a', marginBottom: '6px' }}>
            <span>Querying FLAG… {scanProgress.done.toLocaleString()} / {scanProgress.total.toLocaleString()} pending{scanProgress.skipped > 0 ? ` · ${scanProgress.skipped.toLocaleString()} skipped` : ''}</span>
            <span>{progress}%{scanProgress.errors > 0 ? ` · ${scanProgress.errors} errors` : ''}</span>
          </div>
          <div style={{ height: '3px', background: '#0e1a26', borderRadius: '2px' }}>
            <div style={{ height: '100%', width: `${progress}%`, background: ACCENT, borderRadius: '2px', transition: 'width 0.3s' }} />
          </div>
        </div>
      )}

      {scanSummary && !scanning && (
        <div style={{
          marginBottom: '20px',
          padding: '10px 16px',
          borderRadius: '8px',
          border: '1px solid #00e67633',
          background: '#00e67608',
          fontSize: '12px',
          color: '#00e676',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '6px',
          alignItems: 'center',
        }}>
          <span>✓ Scan complete</span>
          <span style={{ color: '#3a5a7a' }}>·</span>
          <span style={{ color: '#ccc' }}>{scanSummary.checked.toLocaleString()} queried</span>
          {scanSummary.skipped > 0 && (
            <>
              <span style={{ color: '#3a5a7a' }}>·</span>
              <span style={{ color: '#4a6a8a' }}>{scanSummary.skipped.toLocaleString()} skipped — already resolved (certified / denied / other)</span>
            </>
          )}
          {scanSummary.newCertified > 0 && (
            <>
              <span style={{ color: '#3a5a7a' }}>·</span>
              <span style={{ color: '#00e676', fontWeight: 600 }}>+{scanSummary.newCertified} newly certified</span>
            </>
          )}
          {scanSummary.newRFIs?.length > 0 && (
            <>
              <span style={{ color: '#3a5a7a' }}>·</span>
              <span style={{ color: '#ff9800', fontWeight: 600 }}>⚠ {scanSummary.newRFIs.length} new RFI{scanSummary.newRFIs.length > 1 ? 's' : ''}</span>
            </>
          )}
        </div>
      )}

      {scanSummary?.newRFIs?.length > 0 && !scanning && (
        <div style={{ marginBottom: '24px', padding: '12px 16px', borderRadius: '8px', border: '1px solid #ff980033', background: '#ff980008' }}>
          <div style={{ fontSize: '11px', color: '#ff9800', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '10px' }}>
            New RFIs this scan
          </div>
          {scanSummary.newRFIs.map(r => (
            <div key={r.c} style={{ display: 'flex', gap: '16px', padding: '5px 0', borderBottom: '1px solid #1a1a0a', fontSize: '12px' }}>
              <span style={{ color: '#ff9800', fontFamily: "'DM Mono', monospace", minWidth: '140px' }}>{r.c}</span>
              <span style={{ color: '#ccc', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.e}</span>
              <span style={{ color: '#3a5a7a', marginLeft: 'auto', flexShrink: 0 }}>{r.d}</span>
            </div>
          ))}
        </div>
      )}

      {scannedAt && !scanning && (
        <div style={{ fontSize: '11px', color: '#2a4a6a', marginBottom: '28px' }}>
          Last scanned: {new Date(scannedAt).toLocaleString()} · {ALL_CASES.length.toLocaleString()} cases
        </div>
      )}

      {!stats && !scanning && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#2a4a6a', fontSize: '13px' }}>
          Press "Scan FLAG" to query all 9,403 cases live from DOL
        </div>
      )}

      {stats && (
        <>
          <OverallTable stats={stats} prevOverall={prevStats?.overall} />
          <StatsTable title="By Filing Date" rows={stats.byDate.filter(([, r]) => r.analyst_review > 0)} nameLabel="Date" prevRows={prevStats?.byDate} sortable />
          <StatsTable title="By Company" rows={stats.byCompany.filter(([, r]) => r.analyst_review > 0)} nameLabel="Company" maxRows={50} prevRows={prevStats?.byCompany} sortable />
          <StatsTable title="By Employer First Letter" rows={stats.byLetter.filter(([, r]) => r.analyst_review > 0)} nameLabel="Letter" prevRows={prevStats?.byLetter} sortable />
        </>
      )}
    </div>
  )
}
