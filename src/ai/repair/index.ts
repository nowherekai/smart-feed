import type { ZodType } from "zod";

import { parseJsonTextCandidate } from "./json-parser";
import { buildRepairedObject } from "./normalizers";

export function tryRepairStructuredObjectText<TOutput>(options: {
  schema: ZodType<TOutput>;
  schemaName: string;
  text: string;
}): TOutput | null {
  const parsedCandidate = parseJsonTextCandidate(options.text);

  if (parsedCandidate === null) {
    return null;
  }

  const repairedCandidate = buildRepairedObject(options.schemaName, parsedCandidate);

  if (repairedCandidate === null) {
    return null;
  }

  const parseResult = options.schema.safeParse(repairedCandidate);

  return parseResult.success ? parseResult.data : null;
}
