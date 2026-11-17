// Layer registry: each entry fully describes one map layer. The sidebar
// renders controls (visibility, opacity, ordering, and — for choropleths —
// a granularity toggle) automatically from this list. Add a new layer by
// adding a new LayerConfig; no UI changes needed as long as it fits one of
// the existing sourceTypes.

export type LayerSourceType = 'wms' | 'geojson-choropleth'

interface BaseLayerConfig {
  id: string
  label: string
  description?: string
  attribution?: string
  defaultVisible: boolean
  /** 0–1 */
  defaultOpacity: number
}

export interface WmsLayerConfig extends BaseLayerConfig {
  sourceType: 'wms'
  /** Base WMS endpoint (no query string). */
  wmsUrl: string
  /** Value for the WMS LAYERS parameter. */
  wmsLayers: string
  tileSize?: number
}

/** One granularity variant of a choropleth (e.g. "county" vs "municipality"). */
export interface ChoroplethGranularity {
  id: string
  label: string
  /** Path served by the dev/prod server, e.g. "/data/kommuner.geojson". */
  dataUrl: string
  /** GeoJSON feature property holding the official region number — the join key. */
  regionKeyProperty: string
  /** GeoJSON feature property holding the region's display name. */
  nameProperty: string
}

export interface ChoroplethLayerConfig extends BaseLayerConfig {
  sourceType: 'geojson-choropleth'
  granularities: ChoroplethGranularity[]
  defaultGranularityId: string
  /** Neutral fill color for now — no data joined yet. */
  fillColor: string
}

export type LayerConfig = WmsLayerConfig | ChoroplethLayerConfig

