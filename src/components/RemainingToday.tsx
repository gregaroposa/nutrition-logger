import React from 'react'
import type { Targets, Totals } from '../types'

function fmt(n: number) {
  return Number.isFinite(n) ? Math.round(n) : 0
}
function diffLabel(left: number, unit = '') {
  if (left >= 0) return `${fmt(left)}${unit} left`
  return `over by ${fmt(Math.abs(left))}${unit}`
}

export default function RemainingToday({
  targets,
  totals,
  onEdit
}: {
  targets: Targets
  totals: Totals | null
  onEdit: () => void
}) {
  const t = totals ?? { date_local: '', kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 }
  const left = {
    kcal: (targets.kcal ?? 0) - (t.kcal ?? 0),
    protein_g: (targets.protein_g ?? 0) - (t.protein_g ?? 0),
    carbs_g: (targets.carbs_g ?? 0) - (t.carbs_g ?? 0),
    fat_g: (targets.fat_g ?? 0) - (t.fat_g ?? 0),
    fiber_g: (targets.fiber_g ?? 0) - (t.fiber_g ?? 0)
  }

  const badge = (label: string, value: string) => (
    <div className="badge" style={{ display: 'inline-block', minWidth: 100 }}>
      <strong>{label}:</strong> {value}
    </div>
  )

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0 }}>Remaining today</h2>
        <button className="ghost" onClick={onEdit}>Edit targets</button>
      </div>
      <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {badge('kcal', diffLabel(left.kcal))}
        {badge('Protein', diffLabel(left.protein_g, 'g'))}
        {badge('Carbs', diffLabel(left.carbs_g, 'g'))}
        {badge('Fat', diffLabel(left.fat_g, 'g'))}
        {badge('Fiber', diffLabel(left.fiber_g, 'g'))}
      </div>
      <div className="small" style={{ marginTop: 8, opacity: 0.8 }}>
        Targets — kcal: {targets.kcal}, P: {targets.protein_g}g, C: {targets.carbs_g}g, F: {targets.fat_g}g, Fiber: {targets.fiber_g}g
      </div>
    </div>
  )
}
