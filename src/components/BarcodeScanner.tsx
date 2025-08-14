import React, { useEffect, useRef, useState } from 'react'
import { BrowserMultiFormatReader, IScannerControls } from '@zxing/browser'

export default function BarcodeScanner({
  onDetected,
  onClose
}: {
  onDetected: (barcode: string) => void
  onClose: () => void
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [error, setError] = useState<string | null>(null)
  const controlsRef = useRef<IScannerControls | null>(null)

  useEffect(() => {
    let cancelled = false
    const start = async () => {
      try {
        const reader = new BrowserMultiFormatReader()
        const controls = await reader.decodeFromVideoDevice(
          undefined,
          videoRef.current!,
          (result, err) => {
            if (cancelled) return
            if (result) {
              const text = result.getText().trim()
              if (/^\d{8,14}$/.test(text)) {
                onDetected(text)
                onClose()
              }
            }
          }
        )
        controlsRef.current = controls
      } catch (e: any) {
        setError(e?.message ?? 'Camera error')
      }
    }
    start()
    return () => {
      cancelled = true
      controlsRef.current?.stop()
    }
  }, [onDetected, onClose])

  return (
    <div className="card" style={{ padding: 0 }}>
      <div style={{ position: 'relative' }}>
        <video ref={videoRef} style={{ width: '100%', borderRadius: 12 }} playsInline />
        <div style={{ position: 'absolute', top: 8, right: 8 }}>
          <button className="ghost" onClick={onClose}>Close</button>
        </div>
      </div>
      {error && <div className="small" style={{ padding: 8, color: '#fca5a5' }}>{error}</div>}
      <div className="small" style={{ padding: 8 }}>
        Tip: Hold the barcode 10–20 cm away. EAN‑13 is supported.
      </div>
    </div>
  )
}
