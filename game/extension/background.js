// The toolbar button opens the game in a tab next to the current one (share that tab in Meet) and the host's
// control page in the browser's side panel (Firefox: its sidebar), so it stays beside Meet and the game as you
// switch tabs. Browsers with neither get the control page in a tab instead.
//
// Chrome runs this as a service worker and Firefox as an event page (manifest lists both), so it can't rely on
// either: no importScripts, no DOM.
//
// Firefox can't share a single tab in Meet, only a window or screen, and it stops drawing a tab that isn't in front,
// so there the game gets its own toolbar-less window instead of a tab (getBrowserInfo only exists in Firefox).
//
// Chat and reactions don't pass through here: the content script's chrome.runtime.sendMessage reaches the
// game page directly (see bridge.js).
const GAME = 'index.html';
const CONTROL = 'control.html';
const GAME_WINDOW = !!chrome.runtime.getBrowserInfo;

chrome.action.onClicked.addListener((tab) => {
  // sidePanel.open() only works while the click still counts as a user gesture, so it goes before any await.
  const fallback = () => openPage(CONTROL, tab, false);
  if (chrome.sidePanel?.open) chrome.sidePanel.open({ windowId: tab.windowId }).catch(fallback);
  else if (globalThis.browser?.sidebarAction?.open) browser.sidebarAction.open().catch(fallback);
  else fallback();
  openPage(GAME, tab, true, GAME_WINDOW);
});

// Opens one of the extension's pages next to `tab` (or in a window of its own), or switches to it if it's already open.
async function openPage(page, tab, active, ownWindow = false) {
  const url = chrome.runtime.getURL(page);
  const open = await findPage(url);
  if (!open && ownWindow) return chrome.windows.create({ url, type: 'popup', width: 1280, height: 760 });
  if (!open) return chrome.tabs.create({ url, active, windowId: tab.windowId, index: tab.index + 1 });
  if (!active) return;
  await chrome.tabs.update(open.tabId, { active: true });
  await chrome.windows.update(open.windowId, { focused: true });
}

// The open tab showing `url` as { tabId, windowId }: Chrome lists it with getContexts; Firefox has no getContexts,
// but its event page can reach the extension's own pages with getViews and ask one for its tab.
async function findPage(url) {
  if (chrome.runtime.getContexts) return (await chrome.runtime.getContexts({ contextTypes: ['TAB'], documentUrls: [url] }))[0];
  const view = chrome.extension?.getViews?.({ type: 'tab' }).find((v) => v.location.href === url);
  const found = view && (await view.chrome.tabs.getCurrent());
  return found && { tabId: found.id, windowId: found.windowId };
}
