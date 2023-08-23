# razer-taskbar

## Summary

Display the battery state of Razer products using log messages from Razer Synapse.
Inspired by [Tekk-Know/RazerBatteryTaskbar](https://github.com/Tekk-Know/RazerBatteryTaskbar), instead of USB communication app uses Razer Synapse logs to get the latest battery status of Razer wireless devices. This has the advantage to support more devices (headsets, mice, keyboard, etc.) regardless of usb implementation, but also requires Razer Synapse 3 to be running.  
  
## Requirements

* Windows (tested on Windows 11)
* Razer Synapse 3 running in the background
* node.js (compile time)

## Supported Hardware

* Razer Blackshark V2 Pro (2023)
* Potentially any wireless Razer device if it's battery state gets logged into  
`%LOCALAPPDATA%\Razer\Synapse3\Log\Razer Synapse 3.log`

## Attributions

* RazerBatteryTaskbar: <https://github.com/Tekk-Know/RazerBatteryTaskbar>
* Battery icons based on [Dreamstale - Flaticon](https://www.flaticon.com/free-icons/battery)
