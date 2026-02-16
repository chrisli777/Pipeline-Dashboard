// Fetch a single file from GitHub and print its content
const REPO = 'chrisli777/Pipeline-Dashboard';
const BRANCH = 'main';
const filePath = process.argv[2] || process.env.GITHUB_FILE;

if (!filePath) {
  console.log('Usage: provide file path as argument');
  process.exit(1);
}

async function main() {
  const url = `https://api.github.com/repos/${REPO}/contents/${filePath}?ref=${BRANCH}`;
  const res = await fetch(url);
  if (!res.ok) {
    console.log(`ERROR: ${res.status} for ${filePath}`);
    process.exit(1);
  }
  const json = await res.json();
  const content = Buffer.from(json.content, 'base64').toString('utf8');
  console.log(content);
}

main().catch(e => console.error(e));
