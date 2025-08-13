/**
 * Generates a cryptographically secure random string to use as input key material (IKM).
 */
export interface PassphraseOptions {
  /** Number of bytes to generate (default 32 = 256 bits) */
  byteLength?: number;
}

/**
 * Securely generate IKM as a hex string for use in HKDF or other key derivation.
 * @param options.byteLength Number of bytes to generate
 * @returns Hex-encoded string of random bytes
 */
export function makePassphrase({ byteLength = 32 }: PassphraseOptions = {}): string {
  const ikm = new Uint8Array(byteLength);
  crypto.getRandomValues(ikm);
  // Convert to hex string
  return Array.from(ikm)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// Example usage:
// const ikmHex = makePassphrase(); // "e3f7..."
// console.log("IKM (hex):", ikmHex);