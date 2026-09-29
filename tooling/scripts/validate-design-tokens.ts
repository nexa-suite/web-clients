import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
const stylesRoot = join(root, 'src', 'styles');
const files = (await readdir(stylesRoot)).filter((name) => name.endsWith('.scss')).map((name) => join(stylesRoot, name));
const declarations = new Map();
const references = [];

for (const file of files) {
  const source = await readFile(file, 'utf8');
  for (const match of source.matchAll(/--nexa-[a-z0-9-]+\s*:/g)) {
    const name = match[0].split(':')[0].trim();
    const previous = declarations.get(name);
    if (previous && !name.startsWith('--nexa-mode-')) {
      throw new Error(`duplicate token ${name}: ${relative(root, previous)} and ${relative(root, file)}`);
    }
    declarations.set(name, file);
  }
  for (const match of source.matchAll(/var\((--nexa-[a-z0-9-]+)/g)) references.push({ name: match[1], file });
}

const unknown = references.filter(({ name }) => !declarations.has(name));
if (unknown.length) throw new Error(`unknown token reference(s):\n${unknown.map(({ name, file }) => `- ${name} in ${relative(root, file)}`).join('\n')}`);

const graph = new Map([...declarations.keys()].map((name) => [name, []]));
for (const file of files) {
  const source = await readFile(file, 'utf8');
  for (const declaration of source.matchAll(/(--nexa-[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    const owner = declaration[1];
    for (const reference of declaration[2].matchAll(/var\((--nexa-[a-z0-9-]+)/g)) graph.get(owner)?.push(reference[1]);
  }
}

const visiting = new Set();
const visited = new Set();
const walk = (token, path = []) => {
  if (visiting.has(token)) throw new Error(`token cycle detected: ${[...path, token].join(' -> ')}`);
  if (visited.has(token)) return;
  visiting.add(token);
  for (const dependency of graph.get(token) ?? []) walk(dependency, [...path, token]);
  visiting.delete(token);
  visited.add(token);
};
for (const token of declarations.keys()) walk(token);

const deprecated = [...declarations.keys()].filter((token) => token.includes('deprecated'));
if (deprecated.length) throw new Error(`deprecated token declarations are not allowed: ${deprecated.join(', ')}`);
console.log(`Design tokens valid: ${declarations.size} declarations, ${references.length} references, no unknowns, duplicates or cycles.`);
