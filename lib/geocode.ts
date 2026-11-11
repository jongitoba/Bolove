// Shared shape for an already-geocoded address, passed between the
// homepage's "Sett" address field and the tools that can be pre-filled with
// it (Solkalkulator, Reisetid's home address) - see app/(home)/toolTabs.tsx.
export interface GeocodedAddress {
  label: string;
  lat: number;
  lon: number;
}
