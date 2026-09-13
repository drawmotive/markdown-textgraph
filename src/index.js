import { createMarkdownSession } from "./markdown.js";
import { createWorkerRenderer } from "./worker/client.js";

/** Public Node session: Markdown owns host adaptation; the SDK owns all diagram work. */
export function createTextGraphMarkdown(options = {}) {
  return createMarkdownSession(createWorkerRenderer(options), options);
}
