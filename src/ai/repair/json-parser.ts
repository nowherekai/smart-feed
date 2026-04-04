export function extractJsonTextCandidate(text: string): string | null {
  const trimmed = text.trim();
  const codeFenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/iu);
  const candidate = codeFenceMatch?.[1] ?? trimmed;
  const firstBraceIndex = candidate.indexOf("{");
  const lastBraceIndex = candidate.lastIndexOf("}");

  if (firstBraceIndex === -1 || lastBraceIndex <= firstBraceIndex) {
    return null;
  }

  return candidate.slice(firstBraceIndex, lastBraceIndex + 1);
}

export function parseJsonTextCandidate(text: string): unknown | null {
  const candidate = extractJsonTextCandidate(text);

  if (candidate === null) {
    return null;
  }

  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}
