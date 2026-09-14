/** Reads all of stdin and parses it as JSON. Every hook receives its input this way. */
export async function readStdinJson(): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  return text.trim().length === 0 ? {} : JSON.parse(text);
}
