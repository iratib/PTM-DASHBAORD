import React, { useState, useEffect } from 'react'
import { FolderOpen, RefreshCw, CloudOff, CheckCircle, Download } from 'lucide-react'
import FileUpload from './components/FileUpload'
import Dashboard from './components/Dashboard'
import excelService from './services/excelService'
import googleSheetsService from './services/googleSheetsService'
import demoData from './demoData'
import './App.css'

function App() {
  const [data, setData]             = useState([])
  const [lastUpdate, setLastUpdate] = useState(null)
  const [isLoading, setIsLoading]   = useState(false)
  const [syncStatus, setSyncStatus] = useState('idle')   // 'idle'|'loading'|'success'|'error'
  const [syncError, setSyncError]   = useState('')
  const [pushStatus, setPushStatus] = useState('idle')   // 'idle'|'pushing'|'pushed'|'error'
  const [installPrompt, setInstallPrompt] = useState(null)
  const [isInstalled, setIsInstalled]     = useState(false)

  /* ── PWA install prompt ── */
  useEffect(() => {
    const handler = (e) => { e.preventDefault(); setInstallPrompt(e) }
    window.addEventListener('beforeinstallprompt', handler)
    window.addEventListener('appinstalled', () => setIsInstalled(true))
    // déjà installée ?
    if (window.matchMedia('(display-mode: standalone)').matches) setIsInstalled(true)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstall = async () => {
    if (!installPrompt) return
    installPrompt.prompt()
    const { outcome } = await installPrompt.userChoice
    if (outcome === 'accepted') setIsInstalled(true)
    setInstallPrompt(null)
  }

  /* ── Data handlers ── */
  const handleDataLoaded = async (newData) => {
    setData(newData)
    const now = new Date().toISOString()
    setLastUpdate(now)
    excelService.saveToLocalStorage('ptm_data', newData)
    excelService.saveToLocalStorage('last_update', now)

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
    excelService.saveToLocalStorage('ptm_data', null)
    excelService.saveToLocalStorage('last_update', null)
  }

  const handleGoogleSync = async () => {
    setSyncStatus('loading')
    setSyncError('')
    try {
      const sheetData = await googleSheetsService.sync()
      if (!sheetData.length) throw new Error('Le sheet est vide ou les colonnes ne correspondent pas')
      handleDataLoaded(sheetData)
      setSyncStatus('success')
      setTimeout(() => setSyncStatus('idle'), 3000)
    } catch (err) {
      setSyncStatus('error')
      setSyncError(err.message)
    }
  }

  useEffect(() => {
    const savedData       = excelService.getFromLocalStorage('ptm_data')
    const savedLastUpdate = excelService.getFromLocalStorage('last_update')
    if (savedData && Array.isArray(savedData) && savedData.length > 0) {
      setData(savedData)
    } else if (import.meta.env.DEV) {
      handleDataLoaded(demoData)
    }
    if (savedLastUpdate) setLastUpdate(savedLastUpdate)
  }, [])

  const hasData = data.length > 0

  return (
    <div className="app">
      <nav className="navbar">
        <div className="navbar-content">

          {/* Logo RAM Handling */}
          <div className="navbar-brand">
            <img src="icons/logo.png" alt="RAM Handling" className="brand-logo" />
            <div className="brand-text">
              <h1>PTM Dashboard</h1>
              <p>Gestion des connexions</p>
            </div>
          </div>

          <div className="navbar-actions">
            {/* Indicateur push */}
            {pushStatus !== 'idle' && (
              <div className={`push-indicator push-${pushStatus}`}>
                {pushStatus === 'pushing' && <><RefreshCw size={13} className="spin" /> Envoi vers Google Sheets…</>}
                {pushStatus === 'pushed'  && <><CheckCircle size={13} /> Google Sheets mis à jour</>}
                {pushStatus === 'error'   && <><CloudOff size={13} /> Échec envoi Google Sheets</>}
              </div>
            )}

            {/* Bouton sync Google Sheets */}
            <div className="sync-wrapper">
              <button
                className={`btn-sync ${syncStatus}`}
                onClick={handleGoogleSync}
                disabled={syncStatus === 'loading'}
                title="Synchroniser depuis Google Sheets"
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

            {/* Bouton installer l'app */}
            {!isInstalled && installPrompt && (
              <button className="btn-install" onClick={handleInstall} title="Installer l'application">
                <Download size={14} />
                Installer l'app
              </button>
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
