import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createHighlighter } from 'shiki';

const readJson = async path => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
const manifest = await readJson('../vscode/package.json');
const contributions = manifest.contributes.grammars ?? [];

async function loadGrammar(scopeName) {
  const contribution = contributions.find(grammar => grammar.scopeName === scopeName);
  assert.ok(contribution, `The extension must contribute ${scopeName}`);
  const file = contribution.path.replace('./dist/', './');
  return readJson('../vscode/' + file);
}

function tokenize(grammar, lines) {
  let state = null;
  return lines.map(line => {
    const result = grammar.tokenizeLine(line, state);
    state = result.ruleStack;
    return result.tokens.filter(token => token.startIndex < line.length).map(token => ({
      text: line.slice(token.startIndex, token.endIndex),
      scopes: token.scopes,
    }));
  });
}

const scope = name => name + '.textgraph';
const values = (line, name) => line.filter(token => token.scopes.includes(scope(name))).map(token => token.text);

test('TextGraph distinguishes operators, invalid arrows, labels and group boundaries', async () => {
  const source = await loadGrammar('source.textgraph');
  const highlighter = await createHighlighter({ langs: [source], themes: [] });
  try {
    const grammar = highlighter.getInternalContext().getLanguage('textgraph');
    const [chain, group, invalid, list, invalidAnonymous, named] = tokenize(grammar, [
      'A->B<-C<->D--[Queued item]',
      'G: title -> shown { Group.node -> End : also --> text }',
      'A --> B => C',
      'System.a, Support.b',
      'A -> [word --> other]',
      'browse: Browse Products',
    ]);
    assert.deepEqual(values(chain, 'keyword.operator.arrow'), ['->', '<-', '<->', '--']);
    assert.deepEqual(values(chain, 'string.unquoted.anonymous'), ['Queued item']);
    assert.deepEqual(values(group, 'punctuation.section.group.begin'), ['{']);
    assert.deepEqual(values(group, 'punctuation.section.group.end'), ['}']);
    assert.deepEqual(values(group, 'meta.label'), [' title -> shown ', ' also --> text ']);
    assert.deepEqual(values(group, 'keyword.operator.arrow'), ['->']);
    assert.deepEqual(values(invalid, 'invalid.illegal.arrow'), ['-->', '=>']);
    assert.deepEqual(values(invalid, 'keyword.operator.arrow'), []);
    assert.deepEqual(values(list, 'punctuation.separator.sequence'), [',']);
    assert.deepEqual(values(list, 'entity.name.type.node'), ['System.a', 'Support.b']);
    assert.deepEqual(values(invalidAnonymous, 'string.unquoted.anonymous'), []);
    assert.deepEqual(values(invalidAnonymous, 'invalid.illegal.arrow'), ['-->']);
    assert.deepEqual(values(named, 'entity.name.type.node'), ['browse']);
    assert.deepEqual(values(named, 'meta.label'), [' Browse Products']);
  } finally { highlighter.dispose(); }
});

test('TextGraph scopes recognized style words in incomplete and mixed lists', async () => {
  const source = await loadGrammar('source.textgraph');
  const highlighter = await createHighlighter({ langs: [source], themes: [] });
  try {
    const grammar = highlighter.getInternalContext().getLanguage('textgraph');
    const [mixed, incomplete, prose, ordinary, standalone] = tokenize(grammar, [
      'A(unknown FILL layout-2-col no-borderer pill)',
      'B(no-fill horizontal',
      'C(maybe like this): text (fill primary)',
      'fill primary',
      '(horizontal bold)',
    ]);
    assert.deepEqual(values(mixed, 'keyword.other.style'), ['FILL', 'layout-2-col', 'pill']);
    assert.deepEqual(values(mixed, 'punctuation.section.style.begin'), []);
    assert.deepEqual(values(mixed, 'punctuation.section.style.end'), []);
    assert.deepEqual(values(incomplete, 'keyword.other.style'), ['no-fill', 'horizontal']);
    assert.deepEqual(values(incomplete, 'punctuation.section.style.begin'), []);
    assert.deepEqual(values(prose, 'keyword.other.style'), []);
    assert.deepEqual(values(prose, 'punctuation.section.style.begin'), []);
    assert.deepEqual(values(prose, 'entity.name.type.node'), ['C']);
    assert.deepEqual(values(ordinary, 'keyword.other.style'), []);
    assert.deepEqual(values(standalone, 'keyword.other.style'), ['horizontal', 'bold']);
    assert.deepEqual(values(standalone, 'punctuation.section.style.begin'), ['(']);
    assert.deepEqual(values(standalone, 'punctuation.section.style.end'), [')']);
  } finally { highlighter.dispose(); }
});

