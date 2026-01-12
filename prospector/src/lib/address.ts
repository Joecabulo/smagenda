import type { PlacesDetails } from './api'

function findComponent(components: PlacesDetails['address_components'] | undefined, type: string) {
  const arr = Array.isArray(components) ? components : []
  for (const c of arr) {
    const t = Array.isArray(c.types) ? c.types : []
    if (t.includes(type)) return c
  }
  return null
}

export function extractAddressParts(details: PlacesDetails) {
  const street = findComponent(details.address_components, 'route')
  const number = findComponent(details.address_components, 'street_number')
  const city = findComponent(details.address_components, 'administrative_area_level_2') ?? findComponent(details.address_components, 'locality')
  const state = findComponent(details.address_components, 'administrative_area_level_1')
  const postalCode = findComponent(details.address_components, 'postal_code')

  return {
    street: (street?.long_name ?? '').trim() || null,
    number: (number?.long_name ?? '').trim() || null,
    city: (city?.long_name ?? '').trim() || null,
    state: (state?.short_name ?? state?.long_name ?? '').trim() || null,
    postalCode: (postalCode?.long_name ?? '').trim() || null,
  }
}
