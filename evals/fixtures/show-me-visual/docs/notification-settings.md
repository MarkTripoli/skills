# Notification settings screen: five states

Every state shows the same card titled "Notification settings" with the rows "Email alerts", "SMS alerts" and "Quiet hours (22:00 to 07:00)", a primary button and a status line.

| State | Rows | Primary button | Status line | Next state |
|---|---|---|---|---|
| Loading | three grey placeholder bars, no toggles | disabled "Save" | "Loading your settings" | Saved, Empty or Error |
| Empty | toggles off, "Add your first channel" link | disabled "Save" | "No channels yet" | Saved |
| Error | last known toggles, red banner "Could not load settings" | "Retry" | "Error 503" | Loading |
| Saved | toggles as stored, Email alerts on, SMS alerts off | "Save" | "Saved just now" | Offline |
| Offline | toggles frozen, banner "You are offline" | disabled "Save" | "Changes will sync when you reconnect" | Loading |

Colours: card white, banner red (#b3261e) in Error and amber (#8a5a00) in Offline, primary button blue (#1a56db).
