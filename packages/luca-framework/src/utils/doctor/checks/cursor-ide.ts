import { existsSync } from 'fs';
import { join } from 'pathe';
import type { CheckResult, DoctorCheck } from '../types';

export const cursorIdeCheck: DoctorCheck = {
  name: 'Cursor IDE',

  async run(): Promise<CheckResult> {
    const isMac = process.platform === 'darwin';
    const isWindows = process.platform === 'win32';
    const isLinux = process.platform === 'linux';

    let cursorFound = false;
    let details = 'Could not find Cursor IDE installation';

    if (isMac) {
      const macPaths = [
        '/Applications/Cursor.app',
        join(process.env.HOME || '', 'Applications/Cursor.app'),
      ];
      cursorFound = macPaths.some(p => existsSync(p));
      details = cursorFound ? 'Found Cursor.app in Applications' : details;
    } else if (isWindows) {
      const localAppData = process.env.LOCALAPPDATA || '';
      const winPath = join(localAppData, 'Programs', 'cursor', 'Cursor.exe');
      cursorFound = existsSync(winPath);
      details = cursorFound ? 'Found Cursor.exe in LocalAppData' : details;
    } else if (isLinux) {
      // Linux check is harder due to AppImage/etc, but we can check common locations
      const linuxPaths = [
        '/usr/bin/cursor',
        '/usr/local/bin/cursor',
      ];
      cursorFound = linuxPaths.some(p => existsSync(p));
      details = cursorFound ? 'Found cursor binary in PATH' : details;
    }

    if (cursorFound) {
      return {
        name: this.name,
        status: 'pass',
        message: 'Cursor IDE detected',
        fixCommand: null,
        details,
      };
    }

    return {
      name: this.name,
      status: 'warning',
      message: 'Cursor IDE not detected',
      fixCommand: 'Download from https://cursor.sh/',
      details: 'Luca works best with Cursor IDE for AI-powered workflows.',
    };
  },
};
