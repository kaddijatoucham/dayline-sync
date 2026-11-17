import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDailyReport, toISO } from '../public/coach.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DATA_FILE = path.join(ROOT, 'data', 'state.json');
const args = process.argv.slice(2);
const date = args.find((arg) => /^\d{4}-\d{2}-\d{2}$/.test(arg)) || toISO(new Date());
const shouldWrite = args.includes('--write');
const stateFlag = args.indexOf('--state');
const dataFile = stateFlag >= 0 && args[stateFlag + 1] ? path.resolve(args[stateFlag + 1]) : DATA_FILE;

let state;
try {
  state = JSON.parse(await fs.readFile(dataFile, 'utf8'));
} catch {
  console.error(`No tracker data at ${dataFile}. Run "npm start" once to create it, or pass --state <file>.`);
  process.exit(1);
}

const report = buildDailyReport(state, date);

if (shouldWrite) {
  const reportsDir = path.join(ROOT, 'reports');
  await fs.mkdir(reportsDir, { recursive: true });
  const outFile = path.join(reportsDir, `${date}.md`);
  await fs.writeFile(outFile, report, 'utf8');
  console.error(`Wrote ${outFile}`);
}

process.stdout.write(report);
