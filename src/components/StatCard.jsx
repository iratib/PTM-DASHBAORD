import React from 'react'
import './StatCard.css'

const StatCard = ({ icon, title, value, color, subtitle }) => (
  <div className={`stat-card stat-${color}`}>
    <div className="sc-icon">{icon}</div>
    <div className="sc-body">
      <div className="sc-value">{value}</div>
      <div className="sc-title">{title}</div>
      {subtitle && <div className="sc-sub">{subtitle}</div>}
    </div>
  </div>
)

export default StatCard
