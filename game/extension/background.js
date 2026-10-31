// The toolbar button opens the game in a tab next to the current one (share that tab in Meet) and the host's
// control page in the browser's side panel, so it stays beside Meet and the game as you switch tabs. Browsers
// without the sidePanel API get the control page in a tab instead.
//
// Chat and reactions don't pass through here: the content script's chrome.runtime.sendMessage reaches the
// game page directly (see bridge.js).
const GAME = 'index.html';
const CONTROL = 'control.html';

chrome.action.onClicked.addListener((tab) => {
  // sidePanel.open() only works while the click still counts as a user gesture, so it goes before any await.
  if (chrome.sidePanel?.open) chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => openPage(CONTROL, tab, false));
  else openPage(CONTROL, tab, false);
  openPage(GAME, tab, true);
});

// Opens one of the extension's pages next to `tab`, or switches to it if it's already open.
async function openPage(page, tab, active) {
  const url = chrome.runtime.getURL(page);
  const [open] = (await chrome.runtime.getContexts?.({ contextTypes: ['TAB'], documentUrls: [url] })) ?? [];
  if (!open) return chrome.tabs.create({ url, active, windowId: tab.windowId, index: tab.index + 1 });
  if (!active) return;
  await chrome.tabs.update(open.tabId, { active: true });
  await chrome.windows.update(open.windowId, { focused: true });
}
