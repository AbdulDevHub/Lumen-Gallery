"use strict"

// Toolbar icon / Alt+G opens the gallery in a new tab.
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL("index.html") })
})
