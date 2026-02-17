const OWNER = 'chrisli777', REPO = 'Pipeline-Dashboard', BRANCH = 'main'
const files = [
  'scripts/014_sku_classification_and_master_data.sql',
  'scripts/015_phase3b_safety_stock_and_projection.sql',
]
async function main() {
  for (const f of files) {
    const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${f}?ref=${BRANCH}`
    const res = await fetch(url, { headers: { Accept: 'application/vnd.github.v3.raw' } })
    if (!res.ok) { console.log(`=== SKIP ${f} (${res.status}) ===`); continue }
    const text = await res.text()
    console.log(`=== FILE: ${f} ===`)
    console.log(text)
    console.log(`=== END: ${f} ===`)
  }
}
main()
