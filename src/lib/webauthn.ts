// ─── Mobile detection (UA-based, non bypassabile ridimensionando la finestra) ─────
export function isMobilePlatform(): boolean {
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
}

// ─── Controlla se il dispositivo supporta autenticatori biometrici platform ──────
export async function isBiometricAvailable(): Promise<boolean> {
  if (!window.PublicKeyCredential) return false
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
  } catch {
    return false
  }
}

// ─── WebAuthn: registra una nuova credenziale Face ID / Touch ID ─────────────────
export async function registerBiometric(
  userId: string,
  userEmail: string,
): Promise<{ credentialId: string }> {
  const challenge = crypto.getRandomValues(new Uint8Array(32))
  const userIdBytes = new TextEncoder().encode(userId)

  const credential = await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { name: 'Agentics Gestionale' },
      user: {
        id: userIdBytes,
        name: userEmail,
        displayName: userEmail,
      },
      pubKeyCredParams: [
        { alg: -7, type: 'public-key' },   // ES256
        { alg: -257, type: 'public-key' }, // RS256
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        residentKey: 'preferred',
      },
      timeout: 60000,
    },
  }) as PublicKeyCredential | null

  if (!credential) throw new Error('Registrazione biometrica annullata.')

  const credentialId = bufferToBase64url((credential as PublicKeyCredential).rawId)
  return { credentialId }
}

// ─── WebAuthn: autentica con Face ID / Touch ID ──────────────────────────────────
export async function authenticateBiometric(
  credentialIds: string[],
): Promise<{ credentialId: string }> {
  const challenge = crypto.getRandomValues(new Uint8Array(32))

  const allowCredentials: PublicKeyCredentialDescriptor[] = credentialIds.map(id => ({
    type: 'public-key',
    id: base64urlToBuffer(id),
    transports: ['internal'] as AuthenticatorTransport[],
  }))

  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge,
      allowCredentials,
      userVerification: 'required',
      timeout: 60000,
    },
  }) as PublicKeyCredential | null

  if (!assertion) throw new Error('Autenticazione biometrica annullata.')

  const credentialId = bufferToBase64url(assertion.rawId)
  return { credentialId }
}

// ─── TOTP generation (RFC 6238) ──────────────────────────────────────────────────

/** Decodifica Base32 in Uint8Array */
function base32Decode(input: string): Uint8Array {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  const str = input.toUpperCase().replace(/=+$/, '')
  const bytes: number[] = []
  let bits = 0
  let value = 0

  for (const char of str) {
    const idx = alphabet.indexOf(char)
    if (idx === -1) continue
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }

  return new Uint8Array(bytes)
}

/** Genera un codice TOTP a 6 cifre dal segreto base32 */
export async function generateTotp(secret: string): Promise<string> {
  const secretBytes = base32Decode(secret)
  const counter = Math.floor(Date.now() / 1000 / 30)

  // Counter come 8 byte big-endian
  const counterBuffer = new ArrayBuffer(8)
  const view = new DataView(counterBuffer)
  view.setUint32(4, counter >>> 0, false)

  const keyData = new Uint8Array(secretBytes).buffer as ArrayBuffer
  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  )

  const signature = await crypto.subtle.sign('HMAC', key, counterBuffer)
  const hash = new Uint8Array(signature)

  // Dynamic truncation
  const offset = hash[hash.length - 1] & 0x0f
  const code =
    ((hash[offset] & 0x7f) << 24) |
    ((hash[offset + 1] & 0xff) << 16) |
    ((hash[offset + 2] & 0xff) << 8) |
    (hash[offset + 3] & 0xff)

  return String(code % 1_000_000).padStart(6, '0')
}

// ─── Utility ─────────────────────────────────────────────────────────────────────
export function bufferToBase64url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let str = ''
  for (const b of bytes) str += String.fromCharCode(b)
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

export function base64urlToBuffer(base64url: string): ArrayBuffer {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64.padEnd(base64.length + (4 - (base64.length % 4)) % 4, '=')
  const str = atob(padded)
  const bytes = new Uint8Array(str.length)
  for (let i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i)
  return bytes.buffer
}
