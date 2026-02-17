// Fetch key files from GitHub to check for updates
const OWNER = 'chrisli777'
const REPO = 'Pipeline-Dashboard'
const BRANCH = 'main'

const filesToCheck = [
  'lib/types.ts',
  'app/api/replenishment/projection/route.ts',
  'app/api/replenishment/classification/route.ts',
  'app/api/replenishment/classification/policies/route.ts',
  'app/api/sync/customer-forecast/route.ts',
  'package.json',
]

async function fetchFile(path) {
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}?ref=${BRANCH}`
  const res = await fetch(url, { headers: { 'Accept': 'application/vnd.github.v3.raw' } })
  if (!res.ok) return null
  return await res.text()
}

async function main() {
  for (const path of filesToCheck) {
    const content = await fetchFile(path)
    if (content === null) {
      console.log(`SKIP: ${path} (not found)`)
      continue
    }
    console.log(`===FILE:${path}===`)
    console.log(content)
    console.log(`===END:${path}===`)
    console.log()
  }
}

main().catch(console.error)
