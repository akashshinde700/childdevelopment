// Tiny markdown-like parser for BlogPost.body — deliberately not a full
// markdown implementation. Supported syntax, one per line:
//   ## Heading       -> h2
//   ### Heading      -> h3
//   - List item      -> consecutive "- " lines group into one <ul>
//   (blank line)     -> paragraph break
//   anything else    -> paragraph text (consecutive non-blank lines join
//                       into one paragraph, so long paragraphs can be
//                       hand-wrapped in the admin textarea)
// Kept this small on purpose: the admin form is a plain <textarea>, no rich
// block editor, so the syntax needs to be something a non-technical admin
// can type without a manual.

export type BlogSection =
  | { type: 'p'; text: string }
  | { type: 'h2'; text: string }
  | { type: 'h3'; text: string }
  | { type: 'ul'; items: string[] }

export function parseBlogBody(body: string): BlogSection[] {
  const lines = (body || '').replace(/\r\n/g, '\n').split('\n')
  const sections: BlogSection[] = []
  let paragraphBuf: string[] = []
  let listBuf: string[] = []

  const flushParagraph = () => {
    if (paragraphBuf.length > 0) {
      sections.push({ type: 'p', text: paragraphBuf.join(' ').trim() })
      paragraphBuf = []
    }
  }
  const flushList = () => {
    if (listBuf.length > 0) {
      sections.push({ type: 'ul', items: listBuf })
      listBuf = []
    }
  }

  for (const raw of lines) {
    const line = raw.trim()
    if (line === '') {
      flushParagraph()
      flushList()
      continue
    }
    if (line.startsWith('### ')) {
      flushParagraph(); flushList()
      sections.push({ type: 'h3', text: line.slice(4).trim() })
    } else if (line.startsWith('## ')) {
      flushParagraph(); flushList()
      sections.push({ type: 'h2', text: line.slice(3).trim() })
    } else if (line.startsWith('- ')) {
      flushParagraph()
      listBuf.push(line.slice(2).trim())
    } else {
      flushList()
      paragraphBuf.push(line)
    }
  }
  flushParagraph()
  flushList()
  return sections
}

export function estimateReadingTime(body: string): string {
  const words = (body || '').trim().split(/\s+/).filter(Boolean).length
  const minutes = Math.max(1, Math.round(words / 200))
  return `${minutes} min read`
}
