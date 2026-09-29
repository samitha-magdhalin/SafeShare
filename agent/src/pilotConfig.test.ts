import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(import.meta.dirname, '..');
const config = JSON.parse(readFileSync(join(root, 'src-tauri', 'tauri.conf.json'), 'utf8'));
const cargo = readFileSync(join(root, 'src-tauri', 'Cargo.toml'), 'utf8');
const rust = readFileSync(join(root, 'src-tauri', 'src', 'lib.rs'), 'utf8');
const mainRust = readFileSync(join(root, 'src-tauri', 'src', 'main.rs'), 'utf8');
const vite = readFileSync(join(root, 'vite.config.ts'), 'utf8');
const capability = JSON.parse(readFileSync(join(root, 'src-tauri', 'capabilities', 'default.json'), 'utf8'));

describe('Windows pilot release configuration', () => {
  it('uses stable pilot identity and a current-user NSIS bundle', () => {
    expect(config.productName).toBe('SafeShare Agent');
    expect(config.identifier).toBe('app.safeshare.agent');
    expect(config.version).toBe('0.1.0');
    expect(config.app.windows[0].title).toBe('SafeShare Agent');
    expect(config.app.windows[0].backgroundColor).toBe('#f4f8f6');
    expect(config.bundle.active).toBe(true);
    expect(config.bundle.targets).toEqual(['nsis']);
    expect(config.bundle.windows.nsis.installMode).toBe('currentUser');
  });

  it('uses the supported small WebView2 bootstrapper strategy', () => {
    expect(config.bundle.windows.webviewInstallMode).toEqual({
      type: 'downloadBootstrapper',
      silent: true,
    });
  });

  it('builds the Windows executable as a GUI subsystem binary', () => {
    expect(mainRust).toContain('#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]');
    expect(rust).not.toContain('windows_subsystem');
  });
  it('registers the official single-instance plugin before other plugins', () => {
    expect(cargo).toContain('tauri-plugin-single-instance');
    const single = rust.indexOf('.plugin(tauri_plugin_single_instance::init');
    const notification = rust.indexOf('.plugin(tauri_plugin_notification::init');
    expect(single).toBeGreaterThan(0);
    expect(single).toBeLessThan(notification);
    expect(rust).toContain('window.show()');
    expect(rust).toContain('window.set_focus()');
  });

  it('keeps startup disabled and does not add manual persistence mechanisms', () => {
    const combined = JSON.stringify(config) + cargo + rust;
    expect(combined).not.toMatch(/autostart|Run\\|scheduled task|startup script/i);
  });

  it('uses bundled frontend assets without developer paths or source maps', () => {
    expect(config.build.frontendDist).toBe('../dist');
    expect(config.build.devUrl).toBe('http://localhost:1420');
    expect(vite).toContain("base:'./'");
    expect(JSON.stringify(config.bundle)).not.toMatch(/[A-Z]:\\|D:\\SafeShare|Users\\joelk/i);
    expect(vite).toContain('sourcemap:false');
  });

  it('keeps WebView permissions minimal and screenshot persistence absent', () => {
    expect(capability.permissions).toEqual(['core:default']);
    expect(rust.match(/fs::write\(/g)).toHaveLength(1);
    expect(rust).toContain('team-policy-cache.json');
  });

  it('uses a dynamic release path-remapping wrapper without personal paths', () => {
    const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    const buildScript = readFileSync(join(root, 'scripts', 'build-pilot.mjs'), 'utf8');
    expect(packageJson.scripts['build:pilot']).toBe('node scripts/build-pilot.mjs');
    expect(buildScript).toContain('--remap-path-prefix=');
    expect(buildScript).toContain('homedir()');
    expect(buildScript).not.toMatch(/Users[\\/]joelk|D:[\\/]SafeShare/i);
  });

  it('keeps the packaged WebView opaque and provides a safe pre-React startup fallback', () => {
    const css = readFileSync(join(root, 'src', 'style.css'), 'utf8');
    const html = readFileSync(join(root, 'index.html'), 'utf8');
    const entry = readFileSync(join(root, 'src', 'main.tsx'), 'utf8');
    expect(css).toContain('html,body,#root{min-height:100%;background:#f4f8f6}');
    expect(html).toContain('SafeShare Agent is starting.');
    expect(entry).toContain("showStartupFailure('BOOT_MODULE')");
    expect(entry).not.toMatch(/stack|token|ocr|finding|clipboard/i);
  });
  it('contains no signing bypass or updater configuration', () => {
    const serialized = JSON.stringify(config);
    expect(serialized).not.toMatch(/certificateThumbprint|signCommand|updater|disable.*smartscreen/i);
  });
});
