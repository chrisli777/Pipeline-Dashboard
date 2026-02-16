const REPO = 'chrisli777/Pipeline-Dashboard'
const BRANCH = 'main'

const FILES = [
  'components/risk-analysis-tab.tsx',
]

async function main() {
  for (const path of FILES) {
    try {
      const url = `https://api.github.com/repos/${REPO}/contents/${path}?ref=${BRANCH}`
      const res = await fetch(url, { headers: { Accept: 'application/vnd.github.v3+json' } })
      if (!res.ok) { console.log(`===SKIP:${path} (${res.status})===`); continue }
      const json = await res.json()
      const content = Buffer.from(json.content, 'base64').toString('utf-8')
      console.log(`===FILE:${path}===`)
      console.log(content)
      console.log(`===END:${path}===`)
    } catch (e) { console.log(`===SKIP:${path}===`) }
  }
}
main()
