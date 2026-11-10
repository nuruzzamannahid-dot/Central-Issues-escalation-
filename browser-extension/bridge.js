// Only forward lookup requests originating from the portal tab itself.
window.addEventListener('message', (event) => {
  if (event.source !== window || event.origin !== location.origin ||
      event.data?.type !== 'CARRYBEE_HUB_LOOKUP_REQUEST') return;
  const { requestId, parcelId } = event.data;
  if (typeof requestId !== 'string' || typeof parcelId !== 'string') return;
  chrome.runtime.sendMessage({ type: 'lookup', parcelId }, (result) => {
    window.postMessage({ type: 'CARRYBEE_HUB_LOOKUP_RESPONSE', requestId,
      ...(chrome.runtime.lastError ? { error: 'Extension unavailable. Reload this page.' } : result) }, location.origin);
  });
});
