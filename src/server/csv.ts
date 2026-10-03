/** Streams RFC 4180 rows as objects keyed by the header line; quoted fields may span lines. */
export async function* csvRows(
  chunks: AsyncIterable<string>,
): AsyncGenerator<Record<string, string>> {
  let header: string[] | null = null,
    row: string[] = [],
    field = '',
    quoted = false,
    pendingQuote = false;
  const endRow = function* (): Generator<Record<string, string>> {
    row.push(field);
    field = '';
    if (!header) header = row;
    else if (row.length > 1 || row[0])
      yield Object.fromEntries(header.map((name, index) => [name, row[index] ?? '']));
    row = [];
  };
  for await (const chunk of chunks)
    for (const char of chunk) {
      if (pendingQuote) {
        pendingQuote = false;
        if (char === '"') {
          field += '"';
          continue;
        }
        quoted = false;
      }
      if (quoted) {
        if (char === '"') pendingQuote = true;
        else field += char;
      } else if (char === '"') quoted = true;
      else if (char === ',') {
        row.push(field);
        field = '';
      } else if (char === '\n') yield* endRow();
      else if (char !== '\r') field += char;
    }
  if (field || row.length) yield* endRow();
}
