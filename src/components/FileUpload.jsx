import React, { useRef, useState } from 'react'
import { UploadCloud, FileSpreadsheet, AlertCircle } from 'lucide-react'
import excelService from '../services/excelService'
import './FileUpload.css'

const FileUpload = ({ onDataLoaded, isLoading }) => {
  const fileInputRef = useRef(null)
  const [dragActive, setDragActive] = useState(false)
  const [error, setError] = useState(null)

  const handleDrag = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(e.type === 'dragenter' || e.type === 'dragover')
  }

  const processFile = async (file) => {
    if (!file) return
    if (!file.name.match(/\.xlsx?$/i)) {
      setError('Format non supporté — utilisez un fichier .xlsx ou .xls')
      setTimeout(() => setError(null), 4000)
      return
    }
    try {
      setError(null)
      const data = await excelService.readExcelFile(file)
      if (data.length === 0) {
        setError('Le fichier est vide ou le format des colonnes est incorrect')
        setTimeout(() => setError(null), 4000)
        return
      }
      onDataLoaded(data)
    } catch (err) {
      setError(err.message)
      setTimeout(() => setError(null), 4000)
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    if (e.dataTransfer.files.length > 0) processFile(e.dataTransfer.files[0])
  }

  const handleChange = (e) => {
    if (e.target.files.length > 0) processFile(e.target.files[0])
  }

  return (
    <div className="upload-wrapper">
      <div className="upload-header">
        <div className="upload-logo">
          <FileSpreadsheet size={28} />
        </div>
        <h2>Importer les données PTM</h2>
        <p>Glissez-déposez votre fichier Excel ou cliquez pour parcourir</p>
      </div>

      <div
        className={`drop-zone ${dragActive ? 'drag-over' : ''} ${isLoading ? 'uploading' : ''}`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => !isLoading && fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls"
          onChange={handleChange}
          hidden
          disabled={isLoading}
        />
        <UploadCloud size={36} className="drop-icon" />
        <span className="drop-label">
          {isLoading ? 'Chargement…' : 'Sélectionner un fichier'}
        </span>
        <span className="drop-hint">.xlsx · .xls</span>
      </div>

      <div className="upload-cols">
        <div className="col-tag">Vol Inbound</div>
        <div className="col-tag">STA Inbound</div>
        <div className="col-tag">Vol Outbound</div>
        <div className="col-tag">STD Outbound</div>
        <div className="col-tag">PTM</div>
      </div>

      {error && (
        <div className="upload-error">
          <AlertCircle size={16} />
          {error}
        </div>
      )}
    </div>
  )
}

export default FileUpload
