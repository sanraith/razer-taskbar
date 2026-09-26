# Razer Synapse 4 logs

Notes on what Synapse 4 writes and how razer-taskbar interprets it. These were worked out from real logs of a
Razer Barracuda X Chroma on the HyperSpeed dongle, alongside a Basilisk V3 mouse and a BlackWidow V4 Pro keyboard.

All Synapse 4 logs are in:

```
%LOCALAPPDATA%\Razer\RazerAppEngine\User Data\Logs
```

## The file the app reads: `systray_systrayv2*.log`

Synapse's tray process logs a line like this whenever the list of connected devices, or a device's state,
changes:

```
[2026/09/26 20:04:06.985] info: [getConnectingDevices] ~ file: Synapse.js:55 ~ connectingDeviceData: [{...}, {...}]
```

- The timestamp is local time.
- The JSON array holds every connected Razer device. A single line can be 30 KB or more, because it includes
  profiles, lighting and other data.
- Devices with `"hasBattery": true` carry a `powerStatus` object. Devices without a battery (wired keyboards) are
  ignored.
- The device handle is `serialNumber`, falling back to `deviceContainerId`.

### Power states

| `chargingStatus` | `level` | Meaning | What the app shows |
|---|---|---|---|
| `NoCharge_BatteryFull` | 0–100 | On battery. Despite the name, this is used at any level. | Level |
| `Charging` | 0–100 | Charging | Bolt / green number |
| `off` | last level | Device switched off, receiver still plugged in | Faded icon, "Turned off" |
| any | `-1` | Unknown, briefly while the device turns on or reconnects | Keeps the last known level |

A device that disappears from the array entirely (for example, the dongle is unplugged) is shown as
disconnected.

### Quirks the watcher handles

- **Rotation.** The file rotates at about 5 MB, roughly every two hours:
  `systray_systrayv2.log`, then `systray_systrayv23.log`, `systray_systrayv24.log`, and so on. The newest file (by
  modification time) is the live one. Right after a rotation it may not contain a battery line yet, so the
  watcher reads back through older files until it finds a known level.
- **No serial number while reconnecting.** A device can first appear with `"serialNumber": "NOSERIALNUMBER"`.
  The watcher maps it onto the known device with the same name instead of creating a duplicate.
- **Stale first reading.** After plugging in to charge, the first `Charging` line can repeat the old level
  (for example 10%), followed about a minute later by the real one (41%).
- **Repeated identical lines.** Opening the Synapse window, or devices re-enumerating, writes the same state
  again. The app only moves the "last change" time when the level, charging state or on/off state actually
  changes.
- **Sparse updates on battery.** While charging, the headset pushes every 1% step, about once a minute. On
  battery, Synapse can go hours without logging a new level; it queries the device again when its window
  opens. The app cannot show more than Synapse writes.

## Other files that mention the battery

These are not used by the app, but are useful when debugging:

- `products_<pid>_mw {<containerId>}*.log`: the device middleware. It has `BATTERY STATUS {...}` lines when
  Synapse queries the device, and raw HID events (`[HW] {"rawBuffer":[...]}`). In the Barracuda's events,
  command byte `33` is the battery level and `42` is the charging state.
- `products_<pid>_ui {<containerId>}.log`: `setBatteryState GET_BATTERY_STATE {...}` when the Synapse device
  page is open.

## Synapse 3

Synapse 3 logs to `%LOCALAPPDATA%\Razer\Synapse3\Log\Razer Synapse 3.log`. The app looks for
`_OnBatteryLevelChanged`, `_OnDeviceLoaded` and `_OnDeviceRemoved` entries (see `src/main/watcher/watcherV3.ts`).

## If Synapse changes its format

The parsing lives in `src/main/watcher/synapse4_parser.ts`, and `test/synapse4_parser.test.ts` shows the
expected input. Update both together.
