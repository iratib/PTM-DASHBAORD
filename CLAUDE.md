# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install        # Install dependencies
npm run dev        # Start dev server at http://localhost:5173
npm run build      # Production build → dist/
npm run preview    # Preview production build
```

No lint or test commands are configured.

## Architecture

**PTM Connexion Dashboard** — a client-side React/Vite app for airport transit passengers (PTM). Users import Excel files, and the app visualizes flight connection times and at-risk passenger counts. All data is stored in `localStorage`; there is no backend.

### Data Flow

```
Excel file → excelService.readExcelFile()
           → App.jsx handleDataLoaded() → localStorage
           → Dashboard.jsx (useMemo enrichment + filtering)
           → Charts (recharts) + Tables
```

### Key Files

| File | Role |
|------|------|
| [src/App.jsx](src/App.jsx) | Root component; centralized state (`data`, `lastUpdate`, `isLoading`); switches between FileUpload and Dashboard views |
| [src/components/Dashboard.jsx](src/components/Dashboard.jsx) | All data processing via `useMemo` (enrichment, grouping, filtering, stats); three tab views: Overview, Details, Outbound |
| [src/components/FileUpload.jsx](src/components/FileUpload.jsx) | Drag-drop Excel upload; calls `excelService.readExcelFile()` |
| [src/services/excelService.js](src/services/excelService.js) | `readExcelFile`, `exportToExcel`, `saveToLocalStorage`, `getFromLocalStorage` |
| [src/demoData.js](src/demoData.js) | Hardcoded demo data; auto-loaded in dev mode when localStorage is empty |
| [src/services/googleSheetsService.js](src/services/googleSheetsService.js) | Google Sheets integration — exists but not wired into the app |

### Data Schema

Required Excel columns (exact case):

| Column | Type | Notes |
|--------|------|-------|
| `Vol Inbound` | string | Inbound flight number |
| `STA Inbound` | string | `DD/MM/YYYY HH:MM:SS` |
| `Vol Outbound` | string | Outbound flight number |
| `STD Outbound` | string | `DD/MM/YYYY HH:MM:SS` |
| `PTM` | number | Passengers in transit |

Calculated fields added in Dashboard: `connectionTime` (ms → minutes) and `isAtRisk` (< 30 min).

localStorage keys: `ptm_data` (JSON array) and `last_update` (ISO string).

### UI / Styling

- Dark theme with glassmorphism; all CSS variables defined in [src/index.css](src/index.css)
- UI language is French
- Icons: `lucide-react`; charts: `recharts`
- Details tab is limited to the first 100 rows
