// Roda a escada de dificuldade (N0..N3) para 60 m, 20 m (com/sem margem) e 5 m (LOLA 5 m, LOLA 5 m + margem, Oráculo),
// nas baterias COM teto (TMAX=800s) e SEM teto (TMAX=4000s), em paralelo usando múltiplos núcleos.
// Uso: POP=100 node rodar_dif_multi.js [--so-teto | --so-semteto]
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const POP = +(process.env.POP || 100);
const CFGS = ['R60', 'RT_nom', 'R20', 'R20_marg', 'RT20', 'RLOLA5', 'RLOLA5_marg', 'R_oraculo'];
const NIVS = [0, 1, 2, 3];
const BATS = [];
if (!process.argv.includes('--so-semteto')) BATS.push({ nome: 'com_teto', semTeto: '0', tMax: '800', outDir: 'lola_dif_teto' });
if (!process.argv.includes('--so-teto')) BATS.push({ nome: 'sem_teto', semTeto: '1', tMax: '4000', outDir: 'lola_dif_semteto' });

const jobs = [];
for (const b of BATS) {
  for (const niv of NIVS) {
    for (const cfg of CFGS) {
      const tag = `_N${niv}`;
      const outPath = path.join(__dirname, b.outDir, `${cfg}${tag}.json`);
      if (fs.existsSync(outPath) && !process.argv.includes('--force')) continue;
      jobs.push({ b, niv, cfg, tag });
    }
  }
}

const maxWorkers = Math.min(16, os.cpus().length, Math.max(1, jobs.length));
console.log(`Jobs pendentes: ${jobs.length} (POP=${POP}, workers=${maxWorkers}, CPUs=${os.cpus().length})`);

async function main() {
  const t0 = Date.now();
  let idx = 0, done = 0;
  const worker = async () => {
    while (idx < jobs.length) {
      const j = jobs[idx++];
      await new Promise((resolve) => {
        const p = spawn(process.execPath, [path.join(__dirname, 'exp_dif.js')], {
          env: {
            ...process.env,
            CFG: j.cfg,
            NIV: String(j.niv),
            POP: String(POP),
            TAG: j.tag,
            SEMTETO: j.b.semTeto,
            TMAX: j.b.tMax,
            OUT_DIR: j.b.outDir,
          },
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        let out = '', err = '';
        p.stdout.on('data', (d) => { out += d.toString(); });
        p.stderr.on('data', (d) => { err += d.toString(); });
        p.on('close', (code) => {
          done++;
          const lines = out.trim().split('\n').filter(Boolean);
          const summary = lines.length ? lines[lines.length - 1] : '';
          console.log(`[${done}/${jobs.length}] (${j.b.nome}) ${summary}`);
          if (code !== 0) console.error(`ERRO [${j.b.nome} ${j.cfg}${j.tag}] code=${code}:\n${err}`);
          resolve();
        });
      });
    }
  };
  await Promise.all(Array.from({ length: maxWorkers }, () => worker()));
  console.log(`Bateria completa finalizada em ${((Date.now() - t0) / 60000).toFixed(2)} min.`);
}

main();
