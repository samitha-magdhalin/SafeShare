import './style.css';

const root = document.getElementById('root');

function showStartupFailure(code: string): void {
  if (!root) return;
  root.innerHTML = '';
  const main = document.createElement('main');
  main.className = 'boot-fallback';
  const content = document.createElement('div');
  const heading = document.createElement('h1');
  heading.textContent = 'SafeShare Agent could not start.';
  const guidance = document.createElement('p');
  guidance.textContent = 'Please restart the application.';
  const diagnostic = document.createElement('small');
  diagnostic.textContent = 'Diagnostic code: ' + code;
  content.append(heading, guidance, diagnostic);
  main.append(content);
  root.append(main);
}

window.addEventListener('error', () => showStartupFailure('BOOT_RUNTIME'));
window.addEventListener('unhandledrejection', () => showStartupFailure('BOOT_ASYNC'));

async function bootstrap(): Promise<void> {
  if (!root) return;
  try {
    const [{ StrictMode }, { createRoot }, { default: App }] = await Promise.all([
      import('react'),
      import('react-dom/client'),
      import('./App'),
    ]);
    createRoot(root).render(<StrictMode><App /></StrictMode>);
  } catch {
    showStartupFailure('BOOT_MODULE');
  }
}

void bootstrap();