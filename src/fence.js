const INFO_SEPARATOR = /\s/;

export function isTextGraphFence(token) {
  return token.info.trim().split(INFO_SEPARATOR, 1)[0] === 'textgraph';
}

export function createFenceRule(originalFence, getContext) {
  return function textGraphFence(tokens, index, options, env, self) {
    const token = tokens[index];
    const context = getContext(env);
    if (!context || !isTextGraphFence(token)) {
      return originalFence(tokens, index, options, env, self);
    }

    const blockIndex = context.tasks.length;
    const marker = '<!-- textgraph-placeholder:' + context.marker + ':' + blockIndex + ' -->';
    context.tasks.push({
      blockIndex,
      marker,
      source: token.content,
      map: token.map,
      parserSource: context.parserSource,
    });
    return marker;
  };
}

export function createSourceCaptureRule(getContext) {
  return function captureTextGraphParserSource(state) {
    const context = getContext(state.env);
    if (context) context.parserSource = state.src;
  };
}
