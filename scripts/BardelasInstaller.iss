#define AppName "Bardelas"
#define AppVersion "0.1.0"
#define AppPublisher "Bardelas"
#define AppPublisherURL "https://bardelas.example.com"
#define AppExeName "Bardelas.exe"
#define AppID "com.bardelas.browser"
#ifndef SourceDir
  #define SourceDir "..\dist-windows\Bardelas-win32-x64"
#endif
#define SetupIconFile "..\bardelasbrowser.ico"

[Setup]
AppId={#AppID}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
AppPublisherURL={#AppPublisherURL}
AppVerName={#AppName} {#AppVersion}
DefaultDirName={commonpf}\{#AppName}
DefaultGroupName={#AppName}
DisableProgramGroupPage=no
AllowNoIcons=no
OutputDir=..\dist-windows
OutputBaseFilename={#AppName}-Setup-{#AppVersion}
Compression=lzma2
SolidCompression=yes
SetupIconFile={#SetupIconFile}
UninstallDisplayIcon={app}\{#AppExeName}
WizardStyle=modern
PrivilegesRequired=admin
ArchitecturesAllowed=x64os
ArchitecturesInstallIn64BitMode=x64os

[Tasks]
Name: "desktopicon"; Description: "Create a &desktop icon"; GroupDescription: "Additional icons:"; Flags: unchecked

[Files]
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#AppName}"; Filename: "{app}\{#AppExeName}"
Name: "{userdesktop}\{#AppName}"; Filename: "{app}\{#AppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#AppExeName}"; Description: "Launch {#AppName}"; Flags: nowait postinstall skipifsilent
