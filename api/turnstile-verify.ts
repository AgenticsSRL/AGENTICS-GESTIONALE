import type { VercelRequest, VercelResponse } from '@vercel/node'

const SECRET_KEY = process.env.CF_TURNSTILE_SECRET ?? ''

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' })
  }

  const { token } = req.body ?? {}
  if (!token) {
    return res.status(400).json({ success: false, error: 'Missing token' })
  }

  try {
    const cfRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret: SECRET_KEY, response: token }),
    })
    const data = await cfRes.json()
    return res.status(200).json({ success: data.success === true })
  } catch {
    return res.status(500).json({ success: false, error: 'Verification failed' })
  }
}
