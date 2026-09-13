import MarkdownIt from 'markdown-it';
import {
  createTextGraphMarkdown,
  type MarkdownDiagnostic,
  type TextGraphMarkdownOptions,
  type TextGraphMarkdownSession,
} from '@drawmotive/markdown-it-textgraph';

const options: TextGraphMarkdownOptions = {
  render: { scale: 2, padding: 8, maxWidth: 1200 },
  errorMode: 'inline',
  onDiagnostic(value: MarkdownDiagnostic) {
    value.documentLocation?.column?.toFixed();
  },
};
const session: TextGraphMarkdownSession = createTextGraphMarkdown(options);
const md = new MarkdownIt();
session.markdownIt(md);
await session.render(md, 'text', { path: 'guide.md' });
await session.dispose();
