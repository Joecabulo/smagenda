export type EstablishmentStatus =
  | 'novo'
  | 'visitado'
  | 'confirmado'
  | 'aprovado'
  | 'recusou'
  | 'sem_resposta'

export type Establishment = {
  id: string
  placeId: string
  name: string
  formattedAddress: string
  street: string | null
  number: string | null
  city: string | null
  state: string | null
  postalCode: string | null
  lat: number | null
  lng: number | null
  types: string[]
  segments?: string[]
  googleMapsUrl: string | null
  phone: string | null
  website: string | null
  fetchedAt: string
  status: EstablishmentStatus
  contactName: string | null
  contactPhone: string | null
  notes: string | null
  lastVisitAt: string | null
  updatedAt: string
  createdAt: string
}

export type ImportPreset = {
  key: string
  label: string
  queries: string[]
}
