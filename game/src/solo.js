// Solo page (/solo, dev server only): switches the right-hand tabs between the play and control frames.
const tabs = [...document.querySelectorAll('[role="tab"]')];

function show(pane) {
  for (const tab of tabs) {
    const selected = tab.dataset.pane === pane;
    tab.setAttribute('aria-selected', selected);
    document.getElementById(tab.dataset.pane).hidden = !selected;
  }
  try { localStorage.setItem('solo.tab', pane); } catch {}
}

for (const tab of tabs) tab.addEventListener('click', () => show(tab.dataset.pane));

let saved = null;
try { saved = localStorage.getItem('solo.tab'); } catch {}
show(tabs.some((t) => t.dataset.pane === saved) ? saved : 'play');
