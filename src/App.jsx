import React, { useState, useEffect, useRef } from 'react'
import { FolderOpen, RefreshCw, CloudOff, CheckCircle, Download, X } from 'lucide-react'
import FileUpload from './components/FileUpload'
import Dashboard from './components/Dashboard'
import excelService from './services/excelService'
import googleSheetsService from './services/googleSheetsService'
import './App.css'

function App() {
  const [data, setData]             = useState([])
  const [lastUpdate, setLastUpdate] = useState(null)
  const [isLoading, setIsLoading]   = useState(false)
  const [syncStatus, setSyncStatus] = useState('idle')
  const [syncError, setSyncError]   = useState('')
  const [pushStatus, setPushStatus] = useState('idle')

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

  /* ── Data ── */
  const handleDataLoaded = async (newData) => {
    setData(newData)
    const now = new Date().toISOString()
    setLastUpdate(now)
    // sauvegarde pour refresh de page (session en cours uniquement)
    sessionStorage.setItem('ptm_data',    JSON.stringify(newData))
    sessionStorage.setItem('last_update', now)

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
    setSyncStatus('idle')
    setSyncError('')
    sessionStorage.removeItem('ptm_data')
    sessionStorage.removeItem('last_update')
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
      await handleDataLoaded(sheetData)
      // Google Sheets est la source de vérité — remplace le localStorage directement
      if (Object.keys(flightInfo).length > 0) {
        localStorage.setItem('ptm_flight_info', JSON.stringify(flightInfo))
        window.dispatchEvent(new CustomEvent('ptm_flight_info_synced'))
      }
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
    if (savedData) {
      try {
        const parsed = JSON.parse(savedData)
        if (Array.isArray(parsed) && parsed.length > 0) {
          setData(parsed)
          if (savedLastUpdate) setLastUpdate(savedLastUpdate)
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
            {pushStatus !== 'idle' && (
              <div className={`push-indicator push-${pushStatus}`}>
                {pushStatus === 'pushing' && <><RefreshCw size={13} className="spin" /> Envoi vers Google Sheets…</>}
                {pushStatus === 'pushed'  && <><CheckCircle size={13} /> Google Sheets mis à jour</>}
                {pushStatus === 'error'   && <><CloudOff size={13} /> Échec envoi</>}
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
    </div>
  )
}

export default App
