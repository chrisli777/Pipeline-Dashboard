const REPO = 'chrisli777/Pipeline-Dashboard'
const BRANCH = 'main'

async function main() {
  const url = `https://api.github.com/repos/${REPO}/contents/scripts?ref=${BRANCH}`
  const res = await fetch(url, { headers: { Accept: 'application/vnd.github.v3+json' } })
  if (!res.ok) { console.log('Failed:', res.status); return }
  const files = await res.json()
  files.forEach(f => console.log(f.name))
}
main()
