// WMS (3PL Central / Extensiv) OAuth2 token management
// Each warehouse+supplier has its own Base64-encoded authorization key and user_login
// Token endpoint: https://secure-wms.com/AuthServer/api/Token

const TOKEN_URL = 'https://secure-wms.com/AuthServer/api/Token'

interface TokenCache {
  accessToken: string
  expiresAt: number
}

// In-memory token cache per warehouse+supplier
const tokenCache: Record<string, TokenCache> = {}

// Explicit credential mapping: "warehouse|supplier" -> env var names
const CREDENTIAL_MAP: Record<string, { base64EnvKey: string; loginEnvKey: string }> = {
  'Moses Lake|HX': {
    base64EnvKey: 'WMS_BASE64_KEY_MOSES_LAKE',
    loginEnvKey: 'WMS_USER_LOGIN_MOSES_LAKE',
  },
  'Kent|HX': {
    base64EnvKey: 'WMS_BASE64_KEY_KENT_HX',
    loginEnvKey: 'WMS_USER_LOGIN_KENT_HX',
  },
  'Kent|AMC': {
    base64EnvKey: 'WMS_BASE64_KEY_KENT_AMC',
    loginEnvKey: 'WMS_USER_LOGIN_KENT_AMC',
  },
}

// Get a valid access token for the given warehouse+supplier, refreshing if needed
export async function getWmsToken(warehouse: string, supplierCode: string): Promise<string> {
  const cacheKey = `${warehouse}|${supplierCode}`

  // Check cached token (with 60s buffer)
  const cached = tokenCache[cacheKey]
  if (cached && Date.now() < cached.expiresAt - 60000) {
    return cached.accessToken
  }

  // Look up credential env var names
  const config = CREDENTIAL_MAP[cacheKey]
  if (!config) {
    throw new Error(`No WMS credentials mapped for warehouse="${warehouse}", supplier="${supplierCode}" (key="${cacheKey}"). Available keys: ${Object.keys(CREDENTIAL_MAP).join(', ')}`)
  }

  const base64Key = process.env[config.base64EnvKey]
  const userLogin = process.env[config.loginEnvKey]

  console.log(`[v0] WMS auth lookup: key="${cacheKey}", envKey="${config.base64EnvKey}", base64Exists=${!!base64Key}, base64Len=${base64Key?.length || 0}, loginKey="${config.loginEnvKey}", loginExists=${!!userLogin}`)

  if (!base64Key) {
    throw new Error(`Missing env var ${config.base64EnvKey} for "${cacheKey}"`)
  }
  if (!userLogin) {
    throw new Error(`Missing env var ${config.loginEnvKey} for "${cacheKey}"`)
  }

  // Request fresh OAuth2 token
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${base64Key}`,
      'Content-Type': 'application/json; charset=utf-8',
      'Accept': 'application/hal+json',
      'Host': 'secure-wms.com',
      'Connection': 'keep-alive',
      'Accept-Encoding': 'gzip, deflate, sdch',
      'Accept-Language': 'en-US,en;q=0.8',
    },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      user_login: userLogin,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.log(`[v0] WMS token FAILED for "${cacheKey}": status=${response.status}, body=${errorText.slice(0, 300)}`)
    throw new Error(`WMS OAuth token failed for "${cacheKey}" (${response.status}): ${errorText.slice(0, 200)}`)
  }

  const data = await response.json()

  if (!data.access_token) {
    console.log(`[v0] WMS token response missing access_token for "${cacheKey}":`, JSON.stringify(data).slice(0, 300))
    throw new Error(`WMS OAuth response missing access_token for "${cacheKey}"`)
  }

  console.log(`[v0] WMS token OK for "${cacheKey}": expires_in=${data.expires_in}, token_len=${data.access_token.length}`)

  const expiresIn = (data.expires_in && data.expires_in > 0) ? data.expires_in : 1500

  // Cache it
  tokenCache[cacheKey] = {
    accessToken: data.access_token,
    expiresAt: Date.now() + expiresIn * 1000,
  }

  return data.access_token
}
