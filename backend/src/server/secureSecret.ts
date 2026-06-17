import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'
import { ConfigPersistence } from './persistence/configPersistence.js'

// Encrypts small secrets (e.g. a Bearer PAT for HTTP push) at rest using AES-256-GCM.
// The key is derived from the per-installation session secret stored in secrets.txt
// (ConfigPersistence.ensureSecret()), which is never included in exports.
const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12 // recommended length for GCM
const SALT = 'm2m-pat'

function deriveKey(): Buffer {
  const secret = new ConfigPersistence().ensureSecret()
  return scryptSync(secret, SALT, 32)
}

// Returns base64 of iv | authTag | ciphertext
export function encryptSecret(plain: string): string {
  const key = deriveKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return Buffer.concat([iv, authTag, ciphertext]).toString('base64')
}

export function decryptSecret(enc: string): string {
  const key = deriveKey()
  const data = Buffer.from(enc, 'base64')
  const iv = data.subarray(0, IV_LENGTH)
  const authTag = data.subarray(IV_LENGTH, IV_LENGTH + 16)
  const ciphertext = data.subarray(IV_LENGTH + 16)
  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
}
