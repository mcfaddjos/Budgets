import sodium from "react-native-libsodium";

// react-native-libsodium loads its native binary asynchronously — every
// caller must await this before touching any crypto_* function.
export async function readySodium() {
  await sodium.ready;
  return sodium;
}

export function toBase64(bytes) {
  return sodium.to_base64(bytes, sodium.base64_variants.ORIGINAL);
}

export function fromBase64(str) {
  return sodium.from_base64(str, sodium.base64_variants.ORIGINAL);
}

export function toHex(bytes) {
  return sodium.to_hex(bytes);
}

export function fromUtf8(str) {
  return sodium.from_string(str);
}

export function toUtf8(bytes) {
  return sodium.to_string(bytes);
}

export default sodium;