// WMS endpoints verified against live GetCapabilities documents on 2026-07-27:
// - https://wms.geonorge.no/skwms1/wms.matrikkel?service=wms&request=getcapabilities
// - https://wms.geonorge.no/skwms1/wms.adm_enheter2?service=wms&request=getcapabilities
// Both are open data (CC BY 4.0), no API key required.
//
// TODO: the "eiendomsgrense" layer's own <CRS> list only declares EPSG:25833,
// and "kommuner"/"kommuner_gjel" only declare EPSG:4258/25832-25833, while
// EPSG:3857 is declared at the parent/root service level. Per the WMS 1.3.0
// spec child layers inherit the parent's CRS list, so requesting EPSG:3857
// (needed for MapLibre raster tiles) should be valid — but if tiles come
// back as service exceptions, switch to requesting native CRS via a
// TileJSON/reprojecting proxy. Docs:
// https://register.geonorge.no/det-offentlige-kartgrunnlaget/administrative-enheter-kommuner/041f1e6e-bdbc-4091-b48f-8a5990f3cc5b
// https://kartkatalog.geonorge.no/metadata/matrikkelen-enkel-wms/0fa5fa99-27ce-49fc-adb1-551b93b7b4d4
//
// GeoJSON choropleth boundaries (public/data/*.geojson) were downloaded from
// Geonorge's nedlasting (download) API, confirmed live on 2026-07-27:
// - Kommuner: https://nedlasting.geonorge.no/geonorge/Basisdata/Kommuner/GeoJSON/Basisdata_0000_Norge_4258_Kommuner_GeoJSON.zip
// - Fylker:   https://nedlasting.geonorge.no/geonorge/Basisdata/Fylker/GeoJSON/Basisdata_0000_Norge_4258_Fylker_GeoJSON.zip
// (URLs taken from the ATOM feeds linked off the dataset metadata pages —
// see https://kartkatalog.geonorge.no/metadata/administrative-enheter-kommuner/041f1e6e-bdbc-4091-b48f-8a5990f3cc5b
// and https://kartkatalog.geonorge.no/metadata/administrative-enheter-fylker/... —
// nedlasting.geonorge.no/help/documentation documents the download API itself.)
// Source CRS is EPSG:4258 (ETRS89), treated as WGS84/EPSG:4326 for web
// display — the two datums differ by centimeters, immaterial at web zoom
// levels. Files were stripped to only the join-key + name properties and
// simplified with mapshaper (visvalingam, 8% for fylker / 4% for kommuner)
// to shrink them for web use: fylker.geojson 6.0MB → 235KB, kommuner.geojson
// 33.7MB → 767KB, both down from the full-resolution cadastral source.
//
// Bydel/grunnkrets granularities are intentionally NOT nationwide — SSB's
// national table doesn't go finer than kommune (see src/data/ssb vs.
// src/data/cityStats), so there is no national bydel/grunnkrets price
// dataset to join against. Their boundaries here cover Oslo only, sourced
// from Oslo kommune's own public ArcGIS Feature Services (Plan- og
// bygningsetaten), confirmed live on 2026-07-27:
// - Bydeler: https://services-eu1.arcgis.com/Hky23fkHucfDZYMu/arcgis/rest/services/Oslo_bydeler/FeatureServer
//   (field BYDELNR, "01".."17" — renamed here to `bydelnummer`, unpadded to
//   match Oslo's own statistics-bank codes, see data/cityStats/osloAdapter.ts)
// - Grunnkretsområder: https://services-eu1.arcgis.com/Hky23fkHucfDZYMu/arcgis/rest/services/Boliger_pr_grunnkrets/FeatureServer
//   (591 individual grunnkrets features, dissolved by field `GrnkrtsOm` down
//   to 337 grunnkretsområder — the level Oslo's own price table actually
//   reports at — renamed here to `grunnkretsomradeid`; verified to match
//   336/336 of the price table's grunnkretsområde-level region codes)
// Adding another city means adding its own boundary file(s) here and its own
// CityAdapter under src/data/cityStats — this layer's granularity list is
// additive, not a rewrite.
export const LAYER_REGISTRY: LayerConfig[] = [
  {
    id: 'matrikkel-teig',
    label: 'Eiendomsgrenser (teig)',
    description:
      'Property/parcel boundaries from Kartverket’s Matrikkel (cadastre), layer "eiendomsgrense".',
    sourceType: 'wms',
    wmsUrl: 'https://wms.geonorge.no/skwms1/wms.matrikkel',
    wmsLayers: 'eiendomsgrense',
    attribution: 'Kartverket – Matrikkelen (CC BY 4.0)',
    defaultVisible: true,
    defaultOpacity: 0.9,
    tileSize: 256,
  },
  {
    id: 'adm-kommuner',
    label: 'Kommunegrenser',
    description:
      'Administrative municipality boundaries from Kartverket, layer "kommuner".',
    sourceType: 'wms',
    wmsUrl: 'https://wms.geonorge.no/skwms1/wms.adm_enheter2',
    wmsLayers: 'kommuner',
    attribution: 'Kartverket – Administrative enheter (CC BY 4.0)',
    defaultVisible: false,
    defaultOpacity: 0.7,
    tileSize: 256,
  },
  {
    id: 'admin-boundaries',
    label: 'Administrative grenser (choropleth)',
    description:
      'County/municipality polygons for choropleth use. Neutral fill for now — no data joined yet.',
    sourceType: 'geojson-choropleth',
    granularities: [
      {
        id: 'fylke',
        label: 'County',
        dataUrl: '/data/fylker.geojson',
        regionKeyProperty: 'fylkesnummer',
        nameProperty: 'fylkesnavn',
      },
      {
        id: 'kommune',
        label: 'Municipality',
        dataUrl: '/data/kommuner.geojson',
        regionKeyProperty: 'kommunenummer',
        nameProperty: 'kommunenavn',
      },
      {
        id: 'bydel',
        label: 'Bydel',
        dataUrl: '/data/oslo-bydeler.geojson',
        regionKeyProperty: 'bydelnummer',
        nameProperty: 'bydelnavn',
      },
      {
        id: 'grunnkrets',
        label: 'Grunnkrets',
        dataUrl: '/data/oslo-grunnkretsomrade.geojson',
        regionKeyProperty: 'grunnkretsomradeid',
        nameProperty: 'grunnkretsomradenavn',
      },
    ],
    defaultGranularityId: 'kommune',
    fillColor: '#8a8a8a',
    attribution: 'Kartverket – Administrative enheter (CC BY 4.0)',
    defaultVisible: true,
    defaultOpacity: 0.4,
  },
]

export function buildWmsTileUrl(config: WmsLayerConfig): string {
  const params = new URLSearchParams({
    SERVICE: 'WMS',
    VERSION: '1.3.0',
    REQUEST: 'GetMap',
    FORMAT: 'image/png',
    TRANSPARENT: 'true',
    LAYERS: config.wmsLayers,
    STYLES: '',
    CRS: 'EPSG:3857',
    WIDTH: '256',
    HEIGHT: '256',
  })
  return `${config.wmsUrl}?${params.toString()}&BBOX={bbox-epsg-3857}`
}
