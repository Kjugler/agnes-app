import { register } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const srcRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../src');

register(
  'data:text/javascript,' +
    encodeURIComponent(`
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('node:') || specifier.startsWith('file:') || specifier.startsWith('data:')) {
    return nextResolve(specifier, context);
  }
  const path = await import('node:path');
  const url = await import('node:url');
  const fs = await import('node:fs');
  if (specifier.startsWith('@/')) {
    let target = path.resolve(${JSON.stringify(srcRoot)}, specifier.slice(2));
    if (fs.existsSync(target + '.ts')) target += '.ts';
    else if (fs.existsSync(target + '.tsx')) target += '.tsx';
    return nextResolve(url.pathToFileURL(target).href, context);
  }
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && context.parentURL && context.parentURL.startsWith('file:')) {
    const parent = url.fileURLToPath(context.parentURL);
    const candidate = path.resolve(path.dirname(parent), specifier);
    if (!path.extname(candidate) && fs.existsSync(candidate + '.ts')) {
      return nextResolve(url.pathToFileURL(candidate + '.ts').href, context);
    }
  }
  return nextResolve(specifier, context);
}
`),
);
