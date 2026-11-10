# CarryBee Current Hub Lookup

A local Chrome/Edge extension for the escalation portal. Only use it if your organization permits this integration.

## Install
1. Download and unzip the extension folder. Keep the folder on your computer.
2. Chrome: visit `chrome://extensions`; Edge: visit `edge://extensions`.
3. Turn on **Developer mode**, choose **Load unpacked**, and select the `browser-extension` folder containing `manifest.json`.
4. Sign in to Hive in the same browser profile. Refresh the escalation page after installing the extension.
5. Enter one parcel ID and click **Find current hub in Hive**. Confirm the selected hub before submitting. Manual selection still works.

The extension sends the parcel ID to Hive using your browser's existing signed-in session. It extracts only the Current Hub from the returned page and sends that value to the portal; it does not store credentials or full order data. The browser may block cookies in extension requests, and Hive may change its page or require further authentication. If lookup fails, select the hub manually. This extension must be installed separately in each user's browser profile. Developer-mode installations may show browser warnings. Never share cookies or tokens.

The portal's lookup button requires the corresponding app update to be deployed. This uses HTML parsing, not an official Hive API, so it is inherently fragile.
