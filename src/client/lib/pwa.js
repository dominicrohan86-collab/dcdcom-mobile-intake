let waitingWorker = null;

export function registerPwa({ onUpdate } = {}) {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

  window.addEventListener("load", async () => {
    try {
      const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      wireUpdateChecks(registration, onUpdate);
      window.setTimeout(() => registration.update().catch(() => undefined), 3000);
    } catch (error) {
      console.warn("DC Decom PWA registration failed", error);
    }
  }, { once: true });

  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });
}

export async function applyPwaUpdate() {
  if (!("serviceWorker" in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration("/");
  const worker = waitingWorker || registration?.waiting;
  if (worker) worker.postMessage({ type: "SKIP_WAITING" });
  else window.location.reload();
}

function wireUpdateChecks(registration, onUpdate) {
  if (registration.waiting && navigator.serviceWorker.controller) notifyUpdate(registration, onUpdate);

  registration.addEventListener("updatefound", () => {
    const worker = registration.installing;
    if (!worker) return;
    worker.addEventListener("statechange", () => {
      if (worker.state === "installed" && navigator.serviceWorker.controller) notifyUpdate(registration, onUpdate);
    });
  });
}

function notifyUpdate(registration, onUpdate) {
  waitingWorker = registration.waiting;
  onUpdate?.();
}