test('TextGraph keeps directives and opaque multiline content distinct from structural tokens', async () => {
  const source = await loadGrammar('source.textgraph');
  const highlighter = await createHighlighter({ langs: [source], themes: [] });
  try {
    const grammar = highlighter.getInternalContext().getLanguage('textgraph');
    const [header, title, slide, standaloneSlide, commentStart, commentBody, commentEnd, fence, raw, fenceEnd, edge] = tokenize(grammar, [
      '@textgraph: onboarding', '@textgraph Plan -> Publish', '@slide(bold): Shipping', '@slide', '  <!-- hide', 'A -> B', '--> then -> ignored',
      '```md', 'A -> B', '```', 'C -> D',
    ]);
    assert.deepEqual(values(header, 'keyword.control.directive'), ['@textgraph']);
    assert.deepEqual(values(title, 'meta.label'), ['Plan -> Publish']);
    assert.deepEqual(values(title, 'keyword.operator.arrow'), []);
    assert.deepEqual(values(slide, 'keyword.control.directive'), ['@slide']);
    assert.deepEqual(values(standaloneSlide, 'keyword.control.directive'), ['@slide']);
    assert.deepEqual(values(slide, 'keyword.other.style'), ['bold']);
    for (const line of [commentStart, commentBody, commentEnd]) {
      assert.ok(values(line, 'comment.block').length > 0);
      assert.deepEqual(values(line, 'keyword.operator.arrow'), []);
    }
    assert.ok(values(fence, 'punctuation.definition.fence').length > 0);
    assert.deepEqual(values(raw, 'markup.raw.block'), ['A -> B']);
    assert.ok(values(fenceEnd, 'punctuation.definition.fence').length > 0);
    assert.deepEqual(values(edge, 'keyword.operator.arrow'), ['->']);
  } finally { highlighter.dispose(); }
});

test('Markdown scopes only TextGraph fences and resumes Markdown at the matching closer', async () => {
  const source = await loadGrammar('source.textgraph');
  const injection = await loadGrammar('markdown.textgraph.codeblock');
  const contribution = contributions.find(grammar => grammar.scopeName === injection.scopeName);
  const highlighter = await createHighlighter({
    langs: ['markdown', source, { ...injection, injectTo: contribution.injectTo }], themes: [],
  });
  try {
    const grammar = highlighter.getInternalContext().getLanguage('markdown');
    const lines = tokenize(grammar, [
      '# Before A -> B',
      '```javascript', 'A -> B', '```',
      '```textgraph-variant', 'A -> B', '```',
      '````markdown', '```textgraph', 'A -> B', '```', '````',
      '    ```textgraph', '    A -> B', '    ```', '',
      '```` textgraph example', 'A -> B', '```md', 'C -> D', '```', 'E -> F', '`````',
      '# Middle A -> B',
      '~~~textgraph', 'A -> B', '<!-- incomplete', '~~~',
      '# After A -> B',
      '', '> ```textgraph', '> <!-- hide', '> A -> B', '> -->', '> C -> D', '> ```', '> E -> F',
      '', '- List', '  ~~~textgraph', '  K -> L', '  ~~~', '  M -> N',
    ]);
    assert.deepEqual(lines.flatMap((line, index) => values(line, 'keyword.operator.arrow').length ? [index] : []), [17, 21, 25, 34, 40]);
    assert.deepEqual(values(lines[19], 'markup.raw.block'), ['C -> D']);
    assert.ok(lines[26].some(token => token.scopes.includes(scope('comment.block'))));
    for (const index of [0, 3, 5, 9, 13, 22, 23, 27, 28]) {
      assert.ok(lines[index].every(token => !token.scopes.includes(scope('meta.embedded.block'))), `Line ${index + 1} stays Markdown`);
    }
  } finally { highlighter.dispose(); }
});
