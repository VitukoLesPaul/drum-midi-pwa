import pkg from '@tonejs/midi';
const { Midi } = pkg;
import { readFileSync } from 'fs';

const path = process.argv[2];
if (!path) { console.error('Uso: node scripts/dump-midi.mjs archivo.mid'); process.exit(1); }

const midi = new Midi(readFileSync(path));
console.log('Tempo(s):', midi.header.tempos.map(t => t.bpm).join(', ') || '(ninguno)');
console.log('Compases:', midi.header.timeSignatures.length);

midi.tracks.forEach((track, ti) => {
  console.log(`\n=== Track ${ti} "${track.name || '(sin nombre)'}" canal ${track.channel} — ${track.notes.length} notas ===`);
  track.notes.forEach(n => {
    console.log(`t=${n.time.toFixed(3)}  pitch=${n.midi}  dur=${n.duration.toFixed(3)}  vel=${n.velocity.toFixed(2)}`);
  });
});
