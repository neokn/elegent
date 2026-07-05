import { parseNote } from "./frontmatter";

function headings(body: string): string[] {
  return [...body.matchAll(/^## (.+)$/gm)].map((m) => m[1].trim());
}

function citationCount(body: string): number {
  const section = body.split(/^## Citations$/m)[1];
  if (!section) return 0;
  const untilNext = section.split(/^## /m)[0];
  return (untilNext.match(/^[*-] /gm) ?? []).length;
}

export function checkAugmentation(before: string, after: string): string[] {
  const violations: string[] = [];
  const b = parseNote(before);
  if (b.frontmatter?.user_managed === true) {
    if (before !== after) violations.push("user_managed: true 的檔案不可由 LLM 修改");
    return violations;
  }
  const a = parseNote(after);
  const afterHeadings = new Set(headings(a.body));
  for (const h of headings(b.body)) {
    if (!afterHeadings.has(h)) violations.push(`既有 heading "## ${h}" 不可消失`);
  }
  if (citationCount(a.body) < citationCount(b.body)) violations.push("## Citations 條目只增不減");
  return violations;
}
