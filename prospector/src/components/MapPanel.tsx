import React, { useEffect, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import type { Establishment } from '../types'
import L from 'leaflet'

// Fix for default marker icons in Leaflet with Vite/React
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'

// @ts-ignore
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
})

// Custom colored markers function (using simple divs)
const createColorIcon = (color: string) => {
  return new L.DivIcon({
    className: 'custom-marker',
    html: `<div style="background-color: ${color}; width: 14px; height: 14px; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  })
}

// User location icon
const userIcon = new L.DivIcon({
  className: 'user-marker',
  html: `<div style="background-color: #3b82f6; width: 16px; height: 16px; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.3);"></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
})

type Props = {
  establishments: Establishment[]
  selectedPlaceId: string | null
  onSelectPlace: (placeId: string) => void
  onCloseMap: () => void
}

function statusColor(s: string) {
  if (s === 'novo') return '#64748b' // gray-500
  if (s === 'visitado') return '#3b82f6' // blue-500
  if (s === 'confirmado') return '#8b5cf6' // violet-500
  if (s === 'aprovado') return '#22c55e' // green-500
  if (s === 'recusou') return '#ef4444' // red-500
  return '#f97316' // orange-500
}

function MapUpdater({ center }: { center: [number, number] | null }) {
  const map = useMap()
  useEffect(() => {
    if (center) {
      map.setView(center, map.getZoom())
    }
  }, [center, map])
  return null
}

export function MapPanel({ establishments, selectedPlaceId, onSelectPlace, onCloseMap }: Props) {
  const [userLoc, setUserLoc] = useState<[number, number] | null>(null)
  const [center, setCenter] = useState<[number, number]>([-19.9167, -43.9345]) // Default BH/MG

  useEffect(() => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords
          setUserLoc([latitude, longitude])
          // Only center on user if no place is selected
          if (!selectedPlaceId) {
            setCenter([latitude, longitude])
          }
        },
        (err) => {
          console.error('Erro ao obter localização', err)
        },
        { enableHighAccuracy: true }
      )
    }
  }, [])

  // If a place is selected, center on it
  useEffect(() => {
    if (selectedPlaceId) {
      const est = establishments.find((e) => e.placeId === selectedPlaceId)
      if (est && est.lat && est.lng) {
        setCenter([est.lat, est.lng])
      }
    }
  }, [selectedPlaceId, establishments])

  const validEstablishments = establishments.filter((e) => e.lat && e.lng)

  return (
    <div style={{ height: 'calc(100vh - 140px)', width: '100%', borderRadius: '14px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)', position: 'relative' }}>
      <button 
        onClick={onCloseMap}
        style={{
          position: 'absolute',
          top: 10,
          right: 10,
          zIndex: 1000,
          background: '#0f1b31',
          color: 'white',
          border: '1px solid rgba(255,255,255,0.1)',
          padding: '8px 12px',
          borderRadius: '8px',
          cursor: 'pointer',
          fontWeight: 600
        }}
      >
        Fechar Mapa
      </button>

      <MapContainer center={center} zoom={13} style={{ height: '100%', width: '100%' }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        
        <MapUpdater center={center} />

        {userLoc && (
          <Marker position={userLoc} icon={userIcon}>
            <Popup>Você está aqui</Popup>
          </Marker>
        )}

        {validEstablishments.map((e) => (
          <Marker
            key={e.placeId}
            position={[e.lat!, e.lng!]}
            icon={createColorIcon(statusColor(e.status))}
            eventHandlers={{
              click: () => onSelectPlace(e.placeId),
            }}
          >
            <Popup>
              <strong>{e.name}</strong><br />
              {e.formattedAddress}<br />
              <div style={{ marginTop: 5, fontSize: '0.85em', textTransform: 'capitalize' }}>
                Status: {e.status}
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  )
}
