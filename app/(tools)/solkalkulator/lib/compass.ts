export function bearingLabel(bearing: number): string {
  // Norwegian compass abbreviations: Ø (øst) for east, V (vest) for west.
  const dirs = ['N', 'NNØ', 'NØ', 'ØNØ', 'Ø', 'ØSØ', 'SØ', 'SSØ', 'S', 'SSV', 'SV', 'VSV', 'V', 'VNV', 'NV', 'NNV']
  return dirs[Math.round(bearing / 22.5) % 16]
}
