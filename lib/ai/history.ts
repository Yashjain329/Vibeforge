/** Graph-only answers (written in the browser when the AI was unavailable) carry this id prefix. */
export const GRAPH_ANSWER_PREFIX = "graph-";

export const isGraphAnswer = (m: { id: string }) => m.id.startsWith(GRAPH_ANSWER_PREFIX);

/** What the AI sees: the real conversation, without the browser's stand-in answers. */
export function forModel<T extends { id: string }>(messages: T[]): T[] {
  return messages.filter((m) => !isGraphAnswer(m));
}
