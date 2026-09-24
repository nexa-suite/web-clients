import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const tokenRoot = join(root, 'tokens');
const styleRoot = join(root, 'src', 'styles');
const checkOnly = process.argv.includes('--check');
const sources = [
  ['primitive.tokens.json', '_tokens-primitives.scss'],
  ['semantic.tokens.json', '_tokens-semantic.scss'],
  ['component.tokens.json', '_tokens-components.scss'],
  ['data-visualization.tokens.json', '_tokens-data-visualization.scss'],
];

const toCssValue = (value) => String(value).replace(/\{([a-z0-9-]+)\}/g, 'var(--$1)');
const entries = (document) => Object.entries(document).filter(([name]) => !name.startsWith('$'));
const declarationBlock = (document) =>
  entries(document)
    .map(([name, token]) => '  --' + name + ': ' + toCssValue(token.$value) + ';')
    .join('\n');

function generate(source, document) {
  let output =
    '/* Generated from tokens/' + source + '; do not edit directly. */\n' +
    ':root {\n' +
    declarationBlock(document) +
    '\n}';

  if (source === 'semantic.tokens.json') {
    const mode = document.$extensions?.nexa?.modes?.['contrast-increased'];
    if (mode) {
      output += '\n\n:root[data-contrast-mode=\'increased\'] {\n' + declarationBlock(mode) + '\n}';
    }
  }

  return output + '\n';
}

const mismatches = [];
for (const [source, target] of sources) {
  const document = JSON.parse(await readFile(join(tokenRoot, source), 'utf8'));
  const destination = join(styleRoot, target);
  const output = generate(source, document);
  const current = await readFile(destination, 'utf8').catch(() => null);

  if (checkOnly) {
    if (current !== output) mismatches.push(target);
  } else if (current !== output) {
    await writeFile(destination, output);
  }
}

if (mismatches.length) {
  console.error('Generated token artifacts are stale:\n' + mismatches.map((file) => '- src/styles/' + file).join('\n'));
  process.exitCode = 1;
} else if (checkOnly) {
  console.log('Generated token artifacts are up to date.');
} else {
  console.log('Generated primitive, semantic, component and data-visualization token artifacts.');
}
