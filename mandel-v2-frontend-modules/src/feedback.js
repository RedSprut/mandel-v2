const DEFAULT_TOAST_DURATION = 2000;
const DEFAULT_BUTTON_DURATION = 1500;
const buttonTimers = new WeakMap();

export async function copyTextToClipboard(text) {
  if (navigator.clipboard?.writeText && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch (error) {
      // Some mobile browsers expose the modern API but still reject it until
      // permissions settle. The legacy path can still work inside the tap.
    }
  }

  fallbackCopy(text);
}

export async function copyRowsToClipboard({
  button,
  rows,
  toText,
  copiedLabel = 'Copied! ✅',
  successMessage = 'Copied',
  errorMessage = 'Copy failed',
  toastDuration = DEFAULT_TOAST_DURATION,
  buttonDuration = DEFAULT_BUTTON_DURATION
}) {
  const text = typeof toText === 'function' ? toText(rows) : String(toText || '');

  try {
    await copyTextToClipboard(text);
    setCopiedButtonState(button, copiedLabel, buttonDuration);
    showToast({ message: successMessage, type: 'success', duration: toastDuration, icon: '✅' });
    return { ok: true, text };
  } catch (error) {
    showToast({ message: errorMessage, type: 'error', duration: toastDuration, icon: '⚠️' });
    return { ok: false, error };
  }
}

export function showToast({
  message,
  type = 'success',
  duration = DEFAULT_TOAST_DURATION,
  icon = '✅'
}) {
  const root = ensureToastRoot();
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.setAttribute('role', 'status');

  const iconNode = document.createElement('span');
  iconNode.className = 'toast-icon';
  iconNode.textContent = icon;

  const messageNode = document.createElement('span');
  messageNode.className = 'toast-message';
  messageNode.textContent = message;

  toast.append(iconNode, messageNode);
  root.append(toast);

  const hideDelay = Math.max(duration - 180, 0);
  window.setTimeout(() => toast.classList.add('is-hiding'), hideDelay);
  window.setTimeout(() => toast.remove(), duration);
}

export function setCopiedButtonState(button, copiedLabel = 'Copied! ✅', duration = DEFAULT_BUTTON_DURATION) {
  if (!button) return;

  const previousTimer = buttonTimers.get(button);
  if (previousTimer) window.clearTimeout(previousTimer);

  if (!button.dataset.defaultLabel) {
    button.dataset.defaultLabel = button.textContent.trim();
  }

  button.textContent = copiedLabel;
  button.classList.add('is-copied');

  const timer = window.setTimeout(() => {
    button.textContent = button.dataset.defaultLabel || '';
    button.classList.remove('is-copied');
    buttonTimers.delete(button);
  }, duration);

  buttonTimers.set(button, timer);
}

function ensureToastRoot() {
  let root = document.getElementById('toast-root');
  if (root) return root;

  root = document.createElement('div');
  root.id = 'toast-root';
  root.className = 'toast-root';
  root.setAttribute('aria-live', 'polite');
  root.setAttribute('aria-atomic', 'true');
  document.body.append(root);
  return root;
}

function fallbackCopy(text) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.top = '-1000px';
  textarea.style.left = '-1000px';
  textarea.style.opacity = '0';

  document.body.append(textarea);
  textarea.focus({ preventScroll: true });
  textarea.select();

  const copied = document.execCommand('copy');
  textarea.remove();

  if (!copied) {
    throw new Error('Clipboard fallback failed');
  }
}
