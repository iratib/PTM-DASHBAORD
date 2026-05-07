import * as XLSX from 'xlsx'

export const excelService = {
  async readExcelFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result)
          const workbook = XLSX.read(data, { type: 'array' })
          const sheetName = workbook.SheetNames[0]
          const worksheet = workbook.Sheets[sheetName]
          const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 0, raw: false, dateNF: 'DD/MM/YYYY HH:MM:SS' })

          // Propagate merged-cell values (Vol Outbound, STD Outbound, Total PTM)
          // Excel merged cells only populate the first row of each group
          let lastOutbound = null
          let lastSTD = null
          let lastTotalPTM = null
          const jsonData = rawData.map(row => {
            if (row['Vol Outbound'])   lastOutbound  = row['Vol Outbound']
            if (row['STD Outbound'])   lastSTD       = row['STD Outbound']
            if (row['Total PTM'])      lastTotalPTM  = row['Total PTM']
            return {
              ...row,
              'Vol Outbound': row['Vol Outbound'] || lastOutbound || '',
              'STD Outbound': row['STD Outbound'] || lastSTD       || '',
              'Total PTM':    row['Total PTM']    || lastTotalPTM  || '',
            }
          })
          resolve(jsonData)
        } catch (error) {
          reject(new Error('Erreur lors de la lecture: ' + error.message))
        }
      }
      reader.onerror = () => {
        reject(new Error('Erreur lors de la lecture du fichier'))
      }
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
