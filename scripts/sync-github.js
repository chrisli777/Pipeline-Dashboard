const OWNER = 'chrisli777'
const REPO = 'Pipeline-Dashboard'
const BRANCH = 'main'

async function listTree() {
  const res = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/git/trees/${BRANCH}?recursive=1`)
  const data = await res.json()
  const files = data.tree
    .filter(f => f.type === 'blob')
    .map(f => ({ path: f.path, sha: f.sha.substring(0, 8) }))
    .sort((a, b) => a.path.localeCompare(b.path))
  
  for (const f of files) {
    console.log(`${f.sha}  ${f.path}`)
  }
  console.log(`\nTotal: ${files.length} files`)
}
listTree()
