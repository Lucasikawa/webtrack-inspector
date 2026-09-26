// Copia as bibliotecas usadas em tempo de execução para extension/lib.
// A extensão é versionada já com essas cópias, para que possa ser carregada
// diretamente pelo about:debugging, sem etapa de build.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const LIB = 'extension/lib';
mkdirSync(LIB, { recursive: true });

// tldts: eTLD+1 a partir da Public Suffix List (licença MIT).
const tldts = readFileSync('node_modules/tldts/dist/index.umd.min.js', 'utf8')
  .replace(/\n?\/\/# sourceMappingURL=.*$/m, '');
const { version } = JSON.parse(readFileSync('node_modules/tldts/package.json', 'utf8'));
writeFileSync(`${LIB}/tldts.min.js`, `/*! tldts ${version} | MIT */\n${tldts}\n`);
copyFileSync('node_modules/tldts/LICENSE', `${LIB}/tldts.LICENSE`);

console.log(`tldts ${version} copiado para ${LIB}/`);
