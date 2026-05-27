/**
 * src/sw/push.js
 *
 * Web Push API Facade.
 * Manages Web Push client subscriptions using standard VAPID credentials
 * and encapsulates standard notification prompts.
 *
 * Source: doc 13 — Offline and Background §6
 */

/**
 * Decodes a base64 VAPID public key into a standard Uint8Array key.
 */
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Registers a Web Push subscription.
 */
export async function subscribe(registration, vapidKey) {
  const activeReg = registration || (typeof self !== 'undefined' ? self.registration : null);

  if (!activeReg || !activeReg.pushManager) {
    throw new Error('Web Push subscriptions are not supported in this context.');
  }

  const keyBytes = typeof vapidKey === 'string'
    ? urlBase64ToUint8Array(vapidKey)
    : vapidKey;

  return activeReg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: keyBytes
  });
}

/**
 * Triggers a standard visual Notification popup.
 */
export async function notify(title, options = {}, registration) {
  const activeReg = registration || (typeof self !== 'undefined' ? self.registration : null);

  if (activeReg && activeReg.showNotification) {
    return activeReg.showNotification(title, options);
  }
}
