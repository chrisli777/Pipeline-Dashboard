// WMS (3PL Central / Extensiv) OAuth2 token management
// Each warehouse has its own Base64-encoded authorization key and user_login
// Token endpoint: https://secure-wms.com/AuthServer/api/Token

interface WmsAuthConfig {
  base64Key: string   // Base64-encoded "ClientID:ClientSecret"
  userLogin: string   // e.g. "chris.li@whcast.com"
}

interface TokenCache {
  accessToken: string
  expiresAt: number // timestamp in ms
}

// In-memory token cache per warehouse key
const tokenCache: Record<string, TokenCache> = {}

// Get auth config for a warehouse/supplier combination
function getAuthConfig(warehouse: string, supplierCode: string): WmsAuthConfig | null {
  if (warehouse === 'Moses Lake') {
    const base64Key = process.env.WMS_BASE64_KEY_MOSES_LAKE
    const userLogin = process.env.WMS_USER_LOGIN_MOSES_LAKE
    if (base64Key && userLogin) {
      return { base64Key, userLogin }
    }
  } else if (supplierCode === 'HX') {
    // Kent HX
    const base64Key = process.env.WMS_BASE64_KEY_KENT_HX
    const userLogin = process.env.WMS_USER_LOGIN_KENT_HX
    if (base64Key && userLogin) {
      return { base64Key, userLogin }
    }
  } else {
    // Kent AMC
    const base64Key = process.env.WMS_BASE64_KEY_KENT_AMC
    const userLogin = process.env.WMS_USER_LOGIN_KENT_AMC
    if (base64Key && userLogin) {
      return { base64Key, userLogin }
    }
  }
  return null
}

// Request a fresh access token from 3PL Central OAuth endpoint
async function requestNewToken(config: WmsAuthConfig): Promise<{ accessToken: string; expiresIn: number }> {
  const response = await fetch('https://secure-wms.com/AuthServer/api/Token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Accept': 'application/hal+json',
      'Host': 'secure-wms.com',
      'Connection': 'keep-alive',
      'Accept-Encoding': 'gzip, deflate, sdch',
      'Accept-Language': 'en-US,en;q=0.8',
      'Authorization': `Basic ${config.base64Key}`,
    },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      user_login: config.userLogin,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`WMS OAuth token request failed (${response.status}): ${errorText.slice(0, 300)}`)
  }

  const data = await response.json()

  if (!data.access_token) {
    throw new Error(`WMS OAuth response missing access_token: ${JSON.stringify(data).slice(0, 300)}`)
  }

  return {
    accessToken: data.access_token,
    // Default to 25 minutes if expires_in is missing (tokens typically last 30 min)
    expiresIn: (data.expires_in && data.expires_in > 0) ? data.expires_in : 1500,
  }
}

// Get a valid access token for the given warehouse, refreshing if needed
export async function getWmsToken(warehouse: string, supplierCode: string): Promise<string> {
  const cacheKey = `${warehouse}:${supplierCode}`

  // Check if we have a cached token that's still valid (with 60s buffer)
  const cached = tokenCache[cacheKey]
  if (cached && Date.now() < cached.expiresAt - 60000) {
    return cached.accessToken
  }

  // Get auth config for this warehouse
  const config = getAuthConfig(warehouse, supplierCode)
  if (!config) {
    throw new Error(`WMS OAuth credentials not configured for warehouse=${warehouse}, supplier=${supplierCode}. Set WMS_BASE64_KEY_* and WMS_USER_LOGIN_* env vars.`)
  }

  // Request new token
  const { accessToken, expiresIn } = await requestNewToken(config)

  // Cache it
  tokenCache[cacheKey] = {
    accessToken,
    expiresAt: Date.now() + expiresIn * 1000,
  }

  return accessToken
}
