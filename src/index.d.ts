import type MarkdownIt from 'markdown-it';
import type {
  TextGraphLanguagePack,
  TextGraphRenderDiagnostic,
  TextGraphRenderPngOptions,
} from '@drawmotive/textgraph';

export interface MarkdownDiagnostic {
  file?: string;
  blockIndex: number;
  diagnostic: TextGraphRenderDiagnostic;
  documentLocation?: { line: number; column?: number };
}

export interface TextGraphMarkdownOptions {
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
