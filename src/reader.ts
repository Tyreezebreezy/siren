export type DocumentKind = "text" | "txt" | "markdown" | "pdf";

export type ReaderSentence = {
  index: number;
  paragraphIndex: number;
  text: string;
};

export type ReaderParagraph = {
  index: number;
  sentences: ReaderSentence[];
};

export type ReaderDocument = {
  paragraphs: ReaderParagraph[];
  sentences: ReaderSentence[];
};

const sentenceSegmenter = new Intl.Segmenter("en", {
  granularity: "sentence",
});
const nonTerminalAbbreviation =
  /(?:\b(?:mr|mrs|ms|dr|prof|sr|jr|st|vs|etc)\.|(?:\b[A-Z]\.){1,3})$/i;

export function parseReaderDocument(text: string): ReaderDocument {
  const sentences: ReaderSentence[] = [];
  const paragraphs = text
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replace(/\s*\n\s*/g, " ").trim())
    .filter(Boolean)
    .map((paragraph, paragraphIndex) => {
      const segmented = [...sentenceSegmenter.segment(paragraph)]
        .map(({ segment }) => segment.trim())
        .filter(Boolean);
      const merged = segmented.reduce<string[]>((result, segment) => {
        const previous = result[result.length - 1];
        if (previous && nonTerminalAbbreviation.test(previous)) {
          result[result.length - 1] = `${previous} ${segment}`;
        } else {
          result.push(segment);
        }
        return result;
      }, []);
      const paragraphSentences = merged.map((sentence): ReaderSentence => {
        const result = {
          index: sentences.length,
          paragraphIndex,
          text: sentence,
        };
        sentences.push(result);
        return result;
      });
      return { index: paragraphIndex, sentences: paragraphSentences };
    });

  return { paragraphs, sentences };
}

export function markdownToReadableText(markdown: string): string {
  return markdown
    .replace(/```[^\n]*\n([\s\S]*?)```/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm, "")
    .replace(/^[ \t]*>[ \t]?/gm, "")
    .replace(/^[ \t]*(?:[-+*]|\d+[.)])[ \t]+/gm, "")
    .replace(/^[ \t]*([-*_])(?:[ \t]*\1){2,}[ \t]*$/gm, "")
    .replace(/[*_~]{1,2}([^\n]*?)[*_~]{1,2}/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function moveSentence(index: number, delta: number, count: number) {
  return Math.max(0, Math.min(Math.max(0, count - 1), index + delta));
}

export function documentTitle(filename: string) {
  return filename.replace(/\.(txt|md|markdown|pdf)$/i, "") || "Untitled";
}
