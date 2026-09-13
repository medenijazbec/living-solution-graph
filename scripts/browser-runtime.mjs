import fs from 'node:fs';
import path from 'node:path';

export function browserLaunchOptions(){
  const candidates=[
    process.env.LSG_BROWSER_EXECUTABLE,
    process.platform==='win32'?path.join(process.env['PROGRAMFILES(X86)']||'','Microsoft','Edge','Application','msedge.exe'):null,
    process.platform==='win32'?path.join(process.env.PROGRAMFILES||'','Google','Chrome','Application','chrome.exe'):null,
    process.platform==='win32'?path.join(process.env.LOCALAPPDATA||'','Google','Chrome','Application','chrome.exe'):null
  ].filter(Boolean);
  const executablePath=candidates.find(candidate=>fs.existsSync(candidate));
  return executablePath?{executablePath}:{};
}
