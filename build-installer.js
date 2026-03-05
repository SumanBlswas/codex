import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const root = process.cwd();
const configPath = path.join(root, 'neutralino.config.json');
const scriptPath = path.join(root, 'installer', 'windows-installer.nsi');

if (!fs.existsSync(configPath)) {
  console.error('neutralino.config.json not found.');
  process.exit(1);
}
if (!fs.existsSync(scriptPath)) {
  console.error('installer/windows-installer.nsi not found.');
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const binaryName = config?.cli?.binaryName || 'nocode-x-studio';
const appName = config?.modes?.window?.title || 'Nocode X Studio';
const appVersion = config?.version || '1.0.0';
const iconPath = path.join(root, 'installer', 'assets', 'app.ico');

const winExeName = `${binaryName}-win_x64.exe`;
const winExePath = path.join(root, 'dist', binaryName, winExeName);
if (!fs.existsSync(winExePath)) {
  console.error(`Windows binary not found: ${winExePath}`);
  console.error('Run `npm run desktop:build:standalone` first.');
  process.exit(1);
}

const outputPath = path.join(root, 'dist', `${binaryName}-setup-${appVersion}.exe`);
const q = (v) => `"${String(v).replace(/"/g, '\\"')}"`;

const commandExists = (command) => {
  try {
    execSync(`where ${command}`, { stdio: 'ignore', shell: true });
    return true;
  } catch {
    return false;
  }
};

const resolveMakensis = () => {
  if (process.env.MAKENSIS && fs.existsSync(process.env.MAKENSIS)) {
    return process.env.MAKENSIS;
  }

  const bundledCandidates = [
    path.join(root, 'tools', 'nsis', 'makensis.exe'),
    path.join(root, 'vendor', 'nsis', 'makensis.exe'),
    path.join(root, 'nsis', 'makensis.exe'),
    path.join(root, 'bin', 'nsis', 'makensis.exe'),
    path.join(root, 'bin', 'makensis.exe'),
  ];
  for (const candidate of bundledCandidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  if (commandExists('makensis')) {
    return 'makensis';
  }

  const candidates = [
    'C:\\Program Files (x86)\\NSIS\\makensis.exe',
    'C:\\Program Files\\NSIS\\makensis.exe',
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
};

const makensis = resolveMakensis();
if (!makensis) {
  console.error('NSIS compiler not found.');
  console.error('Supported locations:');
  console.error(`- ${path.join(root, 'tools', 'nsis', 'makensis.exe')}`);
  console.error(`- ${path.join(root, 'vendor', 'nsis', 'makensis.exe')}`);
  console.error(`- ${path.join(root, 'nsis', 'makensis.exe')}`);
  console.error('- C:\\Program Files (x86)\\NSIS\\makensis.exe');
  console.error('- C:\\Program Files\\NSIS\\makensis.exe');
  console.error('Or set MAKENSIS env var to your makensis.exe path.');
  process.exit(1);
}
const makensisCmd = /[\\/\s]/.test(makensis) ? q(makensis) : makensis;

const command = [
  makensisCmd,
  `/DAPP_NAME=${q(appName)}`,
  `/DAPP_VERSION=${q(appVersion)}`,
  `/DAPP_BINARY_NAME=${q(winExeName)}`,
  `/DAPP_EXE=${q(winExePath)}`,
  `/DAPP_ICON=${q(iconPath)}`,
  `/DOUTPUT_FILE=${q(outputPath)}`,
  q(scriptPath),
].join(' ');

console.log('Building NSIS installer...');
console.log(command);

try {
  execSync('node scripts/generate-windows-icon.js', { stdio: 'inherit', shell: true });
  execSync(command, { stdio: 'inherit', shell: true });
  console.log(`Installer created: ${outputPath}`);
} catch (error) {
  console.error('NSIS build failed.');
  process.exit(1);
}
