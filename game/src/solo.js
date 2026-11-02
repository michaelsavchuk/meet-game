// Solo page (/solo, and the static site's index.html): switches the right-hand tabs between the play and control
// frames, and shows the help dialog on the first visit and from the ? button.
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

// Help: opens by itself on the first visit; the ? button in the corner reopens it. Clicking outside closes it.
const help = document.getElementById('help');
document.getElementById('help-button').addEventListener('click', () => help.showModal());
help.addEventListener('click', (e) => {
  const r = help.getBoundingClientRect();
  const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
  if (!inside) help.close();
});
let seen = false;
try { seen = localStorage.getItem('solo.helpSeen'); localStorage.setItem('solo.helpSeen', '1'); } catch {}
if (!seen) help.showModal();
