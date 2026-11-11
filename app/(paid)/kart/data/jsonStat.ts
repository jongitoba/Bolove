// Minimal JSON-stat2 reader — just enough to index a dataset by dimension
// codes. Not a general-purpose JSON-stat library; PxWeb-family APIs (SSB's
// and Oslo kommune's statistikkbank both use the same PxWeb software) are
// the only shape this needs to handle. Shared by every adapter under
// data/ssb and data/cityStats.

export interface JsonStat2Dataset {
  id: string[]
  size: number[]
  dimension: Record<string, { category: { index: Record<string, number> | string[] } }>
  value: Array<number | null>
}

export interface JsonStatIndexer {
  /** Dimension's value codes, in the order matching `size`/`value`. */
  dimensionCodes(dim: string): string[]
  /** Look up one cell by giving a code for every dimension in `id`. */
  get(selection: Record<string, string>): number | null
}

export function createJsonStatIndexer(dataset: JsonStat2Dataset): JsonStatIndexer {
  const { id, size } = dataset

  // JSON-stat2 values are flattened row-major with the LAST id dimension
  // varying fastest — strides reflect that.
  const strides = new Array<number>(id.length)
  strides[id.length - 1] = 1
  for (let i = id.length - 2; i >= 0; i--) {
    strides[i] = strides[i + 1] * size[i + 1]
  }

  const categoryIndex: Record<string, Record<string, number>> = {}
  for (const dim of id) {
    const cat = dataset.dimension[dim].category.index
    categoryIndex[dim] = Array.isArray(cat)
      ? Object.fromEntries(cat.map((code, i) => [code, i]))
      : cat
  }

  return {
    dimensionCodes(dim: string) {
      return Object.entries(categoryIndex[dim])
        .sort((a, b) => a[1] - b[1])
        .map(([code]) => code)
    },
    get(selection: Record<string, string>) {
      let flatIndex = 0
      for (let i = 0; i < id.length; i++) {
        const dim = id[i]
        const pos = categoryIndex[dim][selection[dim]]
        if (pos === undefined) return null
        flatIndex += pos * strides[i]
      }
      const value = dataset.value[flatIndex]
      return value === null || value === undefined ? null : value
    },
  }
}
