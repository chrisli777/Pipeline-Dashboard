import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { dirname, resolve } from 'path'

const PROJECT_ROOT = '/vercel/share/v0-project'
const RAW_FILE = resolve(PROJECT_ROOT, 'scripts/_raw_github_batch1.txt')

const raw = readFileSync(RAW_FILE, 'utf-8')
const regex = /===FILE:(.+?)===\n([\s\S]*?)\n===END:\1===/g

let match
let count = 0
while ((match = regex.exec(raw)) !== null) {
  const filePath = match[1]
  const content = match[2]
  const fullPath = resolve(PROJECT_ROOT, filePath)
  mkdirSync(dirname(fullPath), { recursive: true })
  writeFileSync(fullPath, content, 'utf-8')
  console.log(`Wrote: ${filePath} (${content.length} bytes)`)
  count++
}
console.log(`\nDone: ${count} files written`)
