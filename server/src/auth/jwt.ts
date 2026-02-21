import jwt from 'jsonwebtoken';
import { randomBytes } from 'crypto';

const secret = process.env.JWT_SECRET || (() => {
  const fallback = randomBytes(32).toString('hex');
  console.warn('[JWT] WARNING: JWT_SECRET not set, using random secret. Tokens will not survive restarts.');
  return fallback;
})();

interface TokenPayload {
  userId: string;
  phone: string;
}

export function generateToken(userId: string, phone: string): string {
  return jwt.sign({ userId, phone }, secret, { expiresIn: '30d' });
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    const decoded = jwt.verify(token, secret) as jwt.JwtPayload & TokenPayload;
    return { userId: decoded.userId, phone: decoded.phone };
  } catch {
    return null;
  }
}
