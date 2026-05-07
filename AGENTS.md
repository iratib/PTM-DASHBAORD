# AI Agent Instructions - PTM Connexion Dashboard

Dashboard de gestion des connexions aéroportuaires pour optimiser les temps de transit des passagers dans un hub.

## 📊 Contexte Métier

**Processus de transit aéroportuaire** :
- **Vol Inbound** : Vol d'arrivée | **STA Inbound** : Heure d'arrivée estimée (format: 06/05/2026 20:20:00)
- **Vol Outbound** : Vol de départ | **STD Outbound** : Heure de départ estimée (format: 06/05/2026 22:05:00)
- **Temps de connexion** = STD Outbound - STA Inbound (minutes disponibles pour les passagers)
- **PTM** = Nombre de passagers par vol inbound
- **Total PTM** = Somme des passagers qui transitent vers le même vol outbound

## 🚀 Quick Start

```bash
npm install
npm run dev          # Serveur développement http://localhost:5173
npm run build        # Build production
npm run preview      # Prévisualiser build
```

## Architecture

### Data Flow
```
Excel Upload → excelService.readExcelFile() → App.handleDataLoaded() → 
  localStorage (ptm_data) → Dashboard (filtrage & visualisation)
```

### Structure
```
src/
├── components/
│   ├── FileUpload.jsx       # Upload drag & drop Excel
│   ├── Dashboard.jsx        # Vue principale avec timeline et tableau
│   ├── ConnectionTimeline.jsx  # Timeline Inbound→Outbound
│   ├── ConnectionTable.jsx  # Tableau détaillé des connexions
│   └── StatCard.jsx         # Cartes de statistiques
├── services/
│   └── excelService.js      # Lecture Excel + localStorage
├── styles/
│   ├── App.css              # Design système moderne
│   └── index.css            # Variables CSS globales
└── App.jsx                  # État centralisé
```

## Conventions Métier

### Colonnes Excel Requises (Case-Sensitive)
- `'Vol Inbound'` - Numéro vol arrivée
- `'STA Inbound'` - Heure arrivée (DD/MM/YYYY HH:MM:SS)
- `'Vol Outbound'` - Numéro vol départ
- `'STD Outbound'` - Heure départ (DD/MM/YYYY HH:MM:SS)
- `'PTM'` - Nombre passagers (numeric)

### Données Calculées
```javascript
// Temps de connexion en minutes
connectionTime = (STD Outbound - STA Inbound) / 60000

// Grouper par Vol Outbound → Sum PTM
totalPTM = sum(PTM) for all Inbound flights → same Outbound
```

## Gestion d'État

- **App.jsx** : État centralisé (`data`, `lastUpdate`, `isLoading`, `filters`)
- `handleDataLoaded()` : Sync localStorage + state
- Initialize from localStorage au mount
- Pas de Redux (volontairement simple)

## Optimisations Performance

Dashboard.jsx utilise `useMemo` pour :
- `filteredData` : Filtrer par vol outbound, recherche, plage temps connexion
- `stats` : Calcul agrégés (temps moyen, min, max, à risque)
- `connectionGroups` : Grouper inbound par outbound avec PTM total

## localStorage Schema
```javascript
localStorage['ptm_data'] = JSON.stringify(array of connection objects)
localStorage['last_update'] = JSON.stringify(ISO timestamp)
```

## Design Moderne

- **Theme** : Dark mode + Glassmorphism
- **Colors** : Bleus/violets dégradés, rouge pour alertes (connexions < 30min)
- **Icons** : lucide-react (Plane, Clock, AlertCircle, Download, RefreshCw)
- **Charts** : Recharts pour distribution temps connexion

## Tâches Courantes

### Ajouter un Filtre
1. État dans Dashboard : `const [filters, setFilters] = useState({...})`
2. Intégrer dans `filteredData` useMemo
3. Ajouter UI + handler

### Ajouter une Métrique
- Éditer `stats` useMemo
- Dériver de `filteredData` ou `connectionGroups`

### Exporter les Données
- `excelService.exportToExcel(data, filename)`

## Dependencies
- **react** ^18.2.0
- **recharts** ^2.10.0 - Graphiques
- **lucide-react** ^0.380.0 - Icônes
- **xlsx** ^0.18.5 - Lecture Excel
- **date-fns** ^2.30.0 - Dates

## Gotchas
- Colonnes Excel **case-sensitive** (Vol Inbound ≠ vol inbound)
- Dates format strict : DD/MM/YYYY HH:MM:SS
- PTM parsing : `parseInt(item['PTM']) || 0`
- Connexions < 30min = **À risque** (visual alert)
