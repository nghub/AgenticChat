export interface TextChunk {
  content: string;
  index: number;
}

export interface ChunkOptions {
  /** Document/source title, prefixed to every chunk so embeddings carry context. */
  title?: string;
}

const CHUNK_SIZE = 800;
const CHUNK_OVERLAP = 150;
// A section at least this long stands alone; shorter ones (one SKU row is
// ~120 chars) accumulate until the group reaches it. A policy paragraph never
// gets blended with its neighbour, a catalogue never becomes one row per chunk.
const STANDALONE = 200;
// A document needs at least this many headed sections to be chunked by
// section; otherwise it is prose and gets the sliding window.
const MIN_SECTIONS = 3;

/**
 * Lines that begin a section: policy/SKU codes ("MP-013 - Shipping Coverage",
 * "DEN-043 High-Speed Air Handpiece ...") and Markdown headings.
 */
const SECTION_START = /^(?:[A-Z]{2,5}-\d{2,4}\b.*|#{1,6}\s+\S.*)$/;

/**
 * Split text into embedding-sized chunks.
 *
 * Structured documents (policies with "MP-013 - ..." headings, catalogues with
 * one "DEN-043 ..." row per line) are chunked by section, so each chunk is one
 * topic and its embedding is not diluted by its neighbours. A sliding window
 * over a 14-page policy manual put MP-011..MP-014 in one 800-char chunk, and
 * "do you ship to Japan?" could not find "international shipping is not
 * supported" in it. Prose without headings still uses the sliding window.
 */
export function chunkText(text: string, options: ChunkOptions = {}): TextChunk[] {
  const cleaned = text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  const sections = splitSections(cleaned);
  const prefix = options.title?.trim() ? `${options.title.trim()}\n` : "";

  if (sections.filter((s) => s.heading).length >= MIN_SECTIONS) {
    return chunkSections(sections, prefix);
  }
  return slidingWindow(cleaned).map((c, index) => ({ content: prefix + c, index }));
}

interface Section {
  heading: string; // "" for text before the first heading
  text: string;    // heading line + body
}

function splitSections(text: string): Section[] {
  const sections: Section[] = [];
  let current: Section | null = null;
  for (const line of text.split("\n")) {
    if (SECTION_START.test(line.trim())) {
      if (current) sections.push(current);
      current = { heading: line.trim(), text: line.trim() };
    } else if (current) {
      current.text += "\n" + line;
    } else {
      current = { heading: "", text: line };
    }
  }
  if (current) sections.push(current);
  return sections.map((s) => ({ ...s, text: s.text.trim() })).filter((s) => s.text.length > 0);
}

function chunkSections(sections: Section[], prefix: string): TextChunk[] {
  const out: string[] = [];
  let group: string[] = [];
  let groupLen = 0;

  const flush = () => {
    if (group.length) out.push(group.join("\n"));
    group = [];
    groupLen = 0;
  };

  for (const section of sections) {
    if (section.text.length > CHUNK_SIZE) {
      // Too big for one embedding: window the body, keep the heading on each piece.
      flush();
      const body = section.heading ? section.text.slice(section.heading.length).trim() : section.text;
      for (const piece of slidingWindow(body)) {
        out.push(section.heading ? `${section.heading}\n${piece}` : piece);
      }
      continue;
    }
    const standsAlone = section.text.length >= STANDALONE;
    if (standsAlone || groupLen >= STANDALONE || groupLen + section.text.length + 1 > CHUNK_SIZE) flush();
    group.push(section.text);
    groupLen += section.text.length + 1;
    if (standsAlone) flush();
  }
  flush();

  return out.filter((c) => c.length > 30).map((content, index) => ({ content: prefix + content, index }));
}

function slidingWindow(cleaned: string): string[] {
  if (cleaned.length <= CHUNK_SIZE) return cleaned ? [cleaned] : [];
  const chunks: string[] = [];
  let start = 0;
  while (start < cleaned.length) {
    let end = start + CHUNK_SIZE;
    if (end < cleaned.length) {
      // Prefer a paragraph boundary, then a sentence, then a word.
      const paragraphBreak = cleaned.lastIndexOf("\n\n", end);
      if (paragraphBreak > start + CHUNK_SIZE / 2) {
        end = paragraphBreak;
      } else {
        const sentenceBreak = cleaned.lastIndexOf(". ", end);
        if (sentenceBreak > start + CHUNK_SIZE / 2) {
          end = sentenceBreak + 1;
        } else {
          const wordBreak = cleaned.lastIndexOf(" ", end);
          if (wordBreak > start) end = wordBreak;
        }
      }
    }
    const chunk = cleaned.slice(start, end).trim();
    if (chunk.length > 50) chunks.push(chunk);
    start = end - CHUNK_OVERLAP;
    if (start <= 0) start = end;
  }
  return chunks;
}
