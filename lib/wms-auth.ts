// WMS (3PL Central / Extensiv) OAuth2 token management
// Each warehouse has its own client credentials and user_login

interface WmsCredentials {
  clientId: string
  clientSecret: string
  userLogin: string
}

interface TokenCache {
  accessToken: string
  expiresAt: number // timestamp in ms
}

// In-memory token cache per warehouse key
const tokenCache: Record<string, TokenCache> = {}

// Get credentials for a warehouse/supplier combination
function getCredentials(warehouse: string, supplierCode: string): WmsCredentials | null {
  if (warehouse === 'Moses Lake') {
    const clientId = process.env.WMS_CLIENT_ID_MOSES_LAKE
    const clientSecret = process.env.WMS_CLIENT_SECRET_MOSES_LAKE
    const userLogin = process.env.WMS_USER_LOGIN_MOSES_LAKE
    if (clientId && clientSecret && userLogin) {
      return { clientId, clientSecret, userLogin }
    }
  } else if (supplierCode === 'HX') {
    // Kent HX
    const clientId = process.env.WMS_CLIENT_ID_KENT_HX
    const clientSecret = process.env.WMS_CLIENT_SECRET_KENT_HX
    const userLogin = process.env.WMS_USER_LOGIN_KENT_HX
    if (clientId && clientSecret && userLogin) {
      return { clientId, clientSecret, userLogin }
    }
  } else {
    // Kent AMC
    const clientId = process.env.WMS_CLIENT_ID_KENT_AMC
    const clientSecret = process.env.WMS_CLIENT_SECRET_KENT_AMC
    const userLogin = process.env.WMS_USER_LOGIN_KENT_AMC
    if (clientId && clientSecret && userLogin) {
      return { clientId, clientSecret, userLogin }
    }
  }
  return null
}

// Request a fresh access token from 3PL Central OAuth endpoint
async function requestNewToken(creds: WmsCredentials): Promise<{ accessToken: string; expiresIn: number }> {
  const authKey = Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString('base64')

  const response = await fetch('https://secure-wms.com/AuthServer/api/Token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Accept': 'application/json',
      'Authorization': `Basic ${authKey}`,
    },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      user_login: creds.userLogin,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`WMS OAuth token request failed (${response.status}): ${errorText}`)
  }

  const data = await response.json()
  return {
    accessToken: data.access_token,
    // Default to 25 minutes if expires_in is 0 or missing (tokens typically last 30-60 min)
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

  // Get credentials for this warehouse
  const creds = getCredentials(warehouse, supplierCode)
  if (!creds) {
    // Fallback: try legacy static token env vars
    let legacyToken: string | undefined
    if (warehouse === 'Moses Lake') {
      legacyToken = process.env.WMS_API_TOKEN
    } else if (supplierCode === 'HX') {
      legacyToken = process.env.WMS_API_TOKEN_KENT_HX
    } else {
      legacyToken = process.env.WMS_API_TOKEN_KENT_AMC
    }
    if (legacyToken) return legacyToken
    throw new Error(`WMS credentials not configured for warehouse=${warehouse}, supplier=${supplierCode}`)
  }

  // Request new token
  const { accessToken, expiresIn } = await requestNewToken(creds)

  // Cache it
  tokenCache[cacheKey] = {
    accessToken,
    expiresAt: Date.now() + expiresIn * 1000,
  }

  return accessToken
}
