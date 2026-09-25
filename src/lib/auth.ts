import jwt from 'jsonwebtoken'
import { NextRequest } from 'next/server'

function jwtSecret() {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET is not set')
  return secret
}

export function signToken(userId: string) {
  return jwt.sign({ sub: userId }, jwtSecret(), { expiresIn: '30d' })
}

export function verifyToken(token: string): string | null {
  try {
    const payload = jwt.verify(token, jwtSecret()) as { sub?: string }
    return typeof payload.sub === 'string' ? payload.sub : null
  } catch {
    return null
  }
}

export function userIdFromRequest(req: NextRequest): string | null {
  const header = req.headers.get('authorization') || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return null
  return verifyToken(token)
}

export function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status })
}
