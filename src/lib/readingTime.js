/**
 * Estimates reading time for a pattern content object.
 * Collects all text fields, counts words, assumes 200 wpm.
 */
export function getReadingTime(content) {
  if (!content) return null;

  const texts = [
    content.intentDetail,
    content.problem,
    content.problemCode,
    content.problemExplain,
    content.solutionIntro,
    content.diagram,
    content.diagramCaption,
    content.exampleOutput,
    content.alternativeNote,
    ...(content.solutionSteps || []).flatMap((s) => [s.prose, s.code]),
    ...(content.whenToUse || []),
    ...(content.whenNotToUse || []),
    ...(content.advantages || []),
    ...(content.disadvantages || []),
    ...(content.relatedPatterns || []).map((r) => r.relation),
  ];

  const wordCount = texts
    .filter(Boolean)
    .join(" ")
    .split(/\s+/)
    .filter(Boolean).length;

  const minutes = Math.max(1, Math.round(wordCount / 200));
  return `${minutes} min read`;
}