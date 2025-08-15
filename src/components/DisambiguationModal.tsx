import React from 'react'
import type { Candidate } from '../lib/resolver'

export default function DisambiguationModal({
  userPhrase,
  choices,
  onPick,
  onCancel
}: {
  userPhrase: string
  choices: Candidate[]
  onPick: (c: Candidate) => void
  onCancel: () => void
}) {
  return (
    <div className="card" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)' }}>
      <div className="card" style={{ maxWidth: 520, margin: '10% auto', background: '#131923' }}>
        <h3 style={{ marginTop: 0 }}>Which did you mean?</h3>
        <div className="small" style={{ marginBottom: 8 }}>“{userPhrase}”</div>
        {choices.map((c) => (
          <div key={c.product.id} className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
            <div>
              <div>{c.label}</div>
              <div className="small">Source: {c.product.source} · conf {Math.round(c.confidence * 100)}%</div>
            </div>
            <button onClick={() => onPick(c)}>Choose</button>
          </div>
        ))}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button className="ghost" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  )
}
