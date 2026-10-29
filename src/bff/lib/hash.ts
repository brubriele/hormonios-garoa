const SHIFTS = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 4,
  11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
];

const CONSTANTS = Array.from({ length: 64 }, (_, index) => Math.floor(Math.abs(Math.sin(index + 1)) * 2 ** 32) >>> 0);

function padded(text: string): Uint8Array {
  const bytes = new TextEncoder().encode(text);
  const length = (((bytes.length + 8) >>> 6) + 1) * 64;
  const buffer = new Uint8Array(length);
  const view = new DataView(buffer.buffer);

  buffer.set(bytes);
  buffer[bytes.length] = 0x80;
  view.setUint32(length - 8, (bytes.length * 8) >>> 0, true);
  view.setUint32(length - 4, Math.floor((bytes.length * 8) / 2 ** 32), true);

  return buffer;
}

function rotate(value: number, shift: number): number {
  return (value << shift) | (value >>> (32 - shift));
}

function mix(index: number, b: number, c: number, d: number): [number, number] {
  if (index < 16) {
    return [(b & c) | (~b & d), index];
  }

  if (index < 32) {
    return [(d & b) | (~d & c), (5 * index + 1) % 16];
  }

  if (index < 48) {
    return [b ^ c ^ d, (3 * index + 5) % 16];
  }

  return [c ^ (b | ~d), (7 * index) % 16];
}

function toHex(value: number): string {
  const bytes = [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff];

  return bytes.map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function md5(text: string): string {
  const buffer = padded(text);
  const view = new DataView(buffer.buffer);
  const state = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476];

  for (let offset = 0; offset < buffer.length; offset += 64) {
    let [a, b, c, d] = state;

    for (let index = 0; index < 64; index++) {
      const [f, word] = mix(index, b, c, d);
      const sum = (a + f + CONSTANTS[index] + view.getUint32(offset + word * 4, true)) >>> 0;

      a = d;
      d = c;
      c = b;
      b = (b + rotate(sum, SHIFTS[index])) >>> 0;
    }

    state[0] = (state[0] + a) >>> 0;
    state[1] = (state[1] + b) >>> 0;
    state[2] = (state[2] + c) >>> 0;
    state[3] = (state[3] + d) >>> 0;
  }

  return state.map(toHex).join("");
}

export function emailHash(email: string): string {
  const orgId = process.env.TRANSICIONAIS_ORG_ID;

  if (!orgId) {
    // check-ignore throw-error: env ausente é configuração (E7)
    throw new Error("TRANSICIONAIS_ORG_ID is not set");
  }

  return md5(`${email}${orgId}`);
}
