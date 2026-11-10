chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'parse-hub' || sender.id !== chrome.runtime.id) return;
  const doc = new DOMParser().parseFromString(message.html, 'text/html');
  // Hive's Tracking Details shows the label and value as sibling elements.
  const labels = [...doc.querySelectorAll('span')].filter(el => el.textContent.trim() === 'Current Hub');
  if (labels.length !== 1) return sendResponse({});
  const label = labels[0];
  const value = label.nextElementSibling;
  const hub = value?.textContent?.trim();
  sendResponse(hub && hub.length <= 150 ? {hub} : {});
});
