import XLSX from 'xlsx';

const data = [
  ['Vol Inbound', 'STA Inbound', 'Vol Outbound', 'STD Outbound', 'PTM'],
  ['AF123', '06/05/2026 20:20:00', 'AF456', '06/05/2026 22:05:00', 45],
  ['LH789', '06/05/2026 20:30:00', 'AF456', '06/05/2026 22:05:00', 32],
  ['BA234', '06/05/2026 19:45:00', 'AF456', '06/05/2026 22:05:00', 28],
  ['KL567', '06/05/2026 21:00:00', 'AF456', '06/05/2026 22:05:00', 15],
  ['EK890', '06/05/2026 20:50:00', 'DL789', '06/05/2026 23:30:00', 38],
  ['SU234', '06/05/2026 21:30:00', 'DL789', '06/05/2026 23:30:00', 52],
  ['QF567', '06/05/2026 18:45:00', 'AF456', '06/05/2026 22:05:00', 12],
  ['OS890', '06/05/2026 22:00:00', 'AF456', '06/05/2026 22:05:00', 8],
];

const ws = XLSX.utils.aoa_to_sheet(data);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
XLSX.writeFile(wb, 'test_data.xlsx');

console.log('✓ test_data.xlsx created successfully!');
