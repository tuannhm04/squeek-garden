// Sign-In with Ethereum (EIP-4361): parses the signed message and recovers who signed it.
import { secp256k1 } from '@noble/curves/secp256k1';
import { keccak_256 } from '@noble/hashes/sha3';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils';

export const isAddress = a => typeof a === 'string' && /^0x[0-9a-fA-F]{40}$/.test(a);

/** EIP-55 mixed-case form of an address. */
export function checksumAddress(address) {
  const lower = address.slice(2).toLowerCase();
  const hash = bytesToHex(keccak_256(utf8ToBytes(lower)));
  return `0x${[...lower].map((c, i) => (parseInt(hash[i], 16) >= 8 ? c.toUpperCase() : c)).join('')}`;
}

/** The address behind an Ethereum personal_sign signature, or null if it is not a valid one. */
export function recoverAddress(message, signature) {
  if (typeof signature !== 'string' || !/^0x[0-9a-fA-F]{130}$/.test(signature)) return null;
  try {
    const body = utf8ToBytes(message);
    const prefix = utf8ToBytes(`\x19Ethereum Signed Message:\n${body.length}`);
    const joined = new Uint8Array(prefix.length + body.length);
    joined.set(prefix); joined.set(body, prefix.length);
    const bytes = hexToBytes(signature.slice(2));
    let v = bytes[64];
    if (v >= 27) v -= 27;
    if (v !== 0 && v !== 1) return null;
    const pub = secp256k1.Signature.fromCompact(bytes.slice(0, 64)).addRecoveryBit(v).recoverPublicKey(keccak_256(joined)).toRawBytes(false);
    return checksumAddress(`0x${bytesToHex(keccak_256(pub.slice(1)).slice(-20))}`);
  } catch (_) { return null; }
}

const LINE = {
  uri: /^URI: (.+)$/, version: /^Version: (.+)$/, chainId: /^Chain ID: (\d+)$/, nonce: /^Nonce: (\S+)$/,
  issuedAt: /^Issued At: (.+)$/, expiresAt: /^Expiration Time: (.+)$/,
};

/** The fields of a signed message, or null when it does not have the EIP-4361 shape. */
export function parseMessage(message) {
  if (typeof message !== 'string' || message.length > 2000) return null;
  const lines = message.split('\n');
  const head = /^(\S+) wants you to sign in with your Ethereum account:$/.exec(lines[0] || '');
  if (!head || !isAddress(lines[1]) || lines[2] !== '') return null;
  const out = { domain: head[1], address: lines[1] };
  for (const line of lines.slice(3)) {
    for (const [k, re] of Object.entries(LINE)) { const m = re.exec(line); if (m && !(k in out)) out[k] = m[1]; }
  }
  return Object.keys(LINE).every(k => k in out) ? out : null;
}

/** Why this sign-in must be refused, or null. The nonce is checked by the caller, which also burns it. */
export function checkMessage(fields, signature, message, { host, origin, now }) {
  if (fields.domain !== host) return 'This message was signed for a different site.';
  if (fields.uri !== origin) return 'This message was signed for a different address.';
  if (fields.version !== '1') return 'Unsupported sign-in version.';
  const issued = Date.parse(fields.issuedAt), expires = Date.parse(fields.expiresAt);
  if (!Number.isFinite(issued) || !Number.isFinite(expires)) return 'The sign-in message has a bad date.';
  if (expires <= now) return 'This sign-in has expired. Try again.';
  if (issued > now + 300000) return 'This sign-in message is dated in the future.';
  const signer = recoverAddress(message, signature);
  if (!signer || signer !== checksumAddress(fields.address)) return 'The signature does not match this wallet.';
  return null;
}
