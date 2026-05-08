import React from 'react'
import './StatCard.css'

const StatCard = ({ icon, title, value, color, subtitle, onClick }) => (
  <div
    className={`stat-card stat-${color} ${onClick ? 'stat-card--clickable' : ''}`}
    onClick={onClick}
    role={onClick ? 'button' : undefined}
    tabIndex={onClick ? 0 : undefined}
    onKeyDown={onClick ? (e) => e.key === 'Enter' && onClick() : undefined}
  >
    <div className="sc-icon">{icon}</div>
    <div className="sc-body">
      <div className="sc-value">{value}</div>
      <div className="sc-title">{title}</div>
      {subtitle && <div className="sc-sub">{subtitle}</div>}
    </div>
    {onClick && <div className="sc-chevron">›</div>}
  </div>
)

export default StatCard
