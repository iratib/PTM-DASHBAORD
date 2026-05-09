const API_KEY    = import.meta.env.VITE_GOOGLE_SHEETS_API_KEY
const SHEET_ID   = import.meta.env.VITE_GOOGLE_SHEET_ID
const TAB_NAME   = import.meta.env.VITE_GOOGLE_SHEET_TAB || 'Feuil1'
const SCRIPT_URL = import.meta.env.VITE_GOOGLE_SCRIPT_URL

export const googleSheetsService = {

  async sync() {
    if (!API_KEY)  throw new Error('Clé API Google Sheets manquante dans le fichier .env')
    if (!SHEET_ID) throw new Error('ID du sheet manquant dans le fichier .env')

    const range    = encodeURIComponent(`${TAB_NAME}!A1:Z5000`)
    const url      = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${range}?key=${API_KEY}`

    let response
    try {
      response = await fetch(url)
    } catch {
      throw new Error('Impossible de contacter Google Sheets — vérifiez votre connexion internet')
    }

    if (!response.ok) {
      let msg = `Erreur HTTP ${response.status}`
      try {
        const err = await response.json()
        const detail = err?.error?.message || ''
        if (response.status === 403) msg = `Accès refusé (403) — le sheet doit être partagé "Tout le monde avec le lien" en lecture`
        else if (response.status === 400) msg = `Requête invalide (400) — vérifiez le nom de l'onglet : "${TAB_NAME}". ${detail}`
        else if (response.status === 404) msg = `Sheet introuvable (404) — vérifiez l'ID du sheet`
        else msg = detail || msg
      } catch { /* ignore */ }
      throw new Error(msg)
    }

    const json = await response.json()

    // Cas : réponse OK mais aucune valeur retournée
    if (!json.values || json.values.length === 0) {
      throw new Error(`L'onglet "${TAB_NAME}" est vide — ajoutez des données ou vérifiez le nom de l'onglet`)
    }

    // Cas : une seule ligne (seulement les en-têtes, pas de données)
    if (json.values.length < 2) {
      throw new Error(`L'onglet "${TAB_NAME}" ne contient que les en-têtes sans données`)
    }

    const parsed = this.parseSheetData(json.values)

    // Vérifier que les colonnes obligatoires sont présentes
    const required = ['Vol Inbound', 'STA Inbound', 'Vol Outbound', 'STD Outbound', 'PTM']
    const headers  = json.values[0].map(h => String(h).trim())
    const missing  = required.filter(col => !headers.includes(col))
    if (missing.length) {
      throw new Error(`Colonnes manquantes dans le sheet : ${missing.join(', ')}. En-têtes trouvés : ${headers.join(', ')}`)
    }

    return parsed
  },

  async push(data) {
    if (!SCRIPT_URL) throw new Error('URL du script Google manquante dans le fichier .env (VITE_GOOGLE_SCRIPT_URL)')
    if (!data || data.length === 0) throw new Error('Aucune donnée à envoyer')

    // no-cors obligatoire pour Apps Script — la réponse sera opaque mais les données sont bien écrites
    await fetch(SCRIPT_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(data),
    })
  },

  async pushFeuil3(feuil3) {
    if (!SCRIPT_URL || !feuil3) return
    const rows = [
      ...(feuil3.domInt || []).map(r => ({ type: 'DOM-INT', ...r })),
      ...(feuil3.intDom || []).map(r => ({ type: 'INT-DOM', ...r })),
      ...(feuil3.intInt || []).map(r => ({ type: 'INT-INT', ...r })),
    ]
    await fetch(SCRIPT_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ action: 'feuil3', data: rows }),
    })
  },

  async syncFeuil3() {
    if (!API_KEY || !SHEET_ID) return null
    const range = encodeURIComponent('FluxPTM!A1:F5000')
    const url   = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${range}?key=${API_KEY}&t=${Date.now()}`
    try {
      const response = await fetch(url)
      if (!response.ok) return null
      const json = await response.json()
      if (!json.values || json.values.length < 2) return null
      const headers = json.values[0].map(h => String(h).trim())
      const all = json.values.slice(1).map(row => {
        const obj = {}
        headers.forEach((h, i) => { obj[h] = row[i] !== undefined ? String(row[i]).trim() : '' })
        obj.ptm = parseInt(obj.ptm) || 0
        return obj
      }).filter(r => r.vol && r.ptm > 0)
      return {
        domInt: all.filter(r => r.type === 'DOM-INT').map(({ type, ...rest }) => rest),
        intDom: all.filter(r => r.type === 'INT-DOM').map(({ type, ...rest }) => rest),
        intInt: all.filter(r => r.type === 'INT-INT').map(({ type, ...rest }) => rest),
      }
    } catch {
      return null
    }
  },

  async pushFlightInfo(flightInfo) {
    if (!SCRIPT_URL) return
    const rows = Object.entries(flightInfo).map(([vol, info]) => ({
      vol,
      immatriculation: info.immatriculation || '',
      parking:         info.parking || '',
      bagsReal:        info.bagsReal || '',
    }))
    await fetch(SCRIPT_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ action: 'flightInfo', data: rows }),
    })
  },

  async syncFlightInfo() {
    if (!API_KEY || !SHEET_ID) return {}
    const range = encodeURIComponent('FlightInfo!A1:E1000')
    const url   = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${range}?key=${API_KEY}&t=${Date.now()}`
    try {
      const response = await fetch(url)
      if (!response.ok) return {}
      const json = await response.json()
      if (!json.values || json.values.length < 2) return {}
      const headers = json.values[0].map(h => String(h).trim())
      const result  = {}
      json.values.slice(1).forEach(row => {
        const vol = row[0]
        if (!vol) return
        const obj = {}
        headers.slice(1).forEach((header, idx) => {
          obj[header] = row[idx + 1] !== undefined ? String(row[idx + 1]).trim() : ''
        })
        result[vol] = obj
      })
      return result
    } catch {
      return {}
    }
  },

  parseSheetData(rawData) {
    if (!rawData || rawData.length < 2) return []
    const headers = rawData[0].map(h => String(h).trim())
    return rawData.slice(1)
      .filter(row => row.some(cell => String(cell).trim() !== ''))
      .map(row => {
        const obj = {}
        headers.forEach((header, idx) => {
          obj[header] = row[idx] !== undefined ? String(row[idx]).trim() : ''
        })
        return obj
      })
  },
}

export default googleSheetsService
