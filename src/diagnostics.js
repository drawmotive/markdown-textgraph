function splitLines(source) {
  return source.split(/\r?\n/);
}

function resolveSourceContext(documentSource, env) {
  const parsedSource = typeof env.content === 'string' ? env.content : documentSource;
  const expandedSource = typeof env.src === 'string' ? env.src : documentSource;
  if (expandedSource !== documentSource || !documentSource.endsWith(parsedSource)) {
    return undefined;
  }
  const prefix = documentSource.slice(0, documentSource.length - parsedSource.length);
  return { parsedSource, lineOffset: (prefix.match(/\n/g) ?? []).length };
}

export function mapDiagnostic(task, diagnostic, documentSource, env = {}) {
  const location = diagnostic.location;
  if (!location || !Number.isInteger(location.line) || location.line < 0 || !task.map) {
    return undefined;
  }

  const sourceContext = resolveSourceContext(documentSource, env);
  if (!sourceContext) return undefined;
  const blockLines = splitLines(task.source);
  const blockLine = blockLines[location.line];
  const parsedLine = task.map[0] + 1 + location.line;
  const documentLine = sourceContext.lineOffset + parsedLine;
  const originalLine = splitLines(documentSource)[documentLine];
  const parsedSourceLine = splitLines(sourceContext.parsedSource)[parsedLine];
  const isTrailingSentinel = blockLine === '' && task.source.endsWith('\n') &&
    location.line >= blockLines.length - 2;
  // token.map identifies candidate lines only. Both parser input and raw source
  // must prove that markdown-it removed just a container prefix.
  if (blockLine === undefined || isTrailingSentinel || originalLine === undefined ||
      originalLine !== parsedSourceLine) {
    return undefined;
  }

  const mapped = { line: documentLine };
  if (originalLine.endsWith(blockLine) && Number.isInteger(location.column) &&
      location.column >= 0 && location.column <= blockLine.length) {
    mapped.column = originalLine.length - blockLine.length + location.column;
  }
  return mapped;
}

export function createMarkdownDiagnostic(task, diagnostic, documentSource, env) {
  const result = {
    file: env.realPath ?? env.path ?? env.file,
    blockIndex: task.blockIndex,
    diagnostic,
  };
  const documentLocation = mapDiagnostic(task, diagnostic, documentSource, env);
  if (documentLocation) result.documentLocation = documentLocation;
  if (result.file === undefined) delete result.file;
  return result;
}

export function createBuildError(task, diagnostics, documentSource, env) {
  const file = env.realPath ?? env.path ?? env.file ?? '<markdown>';
  const details = diagnostics.map(diagnostic => diagnostic.code + ': ' + diagnostic.message).join('; ');
  const error = new Error(file + ': TextGraph block ' + (task.blockIndex + 1) + ' failed: ' + details);
  error.name = 'TextGraphMarkdownError';
  error.code = 'TEXTGRAPH_RENDER_FAILED';
  error.file = env.realPath ?? env.path ?? env.file;
  error.blockIndex = task.blockIndex;
  error.diagnostics = diagnostics;
  const location = diagnostics.map(value => mapDiagnostic(task, value, documentSource, env)).find(Boolean);
  if (location) error.documentLocation = location;
  return error;
}
