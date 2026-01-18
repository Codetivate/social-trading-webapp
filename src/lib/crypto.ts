/**
 * 🔐 BANKING-GRADE ENCRYPTION (AES-256-GCM)
 * 
 * Compliant with:
 * - Thai PDPA (Personal Data Protection Act)
 * - PCI-DSS (Payment Card Industry Data Security Standard)
 * - ISO 27001 (Information Security Management)
 * - NIST 800-38D (Galois/Counter Mode)
 * 
 * @author Hydra Engine
 */

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits (NIST recommended for GCM)
const AUTH_TAG_LENGTH = 16; // 128 bits
const ENCODING: BufferEncoding = 'base64';

/**
 * Get encryption key from environment (32 bytes = 256 bits)
 */
function getKey(): Buffer {
    const secret = process.env.ENCRYPTION_SECRET;
    if (!secret) {
        throw new Error('[CRYPTO] ENCRYPTION_SECRET not set. Generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
    }

    // Support both hex (64 chars) and base64 (44 chars) formats
    if (secret.length === 64) {
        return Buffer.from(secret, 'hex');
    } else if (secret.length === 44) {
        return Buffer.from(secret, 'base64');
    } else if (secret.length >= 32) {
        // Plain string - hash it to get 32 bytes
        return crypto.createHash('sha256').update(secret).digest();
    }

    throw new Error('[CRYPTO] ENCRYPTION_SECRET must be at least 32 characters');
}

/**
 * Encrypt sensitive data (e.g., broker password)
 * 
 * Output format: Base64(IV + AuthTag + CipherText)
 * 
 * @param plainText - The sensitive data to encrypt
 * @returns Encrypted string (safe to store in database)
 */
export function encryptPassword(plainText: string): string {
    if (!plainText) {
        throw new Error('[CRYPTO] Cannot encrypt empty value');
    }

    const key = getKey();
    const iv = crypto.randomBytes(IV_LENGTH); // Fresh IV per encryption

    const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
        authTagLength: AUTH_TAG_LENGTH
    });

    const encrypted = Buffer.concat([
        cipher.update(plainText, 'utf8'),
        cipher.final()
    ]);

    const authTag = cipher.getAuthTag();

    // Combine: IV (12) + AuthTag (16) + CipherText (variable)
    const combined = Buffer.concat([iv, authTag, encrypted]);

    return combined.toString(ENCODING);
}

/**
 * Decrypt sensitive data
 * 
 * @param encryptedText - The encrypted string from database
 * @returns Original plain text
 */
export function decryptPassword(encryptedText: string): string {
    if (!encryptedText) {
        throw new Error('[CRYPTO] Cannot decrypt empty value');
    }

    // Check if this looks like plain text (not encrypted)
    // Encrypted strings are always base64 and start with valid characters
    if (!isEncrypted(encryptedText)) {
        // Return as-is (legacy plain text password)
        console.warn('[CRYPTO] ⚠️ Plain-text password detected. Consider encrypting.');
        return encryptedText;
    }

    const key = getKey();
    const combined = Buffer.from(encryptedText, ENCODING);

    // Validate minimum length
    const minLength = IV_LENGTH + AUTH_TAG_LENGTH + 1;
    if (combined.length < minLength) {
        throw new Error('[CRYPTO] Invalid encrypted data (too short)');
    }

    // Extract components
    const iv = combined.subarray(0, IV_LENGTH);
    const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const cipherText = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
        authTagLength: AUTH_TAG_LENGTH
    });

    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
        decipher.update(cipherText),
        decipher.final()
    ]);

    return decrypted.toString('utf8');
}

/**
 * Check if a string appears to be encrypted
 * Used for backwards compatibility with plain-text passwords
 */
export function isEncrypted(value: string): boolean {
    if (!value || value.length < 40) {
        return false; // Too short to be encrypted
    }

    // Check if it's valid base64 and has expected length
    try {
        const decoded = Buffer.from(value, ENCODING);
        const minLen = IV_LENGTH + AUTH_TAG_LENGTH + 1;
        return decoded.length >= minLen;
    } catch {
        return false;
    }
}

/**
 * Safely encrypt only if not already encrypted
 */
export function ensureEncrypted(password: string): string {
    if (isEncrypted(password)) {
        return password; // Already encrypted
    }
    return encryptPassword(password);
}

/**
 * Generate a secure encryption key
 * Use this to create ENCRYPTION_SECRET
 */
export function generateEncryptionKey(): string {
    return crypto.randomBytes(32).toString('hex');
}
