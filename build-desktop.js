import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { rcedit } from 'rcedit';

const configFile = 'neutralino.config.json';
const devConfig = fs.readFileSync(configFile, 'utf8');
const config = JSON.parse(devConfig);
const args = new Set(process.argv.slice(2));
const standalone = args.has('--standalone');
const release = args.has('--release');
const clean = args.has('--clean');

// Switch to Prod settings
config.documentRoot = 'dist/';
config.url = '/';
config.modes.window.enableInspector = false; // Disable inspector for prod

console.log('Switching to Production Config...');
fs.writeFileSync(configFile, JSON.stringify(config, null, 2));

try {
    // Generate .ico from public/app-icon.svg (if present)
    execSync('node scripts/generate-windows-icon.js', { stdio: 'inherit', shell: true });

    const flags = [];
    if (standalone) flags.push('--embed-resources');
    if (release) flags.push('--release');
    const resourcesPath = (config.cli?.resourcesPath || '').replace(/^\/+/, '');
    const distributionPath = (config.cli?.distributionPath || '').replace(/^\/+/, '');
    const canClean = clean && resourcesPath !== distributionPath;
    if (clean && !canClean) {
        console.log('Skipping --clean because resourcesPath and distributionPath are the same directory.');
    }
    if (canClean) flags.push('--clean');

    const cmd = `npx neu build${flags.length ? ` ${flags.join(' ')}` : ''}`;
    console.log(`Running Neutralino Build: ${cmd}`);
    execSync(cmd, { stdio: 'inherit', shell: true });

    const binaryName = config?.cli?.binaryName || 'nocode-x-studio';
    const exePath = path.join(process.cwd(), 'dist', binaryName, `${binaryName}-win_x64.exe`);
    const iconPath = path.join(process.cwd(), 'installer', 'assets', 'app.ico');
    if (fs.existsSync(exePath) && fs.existsSync(iconPath)) {
      console.log(`Patching EXE icon: ${exePath}`);
      await rcedit(exePath, { icon: iconPath });
    } else {
      console.warn('Skipping EXE icon patch. Missing exe or icon file.');
    }
} catch (e) {
    console.error('Desktop build failed.');
    process.exit(1);
} finally {
    // Restore Dev settings
    fs.writeFileSync(configFile, devConfig);
    console.log('Restored Development Config.');
}
