import Cocoa
import WebKit

class AppDelegate: NSObject, NSApplicationDelegate {
    var window: NSWindow!
    var webView: WKWebView!
    let siteURL = "https://biz-tracker-beta.vercel.app/quick"

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.regular)

        let screenFrame = NSScreen.main?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1200, height: 800)
        let windowWidth: CGFloat = 440
        let windowHeight: CGFloat = 640
        let x = screenFrame.origin.x + (screenFrame.width - windowWidth) / 2
        let y = screenFrame.origin.y + (screenFrame.height - windowHeight) / 2

        window = NSWindow(
            contentRect: NSRect(x: x, y: y, width: windowWidth, height: windowHeight),
            styleMask: [.titled, .closable, .resizable, .miniaturizable],
            backing: .buffered,
            defer: false
        )
        window.title = "BizTracker AI"
        window.titlebarAppearsTransparent = true
        window.backgroundColor = NSColor(red: 0.04, green: 0.04, blue: 0.07, alpha: 1.0)
        window.isMovableByWindowBackground = true
        window.level = .floating
        window.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        window.minSize = NSSize(width: 360, height: 480)

        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        let prefs = WKWebpagePreferences()
        prefs.allowsContentJavaScript = true
        config.defaultWebpagePreferences = prefs

        webView = WKWebView(frame: .zero, configuration: config)
        webView.setValue(false, forKey: "drawsBackground")
        window.contentView = webView

        if let url = URL(string: siteURL) {
            webView.load(URLRequest(url: url))
        }

        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        return true
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.run()
