# Changelog

## 0.13.0

### New
- Tray icons redrawn in the style of the Windows tray icons: a pixel-sharp battery, or the exact percentage.
  They are drawn for every display scaling (100–300%) and follow the taskbar's light or dark mode.
- On Windows the tray icon is loaded from a multi-size `.ico`, so it stays sharp at 125% and 150% scaling
  instead of being stretched from 16 px.
- Headset-off state: a device switched off with its dongle still plugged in shows as faded instead of a stale
  percentage.
- Notifications for low battery, critical battery and fully charged, with configurable thresholds.
- Tooltip with device name, state and time of the last reported change.
- New settings window: Windows 11 style (Mica, light/dark), Razer green accent, live battery card, icon style
  previews, notification settings, and links to the Synapse log folder and GitHub.
- Left-click on the tray icon opens settings. Only one copy of the app runs at a time.
- App icon for the installer, exe, window and notifications.
- Unit tests (`npm test`), plus `typecheck`, `lint` and `check` scripts.

### Fixed
- Synapse 4 log rotation: the icon no longer stops updating when the newest log has no battery line yet.
- Unknown battery level (`-1`) while a device turns on is no longer shown as 0%, and no longer triggers a false
  low-battery alert.
- A device reconnecting without its serial number no longer shows as disconnected.
- "Last change" no longer resets when Synapse re-logs an unchanged state (for example when its window opens).
- Settings from older versions are kept when new settings are added, instead of being reset to defaults.
- Logs are read incrementally (only new bytes) instead of re-reading the whole 5 MB file on every change.

### Removed
- Pre-rendered PNG icons and the image generator (and its native `canvas` dependency, which fails to install on
  current Node versions).
- `lodash` (its current type definitions break the TypeScript build), `nodemon`, and the Linux deb/rpm makers.

### Changed
- Source reorganised into `src/main`, `src/renderer` and `src/shared`. The default update interval is now
  5 seconds.

## 0.12.0 and earlier

See the [upstream project](https://github.com/sanraith/razer-taskbar/releases).
