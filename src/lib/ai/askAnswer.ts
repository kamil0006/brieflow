// Turns the model's structured chat answer into the text + sources the UI
// shows. The [N] markers are built here, from the same list as the sources,
// so a marker always points at the N-th source shown under the answer.

export type AskPoint = { text: string; index: number };
export type AskSource = { id: string; title: string; url: string };

export function buildAskAnswer(
  parsed: { intro: string; points: AskPoint[] },
  articles: AskSource[],
): { answer: string; sources: AskSource[]; grounded: boolean } {
  const sources: AskSource[] = [];
  const markerByIndex = new Map<number, number>();
  const lines: { text: string; marker: number }[] = [];

  for (const point of parsed.points) {
    const article = articles[point.index - 1];
    // a point citing a number that isn't on the list has no backing — it's
    // dropped rather than shown as if it came from the user's news
    if (!article) continue;
    let marker = markerByIndex.get(point.index);
    if (marker === undefined) {
      sources.push({ id: article.id, title: article.title, url: article.url });
      marker = sources.length;
      markerByIndex.set(point.index, marker);
    }
    lines.push({ text: point.text.trim(), marker });
  }

  const body = lines.map((line, i) =>
    lines.length > 1 ? `${i + 1}. ${line.text} [${line.marker}]` : `${line.text} [${line.marker}]`,
  );
  const answer = [parsed.intro.trim(), ...body].filter(Boolean).join("\n\n");

  return { answer, sources, grounded: sources.length > 0 };
}
