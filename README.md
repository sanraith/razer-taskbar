# razer-taskbar

[![Download](https://img.shields.io/github/v/release/sanraith/razer-taskbar?label=Download&style=for-the-badge)](https://github.com/sanraith/razer-taskbar/releases/latest)

## Summary

Display the battery state of Razer products using log messages from Razer Synapse.
Inspired by [Tekk-Know/RazerBatteryTaskbar](https://github.com/Tekk-Know/RazerBatteryTaskbar), instead of USB communication this app uses Razer Synapse logs to get the latest battery status of Razer wireless devices. This has the advantage to support more devices (headsets, mice, keyboard, etc.) without extra configuration, but also requires Razer Synapse 3 or 4 to be running.  
  
![Screenshot of razer-taskbar battery icon and its menu showing its connected to a Razer headset.](docs/screenshot.png)  

| ≥80% | ≥60% | ≥40% | ≥20% | ≥0% | unknown % | numeric |
|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
|![100%](src/assets/battery100_@2x.png) ![100% charging](src/assets/battery100_chrg_@2x.png)|![75%](src/assets/battery75_@2x.png) ![75% charging](src/assets/battery75_chrg_@2x.png)|![50%](src/assets/battery50_@2x.png) ![50% charging](src/assets/battery50_chrg_@2x.png)|![25%](src/assets/battery25_@2x.png) ![25% charging](src/assets/battery25_chrg_@2x.png)|![0%](src/assets/battery0_@2x.png) ![0% charging](src/assets/battery0_chrg_@2x.png)|![battery unknown](src/assets/battery_unknown_@2x.png)|![100%](src/assets/numeric-icon/battery078.png) ![100%](src/assets/numeric-icon-chrg/battery078.png)|

## Requirements

* Windows (tested on Windows 10 & 11)
* `Razer Synapse 3` or `Razer Synapse 4` running in the background
* _Optional: node.js (compile time)_

## Installation

1. Download `RazerTaskbarSetup_v[version].exe` from the [latest release](https://github.com/sanraith/razer-taskbar/releases/latest).
2. Run it. Windows may show a SmartScreen warning (see below).
3. After installation the app will show its icon on the taskbar. Use the Settings menu to configure automatic startup if needed.

### Windows SmartScreen warning

When you first run the exe, Windows Defender SmartScreen may show:
> *"Windows protected your PC. Microsoft Defender SmartScreen prevented an unrecognized app from starting."*

This is expected. The exe is unsigned (no paid code-signing certificate), so Windows flags it until the file builds a reputation. The source code is fully visible in this repository.

**To proceed:** click **More info**, then **Run anyway**.

## Supported Hardware

* Potentially any wireless Razer device compatible with Razer Synapse 3 or 4.
* tested with Razer Blackshark V2 Pro (2023)

## Compiling

`canvas` is only needed for `npm run image-gen` and does not build on newer Node versions, so install scripts are skipped and the required ones are run manually:

* `npm ci --ignore-scripts`
* `npm rebuild electron electron-winstaller`
* `npm run make`
* Setup exe will be created in the `out\make` directory.

### Releasing

Pushing a tag matching the version in `package.json` (e.g. `v0.12.0`) builds the setup exe with GitHub Actions and attaches it to a new release.

## How it works

The app is monitoring the logs of Razer Synapse. The monitored file is:

* `%LOCALAPPDATA%\Razer\Synapse3\Log\Razer Synapse 3.log` for Razer Synapse 3
* `%LOCALAPPDATA%\Razer\RazerAppEngine\User Data\Logs\systray_systrayv2.log` for Razer Synapse 4

The app reads the log content throttled by the "Maximum battery update delay" setting. The code is looking for connection and battery information in the logs, and parses the latest state of each device as defined in [`razer_watcher.ts`](https://github.com/sanraith/razer-taskbar/blob/main/src/watcher/razer_watcher.ts).
If the log format of Razer Synapse changes, this file will need to be updated.

## Attributions

* RazerBatteryTaskbar: <https://github.com/Tekk-Know/RazerBatteryTaskbar>
* Battery icons are made by me. Design is based on [Dreamstale - Flaticon](https://www.flaticon.com/free-icons/battery)
