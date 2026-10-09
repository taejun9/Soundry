/** Explicit trusted-LAN IPv4 only. Absent configuration keeps the loopback boundary. */
export function readLanHost(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const octets = value.split('.');
  if (octets.length !== 4 || octets.some((n) => !/^(0|[1-9]\d{0,2})$/.test(n) || Number(n) > 255)) {
    throw new Error('INVALID_LAN_HOST');
  }
  const [a, b, , d] = octets.map(Number);
  if (!(a === 10 || a === 172 && b! >= 16 && b! <= 31 || a === 192 && b === 168) || d === 0 || d === 255) {
    throw new Error('INVALID_LAN_HOST');
  }
  return value;
}
