const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const root = path.resolve(__dirname, '..');
const host = '199.89.54.243';
const remoteDir = '/var/www/vhosts/gestion.exacontable.com/httpdocs';
const plink = 'C:\\Program Files\\PuTTY\\plink.exe';
const knownHosts = path.join(process.env.USERPROFILE || '', '.ssh', 'known_hosts');
const env = fs.readFileSync(path.join(root, '.env'), 'utf8');
const match = env.match(/^\s*#\s*DATABASE_PASSWORD=(.+)\s*$/m)
  || env.match(/^\s*DATABASE_PASSWORD=(.+)\s*$/m);
if (!match?.[1]) throw new Error('No se encontro la credencial de produccion.');
const password = match[1].trim().replace(/^["']|["']$/g, '');
const keyLine = fs.readFileSync(knownHosts, 'utf8')
  .split(/\r?\n/).find((line) => line.startsWith(host + ' ssh-rsa '));
if (!keyLine) throw new Error('No existe una clave SSH conocida para el servidor.');
const keyParts = keyLine.split(' ');
const hostKey = keyParts[1] + ' ' + keyParts[2];
const sha = process.env.DEPLOY_SHA || '7f62c1f';
const prelude = `set -eu
export PATH=/opt/plesk/node/26/bin:/usr/bin:/bin
cd ${remoteDir}
`;
const scripts = {
  inspect: prelude + `printf 'BRANCH='; git branch --show-current
printf 'HEAD='; git rev-parse HEAD
git status --short
`,
  pull: prelude + `git branch --show-current | grep -qx main
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo LOCAL_CHANGES
  git status --short
  exit 12
fi
git pull --ff-only origin main
printf 'HEAD='; git rev-parse HEAD
`,
  build: prelude + `mkdir -p logs
if test -e logs/next-build-${sha}.exit; then
  echo BUILD_ALREADY_STARTED
  exit 13
fi
setsid sh -c 'npm run build > logs/next-build.log 2>&1; echo $? > logs/next-build-${sha}.exit' > /dev/null 2>&1 < /dev/null &
echo BUILD_STARTED
`,
  build_status: prelude + `if test -f logs/next-build-${sha}.exit; then
  printf 'BUILD_EXIT='; cat logs/next-build-${sha}.exit
  tail -n 18 logs/next-build.log
else
  echo BUILD_RUNNING
  tail -n 5 logs/next-build.log
fi
`,
  restart: prelude + `test -f logs/next-build-${sha}.exit
grep -qx 0 logs/next-build-${sha}.exit
fuser -k 3010/tcp || true
sleep 2
PORT=3010 NODE_ENV=production setsid /opt/plesk/node/26/bin/node server.js >> /var/www/vhosts/gestion.exacontable.com/logs/node3010.log 2>&1 < /dev/null &
echo RESTARTED
`,
};
const phase = process.argv[2];
if (!scripts[phase]) throw new Error('Fase desconocida.');
const child = spawn(plink, ['-ssh', '-batch', '-pw', password, '-hostkey', hostKey,
  `root@${host}`, 'bash -s'], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
let output = '';
let error = '';
child.stdout.on('data', (chunk) => { output += chunk.toString('utf8'); });
child.stderr.on('data', (chunk) => { error += chunk.toString('utf8'); });
child.on('error', (err) => { console.error(err.message); process.exitCode = 1; });
child.on('close', (code) => {
  const redact = (value) => value.split(password).join('[redacted]');
  process.stdout.write(redact(output));
  process.stderr.write(redact(error));
  if (code) process.exitCode = code;
});
child.stdin.end(scripts[phase]);
