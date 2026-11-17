import type { AddressResult } from './types'

export async function searchAddresses(query: string): Promise<AddressResult[]> {
  const res = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`)
  if (!res.ok) throw new Error('Adressesøket feilet')
  const data = await res.json() as Array<{ lat: string; lon: string; label: string }>
  return data.map(d => ({ lat: parseFloat(d.lat), lng: parseFloat(d.lon), label: d.label }))
}
