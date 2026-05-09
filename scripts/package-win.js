const path = require('path');
const fs = require('fs');
const childProcess = require('child_process');
const packager = require('electron-packager');

function findISCC() {
  const envPath = process.env.ISCC_PATH;
  if (envPath && fs.existsSync(envPath)) {
    return envPath;
  }

  const candidates = [
    path.join(process.env['ProgramFiles(x86)'] || '', 'Inno Setup 6', 'ISCC.exe'),
    path.join(process.env['ProgramFiles'] || '', 'Inno Setup 6', 'ISCC.exe'),
  ];

  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return 'ISCC';
}

async function run() {
  const projectRoot = path.resolve(__dirname, '..');
  const outDir = path.join(projectRoot, 'dist-windows');
  const stagingDir = path.join(projectRoot, 'dist-windows-staging');
  const appName = 'Bardelas';
  const appVersion = require(path.join(projectRoot, 'package.json')).version;

  if (fs.existsSync(outDir)) {
    fs.rmSync(outDir, { recursive: true, force: true });
  }

  if (fs.existsSync(stagingDir)) {
    fs.rmSync(stagingDir, { recursive: true, force: true });
  }

  fs.mkdirSync(stagingDir, { recursive: true });
  fs.cpSync(path.join(projectRoot, 'dist'), path.join(stagingDir, 'dist'), { recursive: true });
  fs.copyFileSync(path.join(projectRoot, 'package.json'), path.join(stagingDir, 'package.json'));
  if (fs.existsSync(path.join(projectRoot, 'package-lock.json'))) {
    fs.copyFileSync(path.join(projectRoot, 'package-lock.json'), path.join(stagingDir, 'package-lock.json'));
  }

  const iconPath = path.join(projectRoot, 'bardelasbrowser.ico');
  if (fs.existsSync(iconPath)) {
    fs.copyFileSync(iconPath, path.join(stagingDir, 'bardelasbrowser.ico'));
  }

  console.log('Packaging Windows app folder...');
  const appPaths = await packager({
    dir: stagingDir,
    out: outDir,
    overwrite: true,
    platform: 'win32',
    arch: 'x64',
    executableName: appName,
    appBundleId: 'com.bardelas.browser',
    appVersion,
    asar: false,
    prune: false,
    win32metadata: {
      CompanyName: 'Bardelas',
      FileDescription: 'Bardelas browser launcher',
      OriginalFilename: `${appName}.exe`,
      ProductName: appName,
    },
  });

  if (appPaths.length === 0) {
    throw new Error('electron-packager did not produce any output.');
  }

  const packagedPath = appPaths[0];
  const zipOutput = path.join(outDir, `${appName}-win32-x64.zip`);
  if (fs.existsSync(zipOutput)) {
    fs.unlinkSync(zipOutput);
  }

  console.log('Creating zip artifact...');
  const zipCommand = `powershell -NoProfile -Command "Compress-Archive -Path '${packagedPath}\\*' -DestinationPath '${zipOutput}' -Force"`;
  childProcess.execSync(zipCommand, { stdio: 'inherit' });

  console.log('Compiling installer with Inno Setup...');
  const isccPath = findISCC();
  const issScript = path.join(__dirname, 'BardelasInstaller.iss');
  const outputBase = `${appName}-Setup-${appVersion}`;
  const isccCommand = `"${isccPath}" /DSourceDir="${packagedPath}" /F"${outputBase}" /O"${outDir}" "${issScript}"`;

  try {
    childProcess.execSync(isccCommand, { stdio: 'inherit', cwd: projectRoot });
  } catch (error) {
    console.error('Inno Setup compilation failed. Make sure Inno Setup is installed and ISCC is on your PATH or set ISCC_PATH.');
    throw error;
  }

  if (fs.existsSync(stagingDir)) {
    fs.rmSync(stagingDir, { recursive: true, force: true });
  }

  const installerPath = path.join(outDir, `${outputBase}.exe`);
  if (!fs.existsSync(installerPath)) {
    throw new Error(`Installer was not created at expected path: ${installerPath}`);
  }

  console.log('Windows installer created:');
  console.log(`  App folder: ${packagedPath}`);
  console.log(`  Zip artifact: ${zipOutput}`);
  console.log(`  Installer: ${installerPath}`);
}

run().catch((error) => {
  console.error('Windows packaging failed:', error);
  process.exit(1);
});
