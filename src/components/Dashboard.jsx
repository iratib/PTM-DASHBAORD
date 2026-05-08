import React, { useState, useMemo, useEffect, useRef } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, PieChart, Pie, Legend
} from 'recharts'
import {
  Plane, Clock, AlertTriangle, Users, ArrowUpRight,
  Download, Search, ChevronDown, ChevronLeft, PlaneTakeoff, PlaneLanding, MapPin,
  LayoutList, LayoutGrid
} from 'lucide-react'
import excelService from '../services/excelService'
import { googleSheetsService } from '../services/googleSheetsService'
import StatCard from './StatCard'
import './Dashboard.css'

/* ── Format a date string for display.
   Handles:
     "DD/MM/YYYY HH:MM:SS"  (STA Inbound)
     "M/D/YY HH:MM"         (STD Outbound from XLSX)
     ISO strings            (from localStorage)
── */
const fmtDate = (value) => {
  if (!value) return '-'
  const str = String(value).trim()

  // DD/MM/YYYY HH:MM[:SS]
  const m1 = str.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}:\d{2})/)
  if (m1) return `${m1[1]}/${m1[2]} ${m1[4]}`

  // M/D/YY HH:MM  (XLSX output for STD Outbound)
  const m2 = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s+(\d{1,2}:\d{2})/)
  if (m2) {
    const day   = m2[2].padStart(2, '0')
    const month = m2[1].padStart(2, '0')
    const time  = m2[4].padStart(5, '0')
    return `${day}/${month} ${time}`
  }

  // ISO / fallback
  const d = new Date(str)
  if (!isNaN(d.getTime()))
    return d.toLocaleString('fr-FR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })

  return str
}

