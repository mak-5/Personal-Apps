/**
 * useSiri.js
 * Donates Siri shortcuts when the user performs key actions.
 * On iOS, these become available in Settings > Siri & Search,
 * and Siri will proactively suggest them.
 *
 * Usage: call the returned functions at the right moments in your app.
 */

import { App } from '@capacitor/app'
import { useEffect } from 'react'

// Capacitor doesn't have a first-party Siri plugin yet,
// so we use a postMessage bridge to the native layer.
// The Swift code in ios/App/App/AppDelegate.swift handles these.
function donateSiriShortcut(activityType, title, userInfo = {}) {
  if (window?.webkit?.messageHandlers?.siriShortcuts) {
    window.webkit.messageHandlers.siriShortcuts.postMessage({
      activityType,
      title,
      userInfo,
    })
  }
}

export function useSiriShortcuts() {
  // Donate shortcuts based on user actions
  const donateOpenFlights = () =>
    donateSiriShortcut(
      'com.akshay.apps.openFlights',
      'Check flight deals',
      { screen: 'flight-dashboard' }
    )

  const donateOpenFinance = () =>
    donateSiriShortcut(
      'com.akshay.apps.openFinance',
      'Check my finances',
      { screen: 'finance-pwa' }
    )

  const donateSearchFlights = (from, to) =>
    donateSiriShortcut(
      'com.akshay.apps.searchFlights',
      `Search flights from ${from}`,
      { screen: 'flight-dashboard', from, to }
    )

  return { donateOpenFlights, donateOpenFinance, donateSearchFlights }
}

/**
 * useAppUrlOpen
 * Handles deep links when Siri opens the app with a specific intent.
 * Call this in your top-level router component.
 */
export function useAppUrlOpen(navigate) {
  useEffect(() => {
    const handler = App.addListener('appUrlOpen', (event) => {
      // akshay-apps://flight-dashboard  → navigate to that screen
      const url = new URL(event.url)
      const screen = url.pathname.replace('//', '').replace('/', '')
      if (screen) navigate(`/${screen}`)
    })
    return () => handler.remove()
  }, [navigate])
}
