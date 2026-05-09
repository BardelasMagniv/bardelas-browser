import { app, BrowserWindow, dialog } from 'electron';
import childProcess from 'child_process';
import fs from 'fs';
import path from 'path';
import Module from 'module';

const isDev = process.env.NODE_ENV !== 'production';
const appRoot = app.getAppPath();
const userDataRoot = app.getPath('userData');
const appNodeModules = path.join(appRoot, 'node_modules');
const runtimeDepsRoot = path.join(userDataRoot, 'app-deps');
const runtimeNodeModules = path.join(runtimeDepsRoot, 'node_modules');
const packageJsonPath = path.join(appRoot, 'package.json');
const lockfilePath = path.join(appRoot, 'package-lock.json');

let installWindow: BrowserWindow | null = null;

function createInstallWindow() {
  const win = new BrowserWindow({
    width: 480,
    height: 220,
    resizable: false,
    minimizable: false,
    maximizable: false,
    closable: false,
    frame: false,
    alwaysOnTop: true,
    center: true,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
    },
  });

  const html = `data:text/html;charset=utf-8,${encodeURIComponent(`
    <html>
      <head>
        <meta charset="UTF-8" />
        <style>
          body { margin:0; font-family: Inter, Arial, sans-serif; background:#111827; color:#ffffff; display:flex; align-items:center; justify-content:center; height:100vh; }
          .card { width:92%; padding:20px; border-radius:16px; background:#1f2937; box-shadow:0 20px 50px rgba(0,0,0,0.35); }
          h1 { margin:0 0 12px; font-size:20px; }
          p { margin:0; line-height:1.6; color:#d1d5db; }
          .progress { margin-top:18px; height:10px; border-radius:9999px; background:#374151; overflow:hidden; }
          .bar { width:100%; height:100%; background:linear-gradient(90deg, #38bdf8, #818cf8); animation: pulse 2s infinite; }
          @keyframes pulse { 0%,100% { transform: translateX(-25%); } 50% { transform: translateX(25%); } }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>Installing Bardelas...</h1>
          <p>Your app is being prepared for first use. This may take a few minutes while dependencies are installed.</p>
          <div class="progress"><div class="bar"></div></div>
        </div>
      </body>
    </html>
  `)}`;

  win.loadURL(html);
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => {
    installWindow = null;
  });
  return win;
}

function addModuleSearchPath(directory: string) {
  const resolved = path.resolve(directory);
  const nativeModule = Module as any;

  if (!nativeModule.globalPaths.includes(resolved)) {
    nativeModule.globalPaths.unshift(resolved);
  }

  process.env.NODE_PATH = resolved;
  nativeModule._initPaths();
}

function canWriteToDirectory(directory: string) {
  try {
    fs.accessSync(directory, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

function copyPackageSources(destination: string) {
  if (!fs.existsSync(destination)) {
    fs.mkdirSync(destination, { recursive: true });
  }

  fs.copyFileSync(packageJsonPath, path.join(destination, 'package.json'));

  if (fs.existsSync(lockfilePath)) {
    fs.copyFileSync(lockfilePath, path.join(destination, 'package-lock.json'));
  }
}

function runNpmInstall(cwd: string) {
  return new Promise<void>((resolve, reject) => {
    const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const install = childProcess.spawn(npmCommand, ['install', '--production', '--no-save'], {
      cwd,
      env: {
        ...process.env,
        npm_config_loglevel: 'warn',
      },
      stdio: 'inherit',
    });

    install.on('error', reject);
    install.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`npm install exited with code ${code}`));
      }
    });
  });
}

async function prepareDependencies() {
  if (fs.existsSync(appNodeModules)) {
    addModuleSearchPath(appNodeModules);
    return;
  }

  if (fs.existsSync(runtimeNodeModules)) {
    addModuleSearchPath(runtimeNodeModules);
    return;
  }

  const targetRoot = canWriteToDirectory(appRoot) ? appRoot : runtimeDepsRoot;

  if (targetRoot === appRoot) {
    await runNpmInstall(appRoot);
    addModuleSearchPath(appNodeModules);
  } else {
    copyPackageSources(runtimeDepsRoot);
    await runNpmInstall(runtimeDepsRoot);
    addModuleSearchPath(runtimeNodeModules);
  }
}

async function bootstrap() {
  if (isDev) {
    require('./index.js');
    return;
  }

  await app.whenReady();
  installWindow = createInstallWindow();

  try {
    await prepareDependencies();
    installWindow.close();
    require('./index.js');
  } catch (error) {
    if (installWindow) {
      installWindow.close();
    }
    throw error;
  }
}

bootstrap().catch((error) => {
  console.error(error);

  const showError = () => {
    dialog.showErrorBox(
      'Startup failed',
      `Bardelas could not complete startup:\n\n${String(error)}\n\nIf the installer fails, please retry with an internet connection.`
    );
  };

  if (app.isReady()) {
    showError();
  } else {
    app.whenReady().then(showError);
  }

  app.quit();
});