/* ── Auto-format immatriculation: insert dash after 2nd char (CN-ROP) ── */
const fmtImmat = (raw) => {
  const clean = raw.replace(/-/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  return clean.length > 2 ? clean.slice(0, 2) + '-' + clean.slice(2) : clean
}

/* ── Parse "H:MM:SS" or "HH:MM:SS" connection time string to minutes ── */
const parseConnexionMinutes = (val) => {
  if (!val) return null
  const parts = String(val).trim().split(':')
  if (parts.length < 2) return null
  return parseInt(parts[0]) * 60 + parseInt(parts[1])
}

const connectionStatus = (minutes) => {
  if (minutes === null) return null
  if (minutes < 30)  return 'critique'
  if (minutes < 60)  return 'attention'
  return 'ok'
}

/* retourne l'heure (0-23) depuis "M/D/YY HH:MM", "DD/MM/YYYY HH:MM:SS", ou ISO */
const extractHour = (value) => {
  if (!value) return null
  const str = String(value).trim()
  // M/D/YY HH:MM
  const m1 = str.match(/^\d{1,2}\/\d{1,2}\/\d{2,4}\s+(\d{1,2}):\d{2}/)
  if (m1) return parseInt(m1[1])
  // DD/MM/YYYY HH:MM:SS
  const m2 = str.match(/^\d{2}\/\d{2}\/\d{4}\s+(\d{2}):\d{2}/)
  if (m2) return parseInt(m2[1])
  const d = new Date(str)
  return isNaN(d.getTime()) ? null : d.getHours()
}

const isDayFlight  = (std) => { const h = extractHour(std); return h !== null && h >= 6 && h < 18 }
const isNightFlight = (std) => { const h = extractHour(std); return h !== null && (h >= 18 || h < 6) }

// Extrait uniquement l'heure HH:MM d'une chaîne datetime
const fmtTime = (value) => {
  if (!value) return ''
  const m = String(value).match(/(\d{1,2}):(\d{2})/)
  return m ? `${m[1].padStart(2,'0')}:${m[2]}` : ''
}

// Formate un segment IATA "CMN-CDG" → "CMN → CDG"
const fmtRoute = (segment) => {
  if (!segment) return ''
  const idx = segment.indexOf('-')
  if (idx === -1) return segment
  return `${segment.slice(0, idx)} → ${segment.slice(idx + 1)}`
}

// Convertit des minutes en "HH:MM"
const fmtConnectionTime = (minutes) => {
  if (!minutes && minutes !== 0) return '--:--'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`
}

const originOf = (seg) => seg ? seg.split('-')[0]            : ''
const destOf   = (seg) => seg ? seg.split('-').slice(-1)[0]  : ''

const AIRPORT_CITY = {
  CDG:'Paris', ORY:'Paris Orly', LHR:'Londres', LGW:'Londres Gatwick',
  AMS:'Amsterdam', BRU:'Bruxelles', FRA:'Francfort', MUC:'Munich',
  FCO:'Rome', MXP:'Milan', VCE:'Venise', BLQ:'Bologne',
  BCN:'Barcelone', MAD:'Madrid', SVQ:'Séville', BIO:'Bilbao', VLC:'Valence',
  LIS:'Lisbonne', OPO:'Porto',
  GVA:'Genève', ZRH:'Zurich', VIE:'Vienne',
  MRS:'Marseille', LYS:'Lyon', NCE:'Nice', TLS:'Toulouse', BOD:'Bordeaux',
  NTE:'Nantes', MPL:'Montpellier', RNS:'Rennes',
  STR:'Stuttgart', DUS:'Düsseldorf', HAM:'Hambourg', BER:'Berlin',
  CPH:'Copenhague', ARN:'Stockholm', HEL:'Helsinki', WAW:'Varsovie',
  IST:'Istanbul', DXB:'Dubaï', CAI:'Le Caire', BEY:'Beyrouth',
  JFK:'New York', YUL:'Montréal', YYZ:'Toronto',
  GRU:'São Paulo', EZE:'Buenos Aires',
  CMN:'Casablanca', RAK:'Marrakech', AGA:'Agadir', TNG:'Tanger',
  FEZ:'Fès', RBA:'Rabat', OUD:'Oujda', NDR:'Nador',
  ERH:'Errachidia', OZZ:'Ouarzazate', TTU:'Tétouan', AHU:'Al Hoceima',
  EUN:'Laayoune', VIL:'Dakhla', GLN:'Goulimime',
  TUN:'Tunis', ALG:'Alger', DSS:'Dakar', BKO:'Bamako',
  NBJ:'Nouakchott', DLA:'Douala', LBV:'Libreville',
  ABV:'Abuja', LOS:'Lagos', ACC:'Accra', NBO:'Nairobi', SID:'Sal',
}
const airportCity = (code) => AIRPORT_CITY[code] || code

const DIST_COLORS = {
  '0-30 min':   '#F43F5E',
  '30-60 min':  '#F59E0B',
  '60-120 min': '#22C55E',
  '120+ min':   '#3B82F6',
}

export const Dashboard = ({ data, lastUpdate, isLoading }) => {
  const [filters, setFilters] = useState({
    search: '',
    volOutbound: '',
    status: '',
  })
  const [activeTab, setActiveTab] = useState('overview')
  const [selectedOutbound, setSelectedOutbound] = useState(null)
  const [selectedInbound, setSelectedInbound]   = useState(null)
  const [detailView, setDetailView]       = useState('table')  // 'table' | 'cards'
  const [activeStatCard, setActiveStatCard] = useState(null)    // null | 'outbound' | 'inbound' | 'ptm'
  const [periodFilter, setPeriodFilter] = useState('all') // 'all' | 'day' | 'night'
  const [periodFilterIn, setPeriodFilterIn] = useState('all') // pour onglet arrivées
  const [periodFilterAp, setPeriodFilterAp] = useState('all') // pour onglet appareils
  const [apCategoryFilter, setApCategoryFilter] = useState('all') // 'all' | 'outbound' | 'inbound'
  const [apVolFilter, setApVolFilter] = useState('')

  const [flightInfo, setFlightInfo] = useState(() => {
    try { return JSON.parse(localStorage.getItem('ptm_flight_info') || '{}') }
    catch { return {} }
  })

  // Recharge flightInfo depuis localStorage quand le sync Google Sheets le met à jour
  useEffect(() => {
    const handler = () => {
      try {
        const saved = JSON.parse(localStorage.getItem('ptm_flight_info') || '{}')
        setFlightInfo(saved)
      } catch { /* ignore */ }
    }
    window.addEventListener('ptm_flight_info_synced', handler)
    return () => window.removeEventListener('ptm_flight_info_synced', handler)
  }, [])

  const pushDebounceRef = useRef(null)

  const updateFlightInfo = (vol, field, value) => {
    setFlightInfo(prev => {
      const updated = { ...prev, [vol]: { ...(prev[vol] || {}), [field]: value } }
      localStorage.setItem('ptm_flight_info', JSON.stringify(updated))
      // Debounce : envoie à Google Sheets 1,5 s après la dernière frappe
      clearTimeout(pushDebounceRef.current)
      pushDebounceRef.current = setTimeout(() => {
        googleSheetsService.pushFlightInfo(updated).catch(() => {})
      }, 1500)
      return updated
    })
  }

  const enrichedData = useMemo(() => data.map(item => {
    // Accepte "Temps de connexion" (ancien format) et "temps de connexion" (Feuil2)
    const connexionRaw = item['Temps de connexion'] || item['temps de connexion'] || null
    const connectionTime = parseConnexionMinutes(connexionRaw)
    return {
      ...item,
      'Temps de connexion': connexionRaw || '', // normalise pour l'affichage dans les tableaux
      connectionTime,
      ptm: Number(item['PTM']) || 0,
      status: connectionStatus(connectionTime),
    }
  }), [data])

  const groupedByOutbound = useMemo(() => {
    const groups = {}
    enrichedData.forEach(item => {
      const key = item['Vol Outbound']
      if (!groups[key]) {
        groups[key] = {
          volOutbound:     key,
          stdOutbound:     item['STD Outbound'],
          segmentOutbound: item['Segment Outbound'] || '',
          connections: [],
          totalPTM: 0,
          critiques: 0,
        }
      }
      groups[key].connections.push(item)
      groups[key].totalPTM += item.ptm
      if (item.status === 'critique') groups[key].critiques++
    })
    Object.values(groups).forEach(g => {
      const times = g.connections.filter(c => c.connectionTime !== null).map(c => c.connectionTime)
      g.avgConnectionTime = times.length
        ? Math.round(times.reduce((a, b) => a + b, 0) / times.length)
        : 0
      g.minConnectionTime = times.length ? Math.min(...times) : null
    })
    return groups
  }, [enrichedData])

  const groupedByInbound = useMemo(() => {
    const groups = {}
    enrichedData.forEach(item => {
      const key = item['Vol Inbound']
      if (!key) return
      if (!groups[key]) {
        groups[key] = {
          volInbound:     key,
          staInbound:     item['STA Inbound'],
          segmentInbound: item['Segment Inbound'] || '',
          connections: [],
          totalPTM: 0,
          critiques: 0,
        }
      }
      groups[key].connections.push(item)
      groups[key].totalPTM += item.ptm
      if (item.status === 'critique') groups[key].critiques++
    })
    return groups
  }, [enrichedData])

  const filteredData = useMemo(() => enrichedData.filter(item => {
    const s = filters.search.toLowerCase()
    const matchSearch = !s ||
      String(item['Vol Inbound'] || '').toLowerCase().includes(s) ||
      String(item['Vol Outbound'] || '').toLowerCase().includes(s)
    const matchVol = !filters.volOutbound || item['Vol Outbound'] === filters.volOutbound
    const matchStatus = !filters.status || item.status === filters.status
    return matchSearch && matchVol && matchStatus
  }), [enrichedData, filters])

  const stats = useMemo(() => {
    const times = filteredData.filter(d => d.connectionTime !== null).map(d => d.connectionTime)
    return {
      inboundCount:   new Set(filteredData.map(d => d['Vol Inbound']).filter(Boolean)).size,
      outboundCount:  new Set(filteredData.map(d => d['Vol Outbound'])).size,
      totalPTM:       filteredData.reduce((s, d) => s + d.ptm, 0),
      avgTime:        times.length ? Math.round(times.reduce((a,b)=>a+b,0)/times.length) : 0,
      critiques:      filteredData.filter(d => d.status === 'critique').length,
    }
  }, [filteredData])

  const connectionDistribution = useMemo(() => {
    const r = { '0-30 min': 0, '30-60 min': 0, '60-120 min': 0, '120+ min': 0 }
    filteredData.forEach(({ connectionTime: t }) => {
      if (t === null) return
      if (t < 30)        r['0-30 min']++
      else if (t < 60)   r['30-60 min']++
      else if (t < 120)  r['60-120 min']++
      else               r['120+ min']++
    })
    return Object.entries(r).map(([name, value]) => ({ name, value }))
  }, [filteredData])

  const outboundPTMChart = useMemo(() => {
    return Object.values(groupedByOutbound)
      .sort((a, b) => b.totalPTM - a.totalPTM)
      .slice(0, 12)
      .map(g => ({ name: g.volOutbound, value: g.totalPTM, critiques: g.critiques }))
  }, [groupedByOutbound])

  // Répartition des statuts (donut)
  const statusDistribution = useMemo(() => [
    { name: 'Critique',  value: filteredData.filter(d => d.status === 'critique').length,  color: '#F43F5E' },
    { name: 'Attention', value: filteredData.filter(d => d.status === 'attention').length, color: '#F59E0B' },
    { name: 'OK',        value: filteredData.filter(d => d.status === 'ok').length,        color: '#22C55E' },
  ].filter(d => d.value > 0), [filteredData])

  // Arrivées par heure (STA Inbound)
  const arrivalsByHour = useMemo(() => {
    const hours = {}
    filteredData.forEach(row => {
      const h = extractHour(row['STA Inbound'])
      if (h === null) return
      if (!hours[h]) hours[h] = { total: 0, critique: 0 }
      hours[h].total++
      if (row.status === 'critique') hours[h].critique++
    })
    return Array.from({ length: 24 }, (_, h) => ({
      hour: `${String(h).padStart(2, '0')}h`,
      total: hours[h]?.total || 0,
      critique: hours[h]?.critique || 0,
    })).filter(d => d.total > 0)
  }, [filteredData])

  // PTM sûr vs critique par vol outbound (stacked)
  const outboundRiskChart = useMemo(() => {
    return Object.values(groupedByOutbound)
      .filter(g => g.volOutbound)
      .sort((a, b) => b.totalPTM - a.totalPTM)
      .slice(0, 12)
      .map(g => {
        const critiquePTM = g.connections
          .filter(c => c.status === 'critique')
          .reduce((s, c) => s + c.ptm, 0)
        return { name: g.volOutbound, safe: g.totalPTM - critiquePTM, critique: critiquePTM }
      })
  }, [groupedByOutbound])

  // Top 10 vols inbound par PTM
  const topInboundPTM = useMemo(() => {
    const map = {}
    filteredData.forEach(row => {
      const vol = row['Vol Inbound']
      if (!vol) return
      map[vol] = (map[vol] || 0) + row.ptm
    })
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, value]) => ({ name, value }))
  }, [filteredData])

  const outboundVols = useMemo(() => {
    const toMin = (std) => {
      const h = extractHour(std); if (h === null) return 9999
      const m = String(std || '').trim().match(/\d{1,2}\/\d{1,2}\/\d{2,4}\s+\d{1,2}:(\d{2})/) ||
                String(std || '').trim().match(/\d{2}\/\d{2}\/\d{4}\s+\d{2}:(\d{2})/)
      return h * 60 + (m ? parseInt(m[1]) : 0)
    }
    return Object.keys(groupedByOutbound)
      .filter(Boolean)
      .sort((a, b) => toMin(groupedByOutbound[a]?.stdOutbound) - toMin(groupedByOutbound[b]?.stdOutbound))
  }, [groupedByOutbound])

  const uniqueInbound = useMemo(() => {
    const seen = new Map()
    enrichedData.forEach(row => {
      const vol = row['Vol Inbound']
      if (vol && !seen.has(vol)) seen.set(vol, row['STA Inbound'])
    })
    const toMin = (sta) => {
      const h = extractHour(sta); if (h === null) return 9999
      const m = String(sta || '').trim().match(/\d{2}\/\d{2}\/\d{4}\s+\d{2}:(\d{2})/)
      return h * 60 + (m ? parseInt(m[1]) : 0)
    }
    return [...seen.entries()]
      .map(([vol, sta]) => ({ vol, sta }))
      .sort((a, b) => toMin(a.sta) - toMin(b.sta))
  }, [enrichedData])

  const handleExport = () => {
    excelService.exportToExcel(filteredData, 'ptm_export.xlsx')
  }

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null
    return (
      <div className="chart-tooltip">
        <div className="tooltip-label">{label}</div>
        {payload.map((p, i) => (
          <div key={i} className="tooltip-row">
            <span style={{ color: p.color }}>{p.name}</span>
            <strong>{p.value}</strong>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="dashboard">
      {/* Stats */}
      <div className="stats-grid">
        <StatCard icon={<PlaneTakeoff size={18}/>} title="Vols Outbound" value={stats.outboundCount} color="blue"   onClick={() => setActiveStatCard('outbound')} />
        <StatCard icon={<PlaneLanding size={18}/>} title="Vols Inbound"  value={stats.inboundCount}  color="sky"    onClick={() => setActiveStatCard('inbound')} />
        <StatCard icon={<Users size={18}/>}         title="Total PTM"     value={stats.totalPTM}      color="purple" onClick={() => setActiveStatCard('ptm')} />
        <StatCard icon={<Clock size={18}/>}          title="Temps moyen"   value={`${stats.avgTime} min`} color="success" />
        <StatCard icon={<AlertTriangle size={18}/>}  title="Critiques"     value={stats.critiques}     color="danger" subtitle="< 30 min" />
      </div>

      {/* ── MODAL STAT CARD ── */}
      {activeStatCard && (() => {
        const close = () => setActiveStatCard(null)

        const outboundList = Object.values(groupedByOutbound)
          .filter(g => g.volOutbound)
          .sort((a, b) => b.totalPTM - a.totalPTM)

        const inboundList = Object.values(groupedByInbound)
          .filter(g => g.volInbound)
          .sort((a, b) => b.totalPTM - a.totalPTM)

        const titles = { outbound: 'Vols Outbound', inbound: 'Vols Inbound', ptm: 'Détail PTM par vol' }

        return (
          <div className="stat-modal-backdrop" onClick={close}>
            <div className="stat-modal" onClick={e => e.stopPropagation()}>
              <div className="stat-modal-header">
                <h3>{titles[activeStatCard]}</h3>
                <button className="stat-modal-close" onClick={close}>✕</button>
              </div>
              <div className="stat-modal-body">

                {/* ── Vols Outbound ── */}
                {activeStatCard === 'outbound' && (
                  <table className="stat-modal-table">
                    <thead>
                      <tr>
                        <th>Vol Outbound</th>
                        <th>Départ</th>
                        <th>Destination</th>
                        <th>Inbound</th>
                        <th>PTM</th>
                        <th>Critiques</th>
                      </tr>
                    </thead>
                    <tbody>
                      {outboundList.map(g => (
                        <tr key={g.volOutbound} className={g.critiques > 0 ? 'smt-alert' : ''}>
                          <td><span className="flight-tag">{g.volOutbound}</span></td>
                          <td className="date-cell">{fmtTime(g.stdOutbound)}</td>
                          <td className="smt-route">{g.segmentOutbound ? fmtRoute(g.segmentOutbound) : '—'}</td>
                          <td className="num-cell">{g.connections.length}</td>
                          <td className="num-cell smt-ptm">{g.totalPTM}</td>
                          <td className="num-cell">{g.critiques > 0 ? <span className="status-pill pill-critique">{g.critiques}</span> : <span className="smt-zero">—</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                {/* ── Vols Inbound ── */}
                {activeStatCard === 'inbound' && (
                  <table className="stat-modal-table">
                    <thead>
                      <tr>
                        <th>Vol Inbound</th>
                        <th>Arrivée</th>
                        <th>Origine</th>
                        <th>Connexions</th>
                        <th>PTM</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inboundList.map(g => (
                        <tr key={g.volInbound} className={g.critiques > 0 ? 'smt-alert' : ''}>
                          <td><span className="flight-tag">{g.volInbound}</span></td>
                          <td className="date-cell">{fmtTime(g.staInbound)}</td>
                          <td className="smt-route">{g.segmentInbound ? fmtRoute(g.segmentInbound) : '—'}</td>
                          <td className="num-cell">{g.connections.length}</td>
                          <td className="num-cell smt-ptm">{g.totalPTM}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                {/* ── Total PTM ── */}
                {activeStatCard === 'ptm' && (() => {
                  const total = outboundList.reduce((s, g) => s + g.totalPTM, 0)
                  return (
                    <table className="stat-modal-table">
                      <thead>
                        <tr>
                          <th>Vol Outbound</th>
                          <th>Départ</th>
                          <th>Destination</th>
                          <th>PTM</th>
                          <th>% du total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {outboundList.map(g => {
                          const pct = total > 0 ? Math.round((g.totalPTM / total) * 100) : 0
                          return (
                            <tr key={g.volOutbound}>
                              <td><span className="flight-tag">{g.volOutbound}</span></td>
                              <td className="date-cell">{fmtTime(g.stdOutbound)}</td>
                              <td className="smt-route">{g.segmentOutbound ? fmtRoute(g.segmentOutbound) : '—'}</td>
                              <td className="num-cell smt-ptm">{g.totalPTM}</td>
                              <td>
                                <div className="smt-bar-wrap">
                                  <div className="smt-bar" style={{ width: `${pct}%` }} />
                                  <span className="smt-pct">{pct}%</span>
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  )
                })()}

              </div>
            </div>
          </div>
        )
      })()}

      {/* Filters */}
      <div className="filters-bar">
        <div className="search-field">
          <Search size={15} className="search-icon" />
          <input
            type="text"
            placeholder="Rechercher un vol…"
            value={filters.search}
            onChange={e => setFilters({ ...filters, search: e.target.value })}
          />
        </div>

        <div className="select-field">
          <select
            value={filters.volOutbound}
            onChange={e => setFilters({ ...filters, volOutbound: e.target.value })}
          >
            <option value="">Tous les vols outbound</option>
            {outboundVols.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
          <ChevronDown size={14} className="select-arrow" />
        </div>

        <div className="select-field">
          <select
            value={filters.status}
            onChange={e => setFilters({ ...filters, status: e.target.value })}
          >
            <option value="">Tous les statuts</option>
            <option value="critique">Critique (&lt;30 min)</option>
            <option value="attention">Attention (30-60 min)</option>
            <option value="ok">OK (&ge;60 min)</option>
          </select>
          <ChevronDown size={14} className="select-arrow" />
        </div>

        <button className="btn-export" onClick={handleExport}>
          <Download size={14} />
          Exporter
        </button>
      </div>

      {/* Tabs */}
      <div className="tabs">
        {[['connexions','Connexions'],['arrivals','Arrivées'],['overview','Aperçu'],['details','Détails'],['appareils','Appareils']].map(([key, label]) => (
          <button
            key={key}
            className={`tab ${activeTab === key ? 'active' : ''}`}
            onClick={() => { setActiveTab(key); setSelectedOutbound(null); setSelectedInbound(null) }}
          >
            {label}
          </button>
        ))}
        <span className="tab-count">{filteredData.length} lignes</span>
      </div>

      {/* Content */}
      <div className="tab-content">

        {activeTab === 'connexions' && !selectedOutbound && (() => {
          const cards = Object.values(groupedByOutbound)
            .filter(g => g.volOutbound)
            .filter(g => !filters.volOutbound || g.volOutbound === filters.volOutbound)
            .filter(g => {
              if (!filters.search) return true
              const s = filters.search.toLowerCase()
              return g.volOutbound.toLowerCase().includes(s) ||
                g.connections.some(c => String(c['Vol Inbound'] || '').toLowerCase().includes(s))
            })
            .filter(g => {
              if (!filters.status) return true
              return g.connections.some(c => c.status === filters.status)
            })
            .filter(g => {
              if (periodFilter === 'day')   return isDayFlight(g.stdOutbound)
              if (periodFilter === 'night') return isNightFlight(g.stdOutbound)
              return true
            })
            .sort((a, b) => {
              const toMinutes = (std) => {
                const h = extractHour(std)
                if (h === null) return 9999
                // pour le tri nuit (18h-6h) on ramène les heures < 6 après minuit
                const str = String(std || '').trim()
                const m = str.match(/\d{1,2}\/\d{1,2}\/\d{2,4}\s+\d{1,2}:(\d{2})/) ||
                           str.match(/\d{2}\/\d{2}\/\d{4}\s+\d{2}:(\d{2})/)
                const min = m ? parseInt(m[1]) : 0
                return h * 60 + min
              }
              return toMinutes(a.stdOutbound) - toMinutes(b.stdOutbound)
            })

          return (
            <>
              {/* Filtre jour / nuit */}
              <div className="cx-period-bar">
                {[['all','Tous'],['day','Jour  6h – 18h'],['night','Nuit  18h – 6h']].map(([key, label]) => (
                  <button
                    key={key}
                    className={`cx-period-btn ${periodFilter === key ? 'active' : ''}`}
                    onClick={() => setPeriodFilter(key)}
                  >
                    {key === 'day'   && <span className="period-dot day" />}
                    {key === 'night' && <span className="period-dot night" />}
                    {label}
                    <span className="period-count">
                      {key === 'all'   ? Object.values(groupedByOutbound).filter(g => g.volOutbound).length
                      : key === 'day'  ? Object.values(groupedByOutbound).filter(g => g.volOutbound && isDayFlight(g.stdOutbound)).length
                                       : Object.values(groupedByOutbound).filter(g => g.volOutbound && isNightFlight(g.stdOutbound)).length}
                    </span>
                  </button>
                ))}
              </div>

              <div className="cx-grid">
                {cards.map(g => {
                  const bags = g.totalPTM * 2
                  const info = flightInfo[g.volOutbound] || {}
                  return (
                    <button
                      key={g.volOutbound}
                      className={`cx-card ${g.critiques > 0 ? 'cx-card--alert' : ''}`}
                      onClick={() => setSelectedOutbound(g.volOutbound)}
                    >
                      <div className="cx-card-header">
                        <div className="cx-card-header-left">
                          <div className="cx-flight-icon"><Plane size={16} /></div>
                          <span className="cx-vol">{g.volOutbound}</span>
                          {g.critiques > 0 && (
                            <span className="cx-alert-badge">
                              <AlertTriangle size={11} />{g.critiques}
                            </span>
                          )}
                        </div>
                        <span className="cx-std-time">{fmtTime(g.stdOutbound)}</span>
                      </div>

                      {g.segmentOutbound && (
                        <div className="cx-route">
                          <MapPin size={11} />
                          {fmtRoute(g.segmentOutbound)}
                        </div>
                      )}

                      <div className="cx-divider" />

                      <div className="cx-metrics">
                        <div className="cx-metric">
                          <span className="cx-metric-val">{g.connections.length}</span>
                          <span className="cx-metric-lbl">Inbound</span>
                        </div>
                        <div className="cx-sep" />
                        <div className="cx-metric">
                          <span className="cx-metric-val cx-ptm-val">{g.totalPTM}</span>
                          <span className="cx-metric-lbl">PTM</span>
                        </div>
                        <div className="cx-sep" />
                        <div className="cx-metric">
                          {info.bagsReal
                            ? <span className="cx-metric-val cx-bags-real-val">{parseInt(info.bagsReal)}</span>
                            : <span className="cx-metric-val cx-bags-val">{bags}</span>
                          }
                          <span className="cx-metric-lbl">Bags</span>
                        </div>
                      </div>

                      <div className="cx-card-footer">
                        <div className="cx-card-footer-left">
                          {info.immatriculation && <span className="cx-immat">{info.immatriculation}</span>}
                          {info.parking && <span className="cx-parking-tag">{info.parking}</span>}
                        </div>
                        {(info.immatriculation || info.parking) && (
                          <div className="cx-live"><span className="cx-live-dot" />Live</div>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            </>
          )
        })()}

        {activeTab === 'connexions' && selectedOutbound && (() => {
          const g = groupedByOutbound[selectedOutbound]
          const sorted = [...g.connections].sort(
            (a, b) => (a.connectionTime ?? 9999) - (b.connectionTime ?? 9999)
          )
          const outInfo = flightInfo[g.volOutbound] || {}
          const destCode = destOf(g.segmentOutbound)
          return (
            <div className="cx-detail">
              <div className="cx-detail-header">
                <button className="cx-back" onClick={() => setSelectedOutbound(null)}>
                  <ChevronLeft size={16} />
                  Tous les vols
                </button>
                <div className="cx-detail-title">
                  <div className="cx-flight-icon large"><Plane size={20} /></div>
                  <div>
                    <h2>{g.volOutbound}</h2>
                    <span>Départ {fmtDate(g.stdOutbound)}</span>
                  </div>
                </div>
                <div className="cx-detail-kpis">
                  <div className="cx-dkpi"><strong>{g.connections.length}</strong><label>Vols inbound</label></div>
                  <div className="cx-dkpi cx-dkpi--ptm"><strong>{g.totalPTM}</strong><label>Total PTM</label></div>
                  {g.critiques > 0 && <div className="cx-dkpi cx-dkpi--danger"><strong>{g.critiques}</strong><label>Critiques</label></div>}
                </div>
                <div className="cx-view-toggle">
                  <button className={`cx-view-btn ${detailView === 'table' ? 'active' : ''}`} onClick={() => setDetailView('table')} title="Vue liste"><LayoutList size={15} /></button>
                  <button className={`cx-view-btn ${detailView === 'cards' ? 'active' : ''}`} onClick={() => setDetailView('cards')} title="Vue cartes"><LayoutGrid size={15} /></button>
                </div>
              </div>

              {detailView === 'table' ? (
                <div className="cx-detail-table-wrap">
                  <table className="cx-detail-table">
                    <thead><tr><th>Vol Inbound</th><th>STA estimée</th><th>Immat.</th><th>Parking</th><th>Tps connexion</th><th>PTM</th><th>Statut</th></tr></thead>
                    <tbody>
                      {sorted.map((row, i) => {
                        const inInfo = flightInfo[row['Vol Inbound']] || {}
                        return (
                          <tr key={i} className={`row-${row.status || 'unknown'}`}>
                            <td><span className="flight-tag">{row['Vol Inbound']}</span></td>
                            <td className="date-cell">{fmtDate(row['STA Inbound'])}</td>
                            <td className="ap-cell">{inInfo.immatriculation || <span className="ap-empty">—</span>}</td>
                            <td className="ap-cell">{inInfo.parking || <span className="ap-empty">—</span>}</td>
                            <td>{row['Temps de connexion'] ? <span className={`time-badge status-${row.status}`}>{row['Temps de connexion']}</span> : '-'}</td>
                            <td className="num-cell">{row.ptm}</td>
                            <td>
                              {row.status === 'critique'  && <span className="status-pill pill-critique">Critique</span>}
                              {row.status === 'attention' && <span className="status-pill pill-attention">Attention</span>}
                              {row.status === 'ok'        && <span className="status-pill pill-ok">OK</span>}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="bp-grid">
                  {sorted.map((row, i) => {
                    const inInfo     = flightInfo[row['Vol Inbound']] || {}
                    const originCode = originOf(row['Segment Inbound'] || '')
                    return (
                      <div key={i} className={`bp-card bp-card--${row.status}`}>
                        <div className="bp-top">
                          <div className="bp-top-left">
                            <span className="bp-section-label">VOL INBOUND</span>
                            <span className="bp-vol">{row['Vol Inbound']}</span>
                            <div className="bp-badges">
                              {inInfo.immatriculation && <span className="bp-badge">{inInfo.immatriculation}</span>}
                              {inInfo.parking && <span className="bp-badge bp-badge--park">{inInfo.parking}</span>}
                            </div>
                          </div>
                          {originCode && <>
                            <span className="bp-airport-bg">{originCode}</span>
                            <div className="bp-city-time">
                              <span className="bp-city">{airportCity(originCode)}</span>
                              <span className="bp-time">{fmtTime(row['STA Inbound'])}</span>
                            </div>
                          </>}
                        </div>

                        <div className="bp-middle">
                          <div className="bp-timeline">
                            <div className="bp-tl-dot" />
                            <div className="bp-tl-line" />
                            <div className="bp-tl-dot" />
                          </div>
                          <div className="bp-layover">
                            <span className="bp-layover-label">TEMPS DE CONNEXION</span>
                            <span className="bp-layover-val">
                              {fmtConnectionTime(row.connectionTime)}
                              <span className="bp-layover-unit"> HRS</span>
                            </span>
                          </div>
                          <div className={`bp-conn-status bp-conn--${row.status}`}>
                            <span className="bp-conn-dot" />
                            {row.status === 'critique' ? 'CONNEXION À RISQUE' : row.status === 'attention' ? 'CONNEXION SERRÉE' : 'CONNEXION OK'}
                          </div>
                          <span className="bp-ptm-badge">{row.ptm} PTM</span>
                        </div>

                        <div className="bp-bottom">
                          <div className="bp-bottom-left">
                            {destCode && <>
                              <span className="bp-airport-bg bp-airport-bg--bottom">{destCode}</span>
                              <div className="bp-city-time bp-city-time--bottom">
                                <span className="bp-city">{airportCity(destCode)}</span>
                                <span className="bp-time">{fmtTime(g.stdOutbound)}</span>
                              </div>
                            </>}
                          </div>
                          <div className="bp-bottom-right">
                            <div className="bp-badges">
                              {outInfo.immatriculation && <span className="bp-badge">{outInfo.immatriculation}</span>}
                              {outInfo.parking && <span className="bp-badge bp-badge--park">{outInfo.parking}</span>}
                            </div>
                            <span className="bp-section-label">VOL OUTBOUND</span>
                            <span className="bp-vol">{g.volOutbound}</span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })()}

        {/* ── ARRIVÉES — grille inbound ── */}
        {activeTab === 'arrivals' && !selectedInbound && (() => {
          const cards = Object.values(groupedByInbound)
            .filter(g => g.volInbound)
            .filter(g => {
              if (!filters.search) return true
              const s = filters.search.toLowerCase()
              return g.volInbound.toLowerCase().includes(s) ||
                g.connections.some(c => String(c['Vol Outbound'] || '').toLowerCase().includes(s))
            })
            .filter(g => {
              if (!filters.status) return true
              return g.connections.some(c => c.status === filters.status)
            })
            .filter(g => {
              if (periodFilterIn === 'day')   return isDayFlight(g.staInbound)
              if (periodFilterIn === 'night') return isNightFlight(g.staInbound)
              return true
            })
            .sort((a, b) => {
              const toMin = (sta) => {
                const h = extractHour(sta); if (h === null) return 9999
                const m = String(sta).trim().match(/\d{1,2}\/\d{1,2}\/\d{2,4}\s+\d{1,2}:(\d{2})/) ||
                          String(sta).trim().match(/\d{2}\/\d{2}\/\d{4}\s+\d{2}:(\d{2})/)
                return h * 60 + (m ? parseInt(m[1]) : 0)
              }
              return toMin(a.staInbound) - toMin(b.staInbound)
            })

          const allIn = Object.values(groupedByInbound).filter(g => g.volInbound)
          return (
            <>
              <div className="cx-period-bar">
                {[['all','Tous'],['day','Jour  6h – 18h'],['night','Nuit  18h – 6h']].map(([key, label]) => (
                  <button
                    key={key}
                    className={`cx-period-btn ${periodFilterIn === key ? 'active' : ''}`}
                    onClick={() => setPeriodFilterIn(key)}
                  >
                    {key === 'day'   && <span className="period-dot day" />}
                    {key === 'night' && <span className="period-dot night" />}
                    {label}
                    <span className="period-count">
                      {key === 'all'   ? allIn.length
                      : key === 'day'  ? allIn.filter(g => isDayFlight(g.staInbound)).length
                                       : allIn.filter(g => isNightFlight(g.staInbound)).length}
                    </span>
                  </button>
                ))}
              </div>

              <div className="cx-grid">
                {cards.map(g => {
                  const info = flightInfo[g.volInbound] || {}
                  return (
                    <button
                      key={g.volInbound}
                      className={`cx-card ${g.critiques > 0 ? 'cx-card--alert' : ''}`}
                      onClick={() => setSelectedInbound(g.volInbound)}
                    >
                      <div className="cx-card-header">
                        <div className="cx-card-header-left">
                          <div className="cx-flight-icon" style={{ background: 'var(--sky-dim)', borderColor: 'rgba(14,165,233,0.2)', color: 'var(--sky)' }}>
                            <PlaneLanding size={16} />
                          </div>
                          <span className="cx-vol">{g.volInbound}</span>
                          {g.critiques > 0 && (
                            <span className="cx-alert-badge">
                              <AlertTriangle size={11} />{g.critiques}
                            </span>
                          )}
                        </div>
                        <span className="cx-std-time" style={{ color: 'var(--sky)' }}>{fmtTime(g.staInbound)}</span>
                      </div>

                      {g.segmentInbound && (
                        <div className="cx-route">
                          <MapPin size={11} />
                          {fmtRoute(g.segmentInbound)}
                        </div>
                      )}

                      <div className="cx-divider" />

                      <div className="cx-metrics">
                        <div className="cx-metric">
                          <span className="cx-metric-val">{g.connections.length}</span>
                          <span className="cx-metric-lbl">Outbound</span>
                        </div>
                        <div className="cx-sep" />
                        <div className="cx-metric">
                          <span className="cx-metric-val cx-ptm-val">{g.totalPTM}</span>
                          <span className="cx-metric-lbl">PTM</span>
                        </div>
                        <div className="cx-sep" />
                        <div className="cx-metric">
                          {info.bagsReal
                            ? <span className="cx-metric-val cx-bags-real-val">{parseInt(info.bagsReal)}</span>
                            : <span className="cx-metric-val cx-bags-val">{g.totalPTM * 2}</span>
                          }
                          <span className="cx-metric-lbl">Bags</span>
                        </div>
                      </div>

                      <div className="cx-card-footer">
                        <div className="cx-card-footer-left">
                          {info.immatriculation && <span className="cx-immat">{info.immatriculation}</span>}
                          {info.parking && <span className="cx-parking-tag">{info.parking}</span>}
                        </div>
                        {(info.immatriculation || info.parking) && (
                          <div className="cx-live"><span className="cx-live-dot" />Live</div>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            </>
          )
        })()}

        {/* ── ARRIVÉES — détail outbound d'un inbound ── */}
        {activeTab === 'arrivals' && selectedInbound && (() => {
          const g = groupedByInbound[selectedInbound]
          const sorted = [...g.connections].sort(
            (a, b) => (a.connectionTime ?? 9999) - (b.connectionTime ?? 9999)
          )
          const inInfo     = flightInfo[g.volInbound] || {}
          const originCode = originOf(g.segmentInbound)
          return (
            <div className="cx-detail">
              <div className="cx-detail-header">
                <button className="cx-back" onClick={() => setSelectedInbound(null)}>
                  <ChevronLeft size={16} />
                  Tous les vols
                </button>
                <div className="cx-detail-title">
                  <div className="cx-flight-icon large" style={{ background: 'var(--sky-dim)', borderColor: 'rgba(14,165,233,0.2)', color: 'var(--sky)' }}>
                    <PlaneLanding size={20} />
                  </div>
                  <div>
                    <h2>{g.volInbound}</h2>
                    <span>Arrivée {fmtDate(g.staInbound)}</span>
                  </div>
                </div>
                <div className="cx-detail-kpis">
                  <div className="cx-dkpi"><strong>{g.connections.length}</strong><label>Vols outbound</label></div>
                  <div className="cx-dkpi cx-dkpi--ptm"><strong>{g.totalPTM}</strong><label>Total PTM</label></div>
                  {g.critiques > 0 && <div className="cx-dkpi cx-dkpi--danger"><strong>{g.critiques}</strong><label>Critiques</label></div>}
                </div>
                <div className="cx-view-toggle">
                  <button className={`cx-view-btn ${detailView === 'table' ? 'active' : ''}`} onClick={() => setDetailView('table')} title="Vue liste"><LayoutList size={15} /></button>
                  <button className={`cx-view-btn ${detailView === 'cards' ? 'active' : ''}`} onClick={() => setDetailView('cards')} title="Vue cartes"><LayoutGrid size={15} /></button>
                </div>
              </div>

              {detailView === 'table' ? (
                <div className="cx-detail-table-wrap">
                  <table className="cx-detail-table">
                    <thead><tr><th>Vol Outbound</th><th>STD estimée</th><th>Immat.</th><th>Parking</th><th>Tps connexion</th><th>PTM</th><th>Statut</th></tr></thead>
                    <tbody>
                      {sorted.map((row, i) => {
                        const outInfo = flightInfo[row['Vol Outbound']] || {}
                        return (
                          <tr key={i} className={`row-${row.status || 'unknown'}`}>
                            <td><span className="flight-tag outbound">{row['Vol Outbound']}</span></td>
                            <td className="date-cell">{fmtDate(row['STD Outbound'])}</td>
                            <td className="ap-cell">{outInfo.immatriculation || <span className="ap-empty">—</span>}</td>
                            <td className="ap-cell">{outInfo.parking || <span className="ap-empty">—</span>}</td>
                            <td>{row['Temps de connexion'] ? <span className={`time-badge status-${row.status}`}>{row['Temps de connexion']}</span> : '-'}</td>
                            <td className="num-cell">{row.ptm}</td>
                            <td>
                              {row.status === 'critique'  && <span className="status-pill pill-critique">Critique</span>}
                              {row.status === 'attention' && <span className="status-pill pill-attention">Attention</span>}
                              {row.status === 'ok'        && <span className="status-pill pill-ok">OK</span>}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="bp-grid">
                  {sorted.map((row, i) => {
                    const outInfo  = flightInfo[row['Vol Outbound']] || {}
                    const destCode = destOf(row['Segment Outbound'] || '')
                    return (
                      <div key={i} className={`bp-card bp-card--${row.status}`}>
                        <div className="bp-top">
                          <div className="bp-top-left">
                            <span className="bp-section-label">VOL INBOUND</span>
                            <span className="bp-vol">{g.volInbound}</span>
                            <div className="bp-badges">
                              {inInfo.immatriculation && <span className="bp-badge">{inInfo.immatriculation}</span>}
                              {inInfo.parking && <span className="bp-badge bp-badge--park">{inInfo.parking}</span>}
                            </div>
                          </div>
                          {originCode && <>
                            <span className="bp-airport-bg">{originCode}</span>
                            <div className="bp-city-time">
                              <span className="bp-city">{airportCity(originCode)}</span>
                              <span className="bp-time">{fmtTime(g.staInbound)}</span>
                            </div>
                          </>}
                        </div>

                        <div className="bp-middle">
                          <div className="bp-timeline">
                            <div className="bp-tl-dot" />
                            <div className="bp-tl-line" />
                            <div className="bp-tl-dot" />
                          </div>
                          <div className="bp-layover">
                            <span className="bp-layover-label">TEMPS DE CONNEXION</span>
                            <span className="bp-layover-val">
                              {fmtConnectionTime(row.connectionTime)}
                              <span className="bp-layover-unit"> HRS</span>
                            </span>
                          </div>
                          <div className={`bp-conn-status bp-conn--${row.status}`}>
                            <span className="bp-conn-dot" />
                            {row.status === 'critique' ? 'CONNEXION À RISQUE' : row.status === 'attention' ? 'CONNEXION SERRÉE' : 'CONNEXION OK'}
                          </div>
                          <span className="bp-ptm-badge">{row.ptm} PTM</span>
                        </div>

                        <div className="bp-bottom">
                          <div className="bp-bottom-left">
                            {destCode && <>
                              <span className="bp-airport-bg bp-airport-bg--bottom">{destCode}</span>
                              <div className="bp-city-time bp-city-time--bottom">
                                <span className="bp-city">{airportCity(destCode)}</span>
                                <span className="bp-time">{fmtTime(row['STD Outbound'])}</span>
                              </div>
                            </>}
                          </div>
                          <div className="bp-bottom-right">
                            <div className="bp-badges">
                              {outInfo.immatriculation && <span className="bp-badge">{outInfo.immatriculation}</span>}
                              {outInfo.parking && <span className="bp-badge bp-badge--park">{outInfo.parking}</span>}
                            </div>
                            <span className="bp-section-label">VOL OUTBOUND</span>
                            <span className="bp-vol">{row['Vol Outbound']}</span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })()}

        {activeTab === 'overview' && (
          <div className="charts-grid-full">

            {/* Ligne 1 */}
            <div className="chart-panel">
              <div className="panel-header">
                <h3>Distribution — Temps de connexion</h3>
                <span className="panel-subtitle">Vols inbound par tranche de temps</span>
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={connectionDistribution} barSize={40}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="name" stroke="var(--text-faint)" tick={{ fontSize: 12 }} />
                  <YAxis stroke="var(--text-faint)" tick={{ fontSize: 12 }} width={30} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="value" name="Vols" radius={[4,4,0,0]}>
                    {connectionDistribution.map(entry => (
                      <Cell key={entry.name} fill={DIST_COLORS[entry.name] || '#3B82F6'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="chart-panel">
              <div className="panel-header">
                <h3>Répartition par statut</h3>
                <span className="panel-subtitle">Critique · Attention · OK</span>
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={statusDistribution}
                    cx="50%" cy="50%"
                    innerRadius={55} outerRadius={85}
                    paddingAngle={3}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    labelLine={false}
                  >
                    {statusDistribution.map(entry => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                  <Legend
                    iconType="circle"
                    iconSize={8}
                    formatter={v => <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{v}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Ligne 2 */}
            <div className="chart-panel chart-panel--wide">
              <div className="panel-header">
                <h3>PTM total vs critique par vol outbound</h3>
                <span className="panel-subtitle">Top 12 — PTM sûr (bleu) + critique (rouge)</span>
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={outboundRiskChart} barSize={22} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                  <XAxis type="number" stroke="var(--text-faint)" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" stroke="var(--text-faint)" tick={{ fontSize: 11 }} width={64} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="safe"     name="Sûr"      stackId="s" fill="#3B82F6" radius={[0,0,0,0]} />
                  <Bar dataKey="critique" name="Critique" stackId="s" fill="#F43F5E" radius={[0,4,4,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Ligne 3 */}
            <div className="chart-panel">
              <div className="panel-header">
                <h3>Arrivées inbound par heure</h3>
                <span className="panel-subtitle">Distribution des STA sur 24h</span>
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={arrivalsByHour} barSize={18}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="hour" stroke="var(--text-faint)" tick={{ fontSize: 10 }} interval={1} />
                  <YAxis stroke="var(--text-faint)" tick={{ fontSize: 11 }} width={28} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="total"    name="Total"    stackId="h" fill="#0EA5E9" radius={[0,0,0,0]} />
                  <Bar dataKey="critique" name="Critique" stackId="h" fill="#F43F5E" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="chart-panel">
              <div className="panel-header">
                <h3>Top 10 vols inbound par PTM</h3>
                <span className="panel-subtitle">Vols apportant le plus de passagers</span>
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={topInboundPTM} barSize={22} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                  <XAxis type="number" stroke="var(--text-faint)" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" stroke="var(--text-faint)" tick={{ fontSize: 11 }} width={64} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="value" name="PTM" fill="#A78BFA" radius={[0,4,4,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

          </div>
        )}

        {activeTab === 'details' && (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Vol Inbound</th>
                  <th>STA Inbound</th>
                  <th>Vol Outbound</th>
                  <th>STD Outbound</th>
                  <th>Tps connexion</th>
                  <th>PTM</th>
                  <th>Statut</th>
                </tr>
              </thead>
              <tbody>
                {filteredData.slice(0, 200).map((row, idx) => (
                  <tr key={idx} className={`row-${row.status || 'unknown'}`}>
                    <td><span className="flight-tag">{row['Vol Inbound']}</span></td>
                    <td className="date-cell">{fmtDate(row['STA Inbound'])}</td>
                    <td><span className="flight-tag outbound">{row['Vol Outbound']}</span></td>
                    <td className="date-cell">{fmtDate(row['STD Outbound'])}</td>
                    <td>
                      {row['Temps de connexion'] ? (
                        <span className={`time-badge status-${row.status}`}>
                          {row['Temps de connexion']}
                        </span>
                      ) : '-'}
                    </td>
                    <td className="num-cell">{row.ptm}</td>
                    <td>
                      {row.status === 'critique' && <span className="status-pill pill-critique">Critique</span>}
                      {row.status === 'attention' && <span className="status-pill pill-attention">Attention</span>}
                      {row.status === 'ok'        && <span className="status-pill pill-ok">OK</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredData.length > 200 && (
              <div className="table-more">
                Affichage de 200 / {filteredData.length} lignes — utilisez les filtres pour affiner
              </div>
            )}
          </div>
        )}

        {activeTab === 'outbound' && (
          <div className="outbound-grid">
            {outboundVols
              .filter(v => !filters.volOutbound || v === filters.volOutbound)
              .map(volOut => {
                const g = groupedByOutbound[volOut]
                const hasCritiques = g.critiques > 0
                return (
                  <div key={volOut} className={`outbound-card ${hasCritiques ? 'has-critiques' : ''}`}>
                    <div className="oc-head">
                      <div>
                        <div className="oc-vol">{volOut}</div>
                        <div className="oc-time">{fmtDate(g.stdOutbound)}</div>
                      </div>
                      <div className="oc-kpis">
                        <div className="oc-kpi">
                          <span>{g.totalPTM}</span>
                          <label>PTM</label>
                        </div>
                        <div className="oc-kpi">
                          <span>{g.connections.length}</span>
                          <label>Inbound</label>
                        </div>
                        <div className="oc-kpi">
                          <span>{g.avgConnectionTime} min</span>
                          <label>Moy.</label>
                        </div>
                        {hasCritiques && (
                          <div className="oc-kpi kpi-danger">
                            <span>{g.critiques}</span>
                            <label>Critique</label>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="oc-connections">
                      {g.connections
                        .sort((a, b) => (a.connectionTime ?? 999) - (b.connectionTime ?? 999))
                        .slice(0, 6)
                        .map((c, i) => (
                          <div key={i} className={`oc-row status-${c.status}`}>
                            <span className="oc-inbound">{c['Vol Inbound']}</span>
                            <span className="oc-arr">{fmtDate(c['STA Inbound'])}</span>
                            <span className={`oc-ctime status-${c.status}`}>
                              {c['Temps de connexion'] || '-'}
                            </span>
                            <span className="oc-ptm">{c.ptm} pax</span>
                          </div>
                        ))}
                      {g.connections.length > 6 && (
                        <div className="oc-more">+{g.connections.length - 6} autres</div>
                      )}
                    </div>
                  </div>
                )
              })}
          </div>
        )}

        {activeTab === 'appareils' && (() => {
          const allOut = outboundVols.filter(Boolean)
          const allIn  = uniqueInbound

          // Résoudre le vol actif : filtre global outbound > recherche globale > filtre local
          const globalVolSearch = filters.search.trim().toUpperCase()
          const globalVolOut    = filters.volOutbound

          const apOutbound = allOut.filter(vol => {
            const std = groupedByOutbound[vol]?.stdOutbound
            if (periodFilterAp === 'day')   return isDayFlight(std)
            if (periodFilterAp === 'night') return isNightFlight(std)
            return true
          }).filter(vol => {
            if (apVolFilter)    return vol === apVolFilter
            if (globalVolOut)   return vol === globalVolOut
            if (globalVolSearch) return vol.toUpperCase().includes(globalVolSearch)
            return true
          })

          const apInbound = allIn.filter(({ sta }) => {
            if (periodFilterAp === 'day')   return isDayFlight(sta)
            if (periodFilterAp === 'night') return isNightFlight(sta)
            return true
          }).filter(({ vol }) => {
            if (apVolFilter)    return vol === apVolFilter
            if (globalVolOut)   return false // filtre outbound → masquer inbound
            if (globalVolSearch) return vol.toUpperCase().includes(globalVolSearch)
            return true
          })

          // liste des vols disponibles pour le sélecteur selon catégorie + période
          const volsForSelect = [
            ...(apCategoryFilter !== 'inbound'
              ? allOut.filter(vol => {
                  const std = groupedByOutbound[vol]?.stdOutbound
                  if (periodFilterAp === 'day')   return isDayFlight(std)
                  if (periodFilterAp === 'night') return isNightFlight(std)
                  return true
                }).map(v => ({ vol: v, type: 'outbound' }))
              : []),
            ...(apCategoryFilter !== 'outbound'
              ? allIn.filter(({ sta }) => {
                  if (periodFilterAp === 'day')   return isDayFlight(sta)
                  if (periodFilterAp === 'night') return isNightFlight(sta)
                  return true
                }).map(({ vol }) => ({ vol, type: 'inbound' }))
              : []),
          ]

          // si un filtre global outbound est actif, forcer l'affichage outbound uniquement
          const showOutbound = globalVolOut ? true  : apCategoryFilter !== 'inbound'
          const showInbound  = globalVolOut ? false : apCategoryFilter !== 'outbound'

          return (
          <div className="ap-page">
            {/* Barre de filtres : catégorie + période */}
            <div className="ap-filters-row">
              {/* Catégorie */}
              <div className="cx-period-bar ap-category-bar">
                {[
                  ['all',      'Tous vols',  allOut.length + allIn.length],
                  ['outbound', 'Outbound',   allOut.length],
                  ['inbound',  'Inbound',    allIn.length],
                ].map(([key, label, count]) => (
                  <button
                    key={key}
                    className={`cx-period-btn ${apCategoryFilter === key ? 'active' : ''}`}
                    onClick={() => { setApCategoryFilter(key); setApVolFilter('') }}
                  >
                    {key === 'outbound' && <PlaneTakeoff size={13} />}
                    {key === 'inbound'  && <PlaneLanding  size={13} />}
                    {label}
                    <span className="period-count">{count}</span>
                  </button>
                ))}
              </div>

              {/* Période */}
              <div className="cx-period-bar">
                {[['all','Tous'],['day','Jour  6h – 18h'],['night','Nuit  18h – 6h']].map(([key, label]) => (
                  <button
                    key={key}
                    className={`cx-period-btn ${periodFilterAp === key ? 'active' : ''}`}
                    onClick={() => { setPeriodFilterAp(key); setApVolFilter('') }}
                  >
                    {key === 'day'   && <span className="period-dot day" />}
                    {key === 'night' && <span className="period-dot night" />}
                    {label}
                    <span className="period-count">
                      {key === 'all'
                        ? (apCategoryFilter !== 'inbound' ? allOut.length : 0) + (apCategoryFilter !== 'outbound' ? allIn.length : 0)
                        : key === 'day'
                          ? (apCategoryFilter !== 'inbound'  ? allOut.filter(v => isDayFlight(groupedByOutbound[v]?.stdOutbound)).length : 0) +
                            (apCategoryFilter !== 'outbound' ? allIn.filter(({ sta }) => isDayFlight(sta)).length : 0)
                          : (apCategoryFilter !== 'inbound'  ? allOut.filter(v => isNightFlight(groupedByOutbound[v]?.stdOutbound)).length : 0) +
                            (apCategoryFilter !== 'outbound' ? allIn.filter(({ sta }) => isNightFlight(sta)).length : 0)}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Champ recherche / sélection vol */}
            <div className="ap-search-row">
              <div className="select-field ap-vol-select">
                <select
                  value={apVolFilter}
                  onChange={e => setApVolFilter(e.target.value)}
                >
                  <option value="">— Tous les vols ({volsForSelect.length})</option>
                  {apCategoryFilter !== 'inbound' && volsForSelect.filter(v => v.type === 'outbound').length > 0 && (
                    <optgroup label="Outbound">
                      {volsForSelect.filter(v => v.type === 'outbound').map(({ vol }) => (
                        <option key={vol} value={vol}>{vol}</option>
                      ))}
                    </optgroup>
                  )}
                  {apCategoryFilter !== 'outbound' && volsForSelect.filter(v => v.type === 'inbound').length > 0 && (
                    <optgroup label="Inbound">
                      {volsForSelect.filter(v => v.type === 'inbound').map(({ vol }) => (
                        <option key={vol} value={vol}>{vol}</option>
                      ))}
                    </optgroup>
                  )}
                </select>
                <ChevronDown size={14} className="select-arrow" />
              </div>
              {apVolFilter && (
                <button className="ap-clear-btn" onClick={() => setApVolFilter('')}>
                  ✕ Effacer
                </button>
              )}
            </div>

            {/* Vols Outbound */}
            {showOutbound && (
              <div className="ap-section">
                <div className="ap-section-header">
                  <PlaneTakeoff size={16} />
                  <h3>Vols Outbound</h3>
                  <span className="ap-count">{apOutbound.length} vols</span>
                </div>
                <div className="ap-table-wrap">
                  <table className="ap-table">
                    <thead>
                      <tr>
                        <th>Vol</th>
                        <th>STD</th>
                        <th>Période</th>
                        <th>Immatriculation</th>
                        <th>Parking</th>
                        <th>Bagages réels</th>
                      </tr>
                    </thead>
                    <tbody>
                      {apOutbound.map(vol => {
                        const g    = groupedByOutbound[vol]
                        const info = flightInfo[vol] || {}
                        const isDay = isDayFlight(g.stdOutbound)
                        return (
                          <tr key={vol}>
                            <td><span className="flight-tag outbound">{vol}</span></td>
                            <td className="date-cell">{fmtDate(g.stdOutbound)}</td>
                            <td>
                              <span className={`cx-period-badge ${isDay ? 'badge-day' : 'badge-night'}`}>
                                {isDay ? '☀ Jour' : '☽ Nuit'}
                              </span>
                            </td>
                            <td>
                              <input
                                className="ap-input"
                                placeholder="ex: CN-RGT"
                                value={info.immatriculation || ''}
                                onChange={e => updateFlightInfo(vol, 'immatriculation', fmtImmat(e.target.value))}
                              />
                            </td>
                            <td>
                              <input
                                className="ap-input ap-input--short"
                                placeholder="ex: A12"
                                value={info.parking || ''}
                                onChange={e => updateFlightInfo(vol, 'parking', e.target.value.toUpperCase())}
                              />
                            </td>
                            <td>
                              <input
                                className="ap-input ap-input--short ap-input--bags"
                                type="number"
                                min="0"
                                placeholder={`${groupedByOutbound[vol]?.totalPTM * 2 || 0}`}
                                value={info.bagsReal || ''}
                                onChange={e => updateFlightInfo(vol, 'bagsReal', e.target.value)}
                              />
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Vols Inbound */}
            {showInbound && (
              <div className="ap-section">
                <div className="ap-section-header">
                  <PlaneLanding size={16} />
                  <h3>Vols Inbound</h3>
                  <span className="ap-count">{apInbound.length} vols</span>
                </div>
                <div className="ap-table-wrap">
                  <table className="ap-table">
                    <thead>
                      <tr>
                        <th>Vol</th>
                        <th>STA</th>
                        <th>Période</th>
                        <th>Immatriculation</th>
                        <th>Parking</th>
                        <th>Bagages réels</th>
                      </tr>
                    </thead>
                    <tbody>
                      {apInbound.map(({ vol, sta }) => {
                        const info  = flightInfo[vol] || {}
                        const isDay = isDayFlight(sta)
                        const defaultBags = (groupedByInbound[vol]?.totalPTM || 0) * 2
                        return (
                          <tr key={vol}>
                            <td><span className="flight-tag">{vol}</span></td>
                            <td className="date-cell">{fmtDate(sta)}</td>
                            <td>
                              <span className={`cx-period-badge ${isDay ? 'badge-day' : 'badge-night'}`}>
                                {isDay ? '☀ Jour' : '☽ Nuit'}
                              </span>
                            </td>
                            <td>
                              <input
                                className="ap-input"
                                placeholder="ex: CN-RGA"
                                value={info.immatriculation || ''}
                                onChange={e => updateFlightInfo(vol, 'immatriculation', fmtImmat(e.target.value))}
                              />
                            </td>
                            <td>
                              <input
                                className="ap-input ap-input--short"
                                placeholder="ex: B5"
                                value={info.parking || ''}
                                onChange={e => updateFlightInfo(vol, 'parking', e.target.value.toUpperCase())}
                              />
                            </td>
                            <td>
                              <input
                                className="ap-input ap-input--short ap-input--bags"
                                type="number"
                                min="0"
                                placeholder={`${defaultBags}`}
                                value={info.bagsReal || ''}
                                onChange={e => updateFlightInfo(vol, 'bagsReal', e.target.value)}
                              />
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
          )
        })()}

      </div>
    </div>
  )
}

export default Dashboard
