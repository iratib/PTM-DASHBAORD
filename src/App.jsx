import React, { useState, useEffect, useRef, useCallback } from 'react'
import { FolderOpen, RefreshCw, CloudOff, CheckCircle, Download, X, Clock, Sparkles, Sun, Moon } from 'lucide-react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import FileUpload from './components/FileUpload'
import Dashboard from './components/Dashboard'
import excelService from './services/excelService'
import googleSheetsService from './services/googleSheetsService'
import './App.css'

const AUTO_REFRESH_MS = 5 * 60 * 1000 // 5 minutes

function App() {
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW()
  const [data, setData]             = useState([])
  const [lastUpdate, setLastUpdate] = useState(null)
  const [isLoading, setIsLoading]   = useState(false)
  const [syncStatus, setSyncStatus] = useState('idle')
  const [syncError, setSyncError]   = useState('')
  const [pushStatus, setPushStatus] = useState('idle')
  const [dataSource, setDataSource] = useState(null) // 'excel' | 'sheets'
  const [nextRefreshIn, setNextRefreshIn] = useState(null) // secondes restantes
  const [autoRefreshStatus, setAutoRefreshStatus] = useState('idle') // 'idle' | 'refreshing'
  const autoRefreshRef = useRef(null)
  const countdownRef   = useRef(null)

  // Theme toggle (dark / light)
  const [theme, setTheme] = useState(() => localStorage.getItem('ptm_theme') || 'dark')
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('ptm_theme', theme)
  }, [theme])
  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark')

  // PWA install
  const [installPrompt, setInstallPrompt]   = useState(null)
  const [isInstalled, setIsInstalled]       = useState(false)
  const [showInstallTip, setShowInstallTip] = useState(false)
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches
                    || window.navigator.standalone === true

  useEffect(() => {
    if (isStandalone) { setIsInstalled(true); return }

    const handler = (e) => { e.preventDefault(); setInstallPrompt(e) }
    window.addEventListener('beforeinstallprompt', handler)
    window.addEventListener('appinstalled', () => { setIsInstalled(true); setInstallPrompt(null) })

    // Sur desktop Chrome le prompt peut tarder — on affiche le tip après 3s si pas de prompt
    const timer = setTimeout(() => {
      if (!installPrompt && !isInstalled) setShowInstallTip(true)
    }, 3000)

    return () => {
      window.removeEventListener('beforeinstallprompt', handler)
      clearTimeout(timer)
    }
  }, [])

  const handleInstall = async () => {
    if (installPrompt) {
      installPrompt.prompt()
      const { outcome } = await installPrompt.userChoice
      if (outcome === 'accepted') setIsInstalled(true)
      setInstallPrompt(null)
      setShowInstallTip(false)
    } else {
      setShowInstallTip(v => !v)
    }
  }

  /* ── Helpers ── */
  const applySheetData = (newData, source = 'sheets') => {
    setData(newData)
    const now = new Date().toISOString()
    setLastUpdate(now)
    setDataSource(source)
    sessionStorage.setItem('ptm_data',        JSON.stringify(newData))
    sessionStorage.setItem('last_update',     now)
    sessionStorage.setItem('ptm_data_source', source)
  }

  const applyFlightInfo = (flightInfo) => {
    if (Object.keys(flightInfo).length > 0) {
      localStorage.setItem('ptm_flight_info', JSON.stringify(flightInfo))
      window.dispatchEvent(new CustomEvent('ptm_flight_info_synced'))
    }
  }

  /* ── Auto-refresh ── */
  const startCountdown = useCallback(() => {
    clearInterval(countdownRef.current)
    setNextRefreshIn(AUTO_REFRESH_MS / 1000)
    countdownRef.current = setInterval(() => {
      setNextRefreshIn(prev => {
        if (prev <= 1) return AUTO_REFRESH_MS / 1000
        return prev - 1
      })
    }, 1000)
  }, [])

  const doAutoRefresh = useCallback(async () => {
    setAutoRefreshStatus('refreshing')
    try {
      const flightInfo = await googleSheetsService.syncFlightInfo()
      applyFlightInfo(flightInfo)
    } catch { /* silencieux */ }

    // Rafraîchit aussi les données principales si elles viennent de Sheets
    try {
      const currentSource = dataSource
      if (currentSource === 'sheets') {
        const sheetData = await googleSheetsService.sync()
        if (sheetData.length > 0) applySheetData(sheetData, 'sheets')
      }
    } catch { /* silencieux */ }

    setAutoRefreshStatus('idle')
    startCountdown()
  }, [dataSource, startCountdown])

  // Lance / relance le timer à chaque fois que hasData change ou que dataSource change
  useEffect(() => {
    clearInterval(autoRefreshRef.current)
    clearInterval(countdownRef.current)

    if (data.length > 0) {
      startCountdown()
      autoRefreshRef.current = setInterval(doAutoRefresh, AUTO_REFRESH_MS)
    } else {
      setNextRefreshIn(null)
    }

    return () => {
      clearInterval(autoRefreshRef.current)
      clearInterval(countdownRef.current)
    }
  }, [data.length > 0, dataSource]) // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Data ── */
  const handleDataLoaded = async (newData) => {
    applySheetData(newData, 'excel')

    setPushStatus('pushing')
    try {
      await googleSheetsService.push(newData)
      setPushStatus('pushed')
      setTimeout(() => setPushStatus('idle'), 4000)
    } catch (err) {
      console.error('Push Google Sheets:', err)
      setPushStatus('error')
      setTimeout(() => setPushStatus('idle'), 5000)
    }
  }

  const handleChangeFile = () => {
    setData([])
    setLastUpdate(null)
    setDataSource(null)
    setSyncStatus('idle')
    setSyncError('')
    setNextRefreshIn(null)
    sessionStorage.removeItem('ptm_data')
    sessionStorage.removeItem('last_update')
    sessionStorage.removeItem('ptm_data_source')
  }

  const handleGoogleSync = async () => {
    setSyncStatus('loading')
    setSyncError('')
    try {
      const [sheetData, flightInfo] = await Promise.all([
        googleSheetsService.sync(),
        googleSheetsService.syncFlightInfo(),
      ])
      if (!sheetData.length) throw new Error('Le sheet est vide ou les colonnes ne correspondent pas')
      applySheetData(sheetData, 'sheets')
      applyFlightInfo(flightInfo)
      // Redémarre le compteur après un sync manuel
      startCountdown()
      clearInterval(autoRefreshRef.current)
      autoRefreshRef.current = setInterval(doAutoRefresh, AUTO_REFRESH_MS)
      setSyncStatus('success')
      setTimeout(() => setSyncStatus('idle'), 3000)
    } catch (err) {
      setSyncStatus('error')
      setSyncError(err.message)
    }
  }

  // Restaurer uniquement si la session est déjà active (refresh page)
  useEffect(() => {
    const savedData       = sessionStorage.getItem('ptm_data')
    const savedLastUpdate = sessionStorage.getItem('last_update')
    const savedSource     = sessionStorage.getItem('ptm_data_source')
    if (savedData) {
      try {
        const parsed = JSON.parse(savedData)
        if (Array.isArray(parsed) && parsed.length > 0) {
          setData(parsed)
          if (savedLastUpdate) setLastUpdate(savedLastUpdate)
          if (savedSource)     setDataSource(savedSource)
        }
      } catch { /* ignore */ }
    }
  }, [])

  const hasData = data.length > 0

  return (
    <div className="app">
      <nav className="navbar">
        <div className="navbar-content">
          <div className="navbar-brand">
            <img src="icons/logo.png" alt="RAM Handling" className="brand-logo" />
            <div className="brand-text">
              <h1>PTM Dashboard</h1>
              <p>Gestion des connexions</p>
            </div>
          </div>

          <div className="navbar-actions">
            <button
              className="btn-theme-toggle"
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Passer en mode clair' : 'Passer en mode sombre'}
            >
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            {pushStatus !== 'idle' && (
              <div className={`push-indicator push-${pushStatus}`}>
                {pushStatus === 'pushing' && <><RefreshCw size={13} className="spin" /> Envoi vers Google Sheets…</>}
                {pushStatus === 'pushed'  && <><CheckCircle size={13} /> Google Sheets mis à jour</>}
                {pushStatus === 'error'   && <><CloudOff size={13} /> Échec envoi</>}
              </div>
            )}

            {nextRefreshIn !== null && (
              <div className={`auto-refresh-indicator ${autoRefreshStatus === 'refreshing' ? 'refreshing' : ''}`}>
                {autoRefreshStatus === 'refreshing'
                  ? <><RefreshCw size={12} className="spin" /> Rafraîchissement…</>
                  : <><Clock size={12} /> {nextRefreshIn >= 60
                      ? `Auto ↻ ${Math.ceil(nextRefreshIn / 60)}min`
                      : 'Auto ↻ <1min'
                    }</>
                }
              </div>
            )}

            <div className="sync-wrapper">
              <button
                className={`btn-sync ${syncStatus}`}
                onClick={handleGoogleSync}
                disabled={syncStatus === 'loading'}
              >
                {syncStatus === 'loading' ? <RefreshCw size={14} className="spin" />
                  : syncStatus === 'error'   ? <CloudOff size={14} />
                  : syncStatus === 'success' ? <CheckCircle size={14} />
                  : <RefreshCw size={14} />}
                {syncStatus === 'loading' ? 'Synchronisation…'
                  : syncStatus === 'error'   ? 'Échec sync'
                  : syncStatus === 'success' ? 'Synchronisé'
                  : 'Google Sheets'}
              </button>
              {syncStatus === 'error' && syncError && (
                <div className="sync-error-tooltip">{syncError}</div>
              )}
            </div>

            {/* Bouton installer — visible sur tous les navigateurs */}
            {!isInstalled && (
              <div className="install-wrapper">
                <button className="btn-install" onClick={handleInstall}>
                  <Download size={14} />
                  Installer l'app
                </button>
                {showInstallTip && !installPrompt && (
                  <div className="install-tip">
                    <button className="install-tip-close" onClick={() => setShowInstallTip(false)}>
                      <X size={12} />
                    </button>
                    <strong>Installer sur PC (Chrome)</strong>
                    <p>Clique sur l'icône <span className="install-tip-icon">⊕</span> dans la barre d'adresse, puis "Installer".</p>
                    <strong>Sur iPhone (Safari)</strong>
                    <p>Partager <span className="install-tip-icon">⬆</span> → "Sur l'écran d'accueil"</p>
                  </div>
                )}
              </div>
            )}

            {hasData && (
              <>
                {lastUpdate && (
                  <span className="last-update-label">
                    {new Date(lastUpdate).toLocaleString('fr-FR', {
                      day: '2-digit', month: '2-digit',
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </span>
                )}
                <button className="btn-change-file" onClick={handleChangeFile}>
                  <FolderOpen size={14} />
                  Changer de fichier
                </button>
              </>
            )}
          </div>
        </div>
      </nav>

      <main className="main-content">
        {!hasData ? (
          <div className="empty-state">
            <FileUpload onDataLoaded={handleDataLoaded} isLoading={isLoading} />
          </div>
        ) : (
          <Dashboard data={data} lastUpdate={lastUpdate} isLoading={isLoading} />
        )}
      </main>

      <footer className="footer">
        RAM Handling — PTM Connexion Dashboard {new Date().getFullYear()}
      </footer>

      {needRefresh && (
        <div className="update-banner">
          <Sparkles size={15} />
          <span>Nouvelle version disponible</span>
          <button className="update-banner-btn" onClick={() => updateServiceWorker(true)}>
            Mettre à jour
          </button>
        </div>
      )}
    </div>
  )
}

export default App
