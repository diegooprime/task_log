# Working Memory Task App — Build Spec

## Overview

A minimal, keyboard-driven floating window app for managing active tasks. Two panes: **Shelf** (brain dump) and **Current** (today's focus). Optimized for instant access and vim-style navigation.

**Core philosophy:** This is a working memory tool, not a task management system. Speed and simplicity over features.

---

## Architecture

**Recommended stack:** Tauri (Rust + WebView)
- Near-instant launch time
- Native window management
- Small binary size
- Global hotkey support built-in
Search the web for the most upto date documentation on Tauri
---

## Window Behavior

- **Toggle:** Hyper Key + =
- **Position:** Centered on screen but can be cornered, floating above all windows
- **Size:** Fixed width ~400px, height adapts to content (max ~500px, then scroll)
- **Focus:** Window grabs keyboard focus when shown
- **Dismiss:** `Esc` hides window (does not quit app)
- **Startup:** App runs as menu bar daemon, no dock icon

---

## UI Layout

```
┌─────────────────────────────────────┐
│  CURRENT (5 max)      │  SHELF      │
│  ─────────────────    │  ────────   │
│  > Task one           │  • Task A   │
│    Task two           │  • Task B   │
│    Task three         │  • Task C   │
│                       │  • Task D   │
│                       │  • Task E   │
│                       │  • ...      │
└─────────────────────────────────────┘
```

- Two columns/panes side by side
- Active pane has visual indicator (highlight or border)
- Selected task has cursor indicator (`>` or highlight)
- Current pane capped at 5 items (refuse to add more, move to shelf instead)
- Shelf has no limit, scrolls if needed
- Minimal styling: dark theme, monospace font, no chrome

---

## Keybindings

All keybinds work when window is focused:

| Key | Action |
|-----|--------|
| `Hyper = ` | Toggle window visibility (global, works from anywhere) |
| `j` | Move focus down |
| `k` | Move focus up |
| `Tab` | Switch active pane (Shelf ↔ Current) |
| `Shift+j` | Move selected task down in list |
| `Shift+k` | Move selected task up in list |
| `Enter` | Edit selected task inline (enters edit mode) |
| `o` | Create new task below selection (enters edit mode) |
| `d` | Mark selected task as done (log + remove with visual feedback) |
| `m` | Move selected task to other pane |
| `Esc` | Exit edit mode OR hide window if not editing |

**Edit mode:**
- Task text becomes editable input
- `Enter` saves and exits edit mode
- `Esc` cancels and exits edit mode
- Standard text editing (arrows, backspace, etc.)

---

## Data Persistence

**Active state:** `~/.tasks/state.json`

```json
{
  "current": [
    "Reply to investor email",
    "Fix auth bug"
  ],
  "shelf": [
    "Research competitor pricing",
    "Write blog post draft",
    "Call mom"
  ]
}
```

- Save on every mutation (add, edit, move, delete)
- Load on app start
- Create file/directory if doesn't exist

**Completed log:** `~/.tasks/done.md`

```markdown
- 2025-01-03: Reply to investor email
- 2025-01-0v1 la3: Fix auth bug
- 2025-01-02: Ship nding page
```

- Append-only
- Format: `- YYYY-MM-DD: Task text`
- One task per line

---

## Visual Feedback

When task is marked done (`d`):
1. Brief flash/highlight (green or fade out animation, ~150ms)
2. Task removed from list
3. Focus moves to next task (or previous if at bottom)

Keep animations minimal — this app should feel instant.

---

## Edge Cases

- **Empty pane:** Show subtle placeholder text ("No tasks" or just empty)
- **Current full (5 items):** When pressing `m` to move from Shelf → Current, either refuse with visual shake, or auto-move oldest Current item to Shelf (prefer: refuse with visual feedback)
- **No tasks selected:** `j` selects first item, `k` selects last item
- **Delete empty:** `d` on empty pane does nothing
- **New task empty:** If user presses `Enter` on empty new task, cancel creation

---

## Build Priorities

1. **Instant toggle** — Window must appear in <50ms
2. **Keyboard-only** — Must be fully usable without mouse
3. **No data loss** — State must persist across restarts
4. **Minimal UI** — No buttons, no icons, no settings screen

---

## Out of Scope (do not build)

- Time tracking
- Due dates
- Categories/tags
- Search
- Multiple lists
- Sync/cloud
- Undo (beyond edit cancel)
- Mouse interactions (can exist but not required)
- Settings UI

---

## File Structure

```
working-memory/
├── src-tauri/
│   ├── src/
│   │   └── main.rs          # Tauri app, global hotkey, window management
│   ├── Cargo.toml
│   └── tauri.conf.json
├── src/
│   ├── App.tsx              # Main React component
│   ├── store.ts             # State management + file persistence
│   ├── keybindings.ts       # Keyboard event handling
│   └── styles.css           # Minimal dark theme
├── package.json
└── README.md
```

---

## Definition of Done

- [ ] App launches as menu bar daemon
- [ ] `Hyper` toggles window from anywhere in OS
- [ ] Can add, edit, complete, and move tasks with keyboard only
- [ ] State persists in `~/.tasks/state.json`
- [ ] Completed tasks append to `~/.tasks/done.md`
- [ ] Window appears in <100ms
- [ ] Current pane enforces 5 task limit