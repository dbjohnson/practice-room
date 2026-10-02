export interface BandRegion {
  file: string;
  root: number;
  low: number;
  high: number;
  velocity: number[];
  bank: number;
  program: number;
  release: number;
  pan: number;
  group: number;
  sampleRate: number;
}

export function generator(operator: number, amount: number): Buffer {
  const result = Buffer.alloc(4);
  result.writeUInt16LE(operator, 0);
  result.writeUInt16LE(amount & 0xffff, 2);
  return result;
}

export function namedRecord(name: string, size: number): Buffer {
  const record = Buffer.alloc(size);
  record.write(name.slice(0, 19), 0, 20, 'ascii');
  return record;
}
