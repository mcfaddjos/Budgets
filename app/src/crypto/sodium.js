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

/**
 * Hand-rolled UTF-8 codec — deliberately not sodium.from_string/to_string.
 * Confirmed by inspecting the native source directly: unlike
 * to_base64/from_base64/to_hex (real JSI host functions in
 * react-native-libsodium's cpp/), from_string/to_string are declared in
 * the JS wrapper's exports but never actually implemented natively —
 * calling them throws "undefined is not a function" on-device (this took
 * a real on-device failure to catch, since the libsodium-wrappers-sumo
 * shim used for Jest tests implements them fine, masking the gap).
 */
export function fromUtf8(str) {
  const bytes = [];
  for (let i = 0; i < str.length; i++) {
    let code = str.codePointAt(i);
    if (code > 0xffff) i++; // consumed a surrogate pair
    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code < 0x10000) {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f)
      );
    }
  }
  return new Uint8Array(bytes);
}

export function toUtf8(bytes) {
  let result = "";
  let i = 0;
  while (i < bytes.length) {
    const byte1 = bytes[i++];
    if (byte1 < 0x80) {
      result += String.fromCharCode(byte1);
    } else if (byte1 < 0xe0) {
      const byte2 = bytes[i++];
      result += String.fromCharCode(((byte1 & 0x1f) << 6) | (byte2 & 0x3f));
    } else if (byte1 < 0xf0) {
      const byte2 = bytes[i++];
      const byte3 = bytes[i++];
      result += String.fromCharCode(((byte1 & 0x0f) << 12) | ((byte2 & 0x3f) << 6) | (byte3 & 0x3f));
    } else {
      const byte2 = bytes[i++];
      const byte3 = bytes[i++];
      const byte4 = bytes[i++];
      let code = ((byte1 & 0x07) << 18) | ((byte2 & 0x3f) << 12) | ((byte3 & 0x3f) << 6) | (byte4 & 0x3f);
      code -= 0x10000;
      result += String.fromCharCode(0xd800 + (code >> 10), 0xdc00 + (code & 0x3ff));
    }
  }
  return result;
}

export default sodium;
