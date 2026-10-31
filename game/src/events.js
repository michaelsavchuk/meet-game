// Turns raw Meet payloads (from the content script, the play page, or the dev helpers) into game events.
// Every game event has { type, player: { id, name }, at, ... }. Shared by the game (bridge.js) and the
// dev server (server/index.js), so no imports.
//
// Chat and reactions identify people differently (Chat user id vs. Meet participant id),
// so the display name is the only key the two share. The game keys players by name for now.
export const normalize = {
  'chat-message': (m) => ({
    type: 'chat',
    id: m.id,
    player: { id: m.userId, name: m.sender ?? 'Unknown' },
    text: m.text,
    at: m.receivedAt,
  }),
  'meet-reaction': (r) => ({
    type: 'reaction',
    player: { id: r.participantId, name: r.sender ?? 'Unknown' },
    emoji: r.emoji,
    at: r.receivedAt,
  }),
};
