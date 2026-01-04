# task_log

A minimal, keyboard-driven floating window app for managing active tasks. Two panes: **Shelf** (brain dump) and **Current** (today's focus).

## Quick Start

1. The app runs as a menu bar icon only (no dock icon)
2. Toggle window: **Hyper + =** (Cmd+Ctrl+Alt+Shift + =)
3. Click the menu bar icon to toggle the window

## Keybindings

| Key | Action |
|-----|--------|
| `Hyper + =` | Toggle window visibility (global) |
| `j` | Move focus down |
| `k` | Move focus up |
| `Tab` | Switch active pane (Shelf ↔ Current) |
| `Shift+J` | Move selected task down in list |
| `Shift+K` | Move selected task up in list |
| `Enter` | Edit selected task inline |
| `o` | Create new task below selection |
| `d` | Mark selected task as done (logs + removes) |
| `m` | Move selected task to other pane |
| `Esc` | Exit edit mode OR hide window |

## Data Storage

- **Active tasks:** `~/.tasks/state.json`
- **Completed log:** `~/.tasks/done.md`

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run tauri dev

# Build for production
npm run tauri build
```

## Built App Location

After building, find the app at:
- `src-tauri/target/release/bundle/macos/task_log.app`
- `src-tauri/target/release/bundle/dmg/task_log_0.1.0_aarch64.dmg`

## Philosophy

This is a **working memory tool**, not a task management system. Speed and simplicity over features.

- Current pane: max 5 tasks (today's focus)
- Shelf: unlimited (brain dump)
- No time tracking, due dates, categories, or sync
