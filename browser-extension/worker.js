let creating;
async function ensureParser() {
  if (await chrome.offscreen.hasDocument()) return;
  if (!creating) creating = chrome.offscreen.createDocument({
    url: 'parser.html', reasons: ['DOM_PARSER'],
    justification: 'Extract only the current hub from the authenticated order page.'
  }).finally(() => { creating = null; });
  await creating;
}
async function lookup(id) {
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id)) return {error: 'Enter a valid single parcel ID.'};
  const url = `https://hive.carrybee.com/orders/${encodeURIComponent(id)}`;
  try {
    const response = await fetch(url, { credentials: 'include', redirect: 'follow', cache: 'no-store', signal: AbortSignal.timeout(15000) });
    if (new URL(response.url).origin !== 'https://hive.carrybee.com' || new URL(response.url).pathname.startsWith('/login') || response.status === 401 || response.status === 403)
      return {error: 'Please sign in to Hive in this browser, then try again.'};
    if (!response.ok) return {error: `Hive returned an error (${response.status}). Select the hub manually.`};
    const html = await response.text();
    await ensureParser();
    const result = await chrome.runtime.sendMessage({ type: 'parse-hub', html });
    return result?.hub ? {hub: result.hub} : {error: 'Current Hub not found. Check the ID and Hive access, or select the hub manually.'};
  } catch (_) { return {error: 'Could not reach Hive. Check your connection and Hive login, then try again.'}; }
}
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'lookup' || !sender.tab?.url) return;
  const url = new URL(sender.tab.url);
  if (url.origin !== 'https://kam-issue-portal.vercel.app' || url.pathname !== '/escalate') return;
  lookup(message.parcelId).then(sendResponse);
  return true;
});
