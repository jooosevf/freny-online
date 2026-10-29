// Checks a run log the way api/run/finish does, without the ticket or the login:
//   node tools/check-run.js <arena-run.json> [real seconds]
// The Unity editor writes the last Arena run to Logs/arena-run.json. Without real seconds it
// assumes the run took its game time. Also prints the busiest 10 s, to tune MAX_KILLS_PER_WINDOW.
import fs from 'node:fs';
import { validateRun } from '../api/_lib/validate.js';
import { KILL_WINDOW_SECONDS, MAX_KILLS_PER_WINDOW } from '../api/_lib/rules.js';

const run = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const real = process.argv[3] ? Number(process.argv[3]) : run.gameTime;
let busiest = 0;
for (let i = 0, first = 0; i < run.kills.length; i++) {
  while (run.kills[i][0] - run.kills[first][0] >= KILL_WINDOW_SECONDS) first++;
  busiest = Math.max(busiest, i - first + 1);
}
console.log(`${run.board}: ${run.score} points, ${run.kills.length} kills in ${run.gameTime.toFixed(1)} game s`);
console.log(`busiest ${KILL_WINDOW_SECONDS} s: ${busiest} kills (limit ${MAX_KILLS_PER_WINDOW})`);
console.log('verdict:', validateRun(run, real) || 'accepted');
