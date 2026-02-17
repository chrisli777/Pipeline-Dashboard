import { readFileSync, writeFileSync } from 'fs'

const raw = readFileSync('/vercel/share/v0-project/scripts/raw-014-015-output.txt', 'utf8')

// Extract content between FILE/END markers
const files = [
  { name: '014_sku_classification_and_master_data.sql', start: '=== FILE: scripts/014_sku_classification_and_master_data.sql ===', end: '=== END: scripts/014_sku_classification_and_master_data.sql ===' },
  { name: '015_phase3b_safety_stock_and_projection.sql', start: '=== FILE: scripts/015_phase3b_safety_stock_and_projection.sql ===', end: '=== END: scripts/015_phase3b_safety_stock_and_projection.sql ===' },
]

for (const f of files) {
  const startIdx = raw.indexOf(f.start)
  const endIdx = raw.indexOf(f.end)
  if (startIdx === -1 || endIdx === -1) { console.log(`SKIP ${f.name}`); continue }
  const content = raw.substring(startIdx + f.start.length, endIdx).trim()
  writeFileSync(`/vercel/share/v0-project/scripts/${f.name}`, content + '\n')
  console.log(`Wrote ${f.name} (${content.length} chars)`)
}
