import type MarkdownItConstructor from 'markdown-it';
import type {
  TextGraphLanguagePack,
  TextGraphRenderDiagnostic,
  TextGraphRenderPngOptions,
} from '@drawmotive/textgraph';

// The default constructor is shared by Markdown 14 typings and Markdown 15's
// bundled declarations; older 14.x typings do not export a named instance type.
type MarkdownIt = InstanceType<typeof MarkdownItConstructor>;

export interface MarkdownDiagnostic {
  file?: string;
  blockIndex: number;
  diagnostic: TextGraphRenderDiagnostic;
  documentLocation?: { line: number; column?: number };
}

export interface TextGraphMarkdownOptions {
  /** Defaults to scale 1; display size uses logical diagram dimensions. */
  render?: Pick<TextGraphRenderPngOptions, 'scale' | 'padding' | 'maxWidth'>;
  languagePacks?: readonly TextGraphLanguagePack[];
  errorMode?: 'inline' | 'throw';
  onDiagnostic?: (diagnostic: MarkdownDiagnostic) => void;
}

export interface TextGraphMarkdownSession {
  markdownIt(md: MarkdownIt): void;
  render(
    md: MarkdownIt,
    source: string,
    env?: Record<string | symbol, unknown>,
  ): Promise<string>;
  dispose(): Promise<void>;
}

export declare function createTextGraphMarkdown(
  options?: TextGraphMarkdownOptions,
): TextGraphMarkdownSession;
