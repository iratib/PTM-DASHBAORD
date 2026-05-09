import * as XLSX from 'xlsx'

export const excelService = {
  /* ── Parse Feuil3 : 3 tableaux côte à côte (DOM-INT | INT-DOM | INT-INT) ── */
  _parseFeuil3(workbook) {
    const sheetName = workbook.SheetNames.find(n => /feuil3/i.test(n))
      || workbook.SheetNames[2]
    if (!sheetName || !workbook.Sheets[sheetName]) return null

    const sheet = workbook.Sheets[sheetName]
    const rawRows = XLSX.utils.sheet_to_json(sheet, {
      header: 1, raw: false, defval: '', dateNF: 'DD/MM/YYYY HH:MM:SS',
    })
    if (rawRows.length < 2) return null

    // Trouve la ligne contenant "Vol Inbound" au moins 2 fois
    const headerRowIdx = rawRows.findIndex(row =>
      row.filter(c => String(c).trim() === 'Vol Inbound').length >= 2
    )
    if (headerRowIdx === -1) return null

    const headerRow = rawRows[headerRowIdx]
    const starts = []
    headerRow.forEach((cell, i) => {
      if (String(cell).trim() === 'Vol Inbound') starts.push(i)
    })
    if (starts.length < 3) return null

    const dataRows = rawRows.slice(headerRowIdx + 1)
    const parseGroup = (startCol) => dataRows
      .map(row => ({
        vol:       String(row[startCol]     || '').trim(),
        sta:       String(row[startCol + 1] || '').trim(),
        heurePres: String(row[startCol + 2] || '').trim(),
        ptm:       parseInt(row[startCol + 3]) || 0,
      }))
      .filter(r => r.vol && r.ptm > 0)

    return {
      domInt: parseGroup(starts[0]),
      intDom: parseGroup(starts[1]),
      intInt: parseGroup(starts[2]),
    }
  },

  async readExcelFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result)
          const workbook = XLSX.read(data, { type: 'array' })
          // Feuil2 = nouveau format (avec Segment Inbound/Outbound) ; Feuil1 = ancien format
          const sheetName = workbook.SheetNames.includes('Feuil2')
            ? 'Feuil2'
            : workbook.SheetNames[0]
          const worksheet = workbook.Sheets[sheetName]
          const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 0, raw: false, dateNF: 'DD/MM/YYYY HH:MM:SS' })

          // Propagate merged-cell values
          let lastOutbound        = null
          let lastSTD             = null
          let lastTotalPTM        = null
          let lastSegmentOutbound = null
          const jsonData = rawData.map(row => {
            if (row['Vol Outbound'])      lastOutbound        = row['Vol Outbound']
            if (row['STD Outbound'])      lastSTD             = row['STD Outbound']
            if (row['Total PTM'])         lastTotalPTM        = row['Total PTM']
            if (row['Segment Outbound'])  lastSegmentOutbound = row['Segment Outbound']
            return {
              ...row,
              'Vol Outbound':     row['Vol Outbound']     || lastOutbound        || '',
              'STD Outbound':     row['STD Outbound']     || lastSTD             || '',
              'Total PTM':        row['Total PTM']        || lastTotalPTM        || '',
              'Segment Outbound': row['Segment Outbound'] || lastSegmentOutbound || '',
            }
          })

          const feuil3 = this._parseFeuil3(workbook)
          resolve({ data: jsonData, feuil3 })
        } catch (error) {
          reject(new Error('Erreur lors de la lecture: ' + error.message))
        }
      }
      reader.onerror = () => reject(new Error('Erreur lors de la lecture du fichier'))
      reader.readAsArrayBuffer(file)
    })
  },

  saveToLocalStorage(key, data) {
    try {
      localStorage.setItem(key, JSON.stringify(data))
      return true
    } catch (error) {
      console.error('Erreur localStorage:', error)
      return false
    }
  },

  getFromLocalStorage(key) {
    try {
      const data = localStorage.getItem(key)
      return data ? JSON.parse(data) : null
    } catch (error) {
      console.error('Erreur localStorage:', error)
      return null
    }
  },

  exportToExcel(data, filename = 'export.xlsx') {
    const headers = Object.keys(data[0] || {})
    const exportData = data.map(row => headers.map(h => row[h]))
    const ws = XLSX.utils.aoa_to_sheet([headers, ...exportData])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Données')
    XLSX.writeFile(wb, filename)
  }
}

export default excelService
