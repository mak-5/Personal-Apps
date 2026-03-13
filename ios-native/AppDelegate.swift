// ─────────────────────────────────────────────────────────────────────────────
// ios/App/App/AppDelegate.swift  — REPLACE the existing file with this
// ─────────────────────────────────────────────────────────────────────────────
// This adds:
//   1. URL scheme handler  (akshay-apps://)  for Siri deep links
//   2. NSUserActivity donation  so Siri learns your shortcuts
// ─────────────────────────────────────────────────────────────────────────────

import UIKit
import Capacitor
import Intents

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        return true
    }

    // ── URL Scheme: akshay-apps://flight-dashboard ────────────────────────────
    func application(_ app: UIApplication,
                     open url: URL,
                     options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    // ── Siri / Spotlight: continue NSUserActivity ─────────────────────────────
    func application(_ application: UIApplication,
                     continue userActivity: NSUserActivity,
                     restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {

        // Route the activity type to the right screen via URL scheme
        let screen: String
        switch userActivity.activityType {
        case "com.akshay.apps.openFlights":   screen = "flight-dashboard"
        case "com.akshay.apps.openFinance":   screen = "finance-pwa"
        case "com.akshay.apps.searchFlights": screen = "flight-dashboard"
        default: return false
        }

        // Post as a URL open so our JS router picks it up
        if let url = URL(string: "akshay-apps://\(screen)") {
            ApplicationDelegateProxy.shared.application(application, open: url, options: [:])
        }
        return true
    }

    // ── WKScriptMessageHandler: receive donations from JS ─────────────────────
    // Called when JS does:
    //   window.webkit.messageHandlers.siriShortcuts.postMessage({...})
    //
    // Wire this up in your CAPBridgeViewController if needed, or use the
    // Capacitor plugin approach below. For simplicity, donations happen
    // automatically the first time the user visits each screen (see useSiri.js).
    func donateShortcut(activityType: String, title: String) {
        let activity = NSUserActivity(activityType: activityType)
        activity.title = title
        activity.isEligibleForSearch = true
        activity.isEligibleForPrediction = true   // shows in Siri suggestions
        activity.persistentIdentifier = NSUserActivityPersistentIdentifier(activityType)
        activity.becomeCurrent()
    }

    func applicationWillResignActive(_ application: UIApplication) {}
    func applicationDidEnterBackground(_ application: UIApplication) {}
    func applicationWillEnterForeground(_ application: UIApplication) {}
    func applicationDidBecomeActive(_ application: UIApplication) {}
}
