# razer-taskbar

## Summary

Display the battery state of Razer products using log messages from Razer Synapse.
Inspired by [Tekk-Know/RazerBatteryTaskbar](https://github.com/Tekk-Know/RazerBatteryTaskbar), instead of USB communication this app uses Razer Synapse logs to get the latest battery status of Razer wireless devices. This has the advantage to support more devices (headsets, mice, keyboard, etc.) without extra configuration, but also requires Razer Synapse 3 to be running.  
  
![Screenshot of razer-taskbar battery icon and its menu showing its connected to a Razer headset.](docs/screenshot.png)  

| ≥80% | ≥60% | ≥40% | ≥20% | ≥0% | unknown % |
|:-:|:-:|:-:|:-:|:-:|:-:|
![100%](src/assets/battery100_@2x.png) ![100% charging](src/assets/battery100_chrg_@2x.png)|![75%](src/assets/battery75_@2x.png) ![75% charging](src/assets/battery75_chrg_@2x.png)|![50%](src/assets/battery50_@2x.png) ![50% charging](src/assets/battery50_chrg_@2x.png)|![25%](src/assets/battery25_@2x.png) ![25% charging](src/assets/battery25_chrg_@2x.png)|![0%](src/assets/battery0_@2x.png) ![0% charging](src/assets/battery0_chrg_@2x.png)|![battery unknown](src/assets/battery_unknown_@2x.png)

## Requirements

* Windows (tested on Windows 10 & 11)
* Razer Synapse 3 running in the background
* _Optional: node.js (compile time)_

## Installation

Run the setup exe. After installation the app will show its icon on the taskbar. Use the Settings menu to configure automatic startup if needed.

## Supported Hardware

* Potentially any wireless Razer device if its battery state gets logged into  
`%LOCALAPPDATA%\Razer\Synapse3\Log\Razer Synapse 3.log`
* tested with Razer Blackshark V2 Pro (2023)

## Compiling

* `npm install`
* `npm run make`
* Setup exe will be created in the `out\make` directory.

## How it works

The app is monitoring `%LOCALAPPDATA%\Razer\Synapse3\Log\Razer Synapse 3.log` and reads the content on every change throttled by the "Maximum delay between battery status updates" setting. The code is looking for `OnBatteryLevelChanged`, `OnDeviceLoaded` and `OnDeviceRemoved` events, and parses the latest state of each device using the regexps defined in [`razer_watcher.ts`](https://github.com/sanraith/razer-taskbar/blob/064479012c2585abe8d266e9fd33db668623355a/src/razer_watcher.ts#L39-L41).
If the log format of Razer Synapse changes, these expressions will need to be updated.

## Attributions

* RazerBatteryTaskbar: <https://github.com/Tekk-Know/RazerBatteryTaskbar>
* Battery icons are made by me. Design is based on [Dreamstale - Flaticon](https://www.flaticon.com/free-icons/battery)
