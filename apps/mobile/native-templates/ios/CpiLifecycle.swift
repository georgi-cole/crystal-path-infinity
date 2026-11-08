import Capacitor
import UIKit
import WebKit

@objc(CpiLifecycle)
public class CpiLifecycle: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "CpiLifecycle"
    public let jsName = "CpiLifecycle"
    public let pluginMethods: [CAPPluginMethod] = [CAPPluginMethod(name: "getSnapshot", returnType: CAPPluginReturnPromise)]
    private let bridgeId = UUID().uuidString
    private var pageId: String?
    private var sequence = 0
    private var pageGeneration = 0
    private var active = false
    private var accumulated: Double = 0
    private let origin = ProcessInfo.processInfo.systemUptime * 1000
    private var boundary: Double = 0
    private var observers: [NSObjectProtocol] = []
    private var loadingObservation: NSKeyValueObservation?

    override public func load() {
        for (name, isActive) in [(UIScene.didActivateNotification, true), (UIScene.willDeactivateNotification, false)] {
            observers.append(NotificationCenter.default.addObserver(forName: name, object: nil, queue: .main) { [weak self] notification in
                guard let self = self,
                      let scene = notification.object as? UIWindowScene,
                      scene === self.bridge?.viewController?.view.window?.windowScene else { return }
                self.update(isActive)
            })
        }
        loadingObservation = bridge?.webView?.observe(\.isLoading, options: [.new]) { [weak self] _, change in
            guard let self = self, change.newValue == true else { return }
            self.pageGeneration += 1
            self.pageId = nil
        }
    }

    deinit {
        for observer in observers { NotificationCenter.default.removeObserver(observer) }
    }

    private func now() -> Double { ProcessInfo.processInfo.systemUptime * 1000 - origin }

    private func snapshot() -> [String: Any] {
        let sampled = now()
        sequence += 1
        return ["pageId": pageId ?? "", "bridgeId": bridgeId, "sequence": sequence,
                "isActive": active, "nativeTimeMs": sampled,
                "foregroundTimeMs": accumulated + (active ? sampled - boundary : 0)]
    }

    private func update(_ next: Bool) {
        let sampled = now()
        if next == active { return }
        if active { accumulated += sampled - boundary }
        boundary = sampled
        active = next
        guard let owner = pageId else { return }
        let value = snapshot()
        guard let payload = try? JSONSerialization.data(withJSONObject: value),
              let json = String(data: payload, encoding: .utf8) else { preconditionFailure("Invalid lifecycle snapshot") }
        // Page IDs are restricted ASCII, so the literal cannot escape this guard.
        bridge?.webView?.evaluateJavaScript("if (window.__CPI_NATIVE_PAGE_ID__ === '\(owner)') { document.dispatchEvent(new CustomEvent('cpi-native-state', {detail: \(json)})); }") { _, error in
            if let error = error { CAPLog.print("⚡️  JS Eval error", error.localizedDescription) }
        }
    }

    @objc func getSnapshot(_ call: CAPPluginCall) {
        guard let requested = call.getString("pageId"),
              requested.range(of: "^[A-Za-z0-9_-]{1,128}$", options: .regularExpression) != nil else {
            call.reject("Invalid page identity")
            return
        }
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { call.reject("Disposed native bridge"); return }
            let generation = self.pageGeneration
            self.bridge?.webView?.evaluateJavaScript("window.__CPI_NATIVE_PAGE_ID__ === '\(requested)' && typeof window.Capacitor?.triggerEvent === 'function'") { result, error in
                guard error == nil, result as? Bool == true, generation == self.pageGeneration else {
                    call.reject("Stale native page handshake", nil, error)
                    return
                }
                self.update(self.bridge?.viewController?.view.window?.windowScene?.activationState == .foregroundActive)
                self.pageId = requested
                call.resolve(self.snapshot())
            }
        }
    }
}

/** A real native foreground transition releases the held navigation, without a timer. */
class CpiWebView: WKWebView {
    private let gateId = UUID().uuidString
    private var held: URLRequest?
    private var released = false
    private var observedInactive = false
    private var observers: [NSObjectProtocol] = []

    override init(frame: CGRect, configuration: WKWebViewConfiguration) {
        super.init(frame: frame, configuration: configuration)
        observers.append(NotificationCenter.default.addObserver(forName: UIScene.willDeactivateNotification, object: nil, queue: .main) { [weak self] notification in
            guard let self = self, self.held != nil,
                  let scene = notification.object as? UIWindowScene,
                  scene === self.window?.windowScene else { return }
            self.observedInactive = true
            CAPLog.print("CPI_NATIVE_GATE {\"stage\":\"paused\",\"gateId\":\"\(self.gateId)\"}")
        })
        observers.append(NotificationCenter.default.addObserver(forName: UIScene.didActivateNotification, object: nil, queue: .main) { [weak self] notification in
            guard let self = self, self.observedInactive, let request = self.held,
                  let scene = notification.object as? UIWindowScene,
                  scene === self.window?.windowScene else { return }
            self.held = nil
            self.released = true
            CAPLog.print("CPI_NATIVE_GATE {\"stage\":\"released\",\"gateId\":\"\(self.gateId)\"}")
            self.load(request)
        })
    }

    required init?(coder: NSCoder) { fatalError("CpiWebView requires a native configuration") }
    deinit { for observer in observers { NotificationCenter.default.removeObserver(observer) } }

    override func load(_ request: URLRequest) -> WKNavigation? {
        if __DEVELOPMENT__ && !released && ProcessInfo.processInfo.arguments.contains("--cpi-prebridge-gate") {
            held = request
            CAPLog.print("CPI_NATIVE_GATE {\"stage\":\"waiting\",\"gateId\":\"\(gateId)\"}")
            return nil
        }
        return super.load(request)
    }
}

class CpiBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(CpiLifecycle())
        bridge?.registerPluginInstance(CpiFeedback())
        bridge?.registerPluginInstance(CpiSecureSession())
    }
    override func webView(with frame: CGRect, configuration: WKWebViewConfiguration) -> WKWebView {
        CpiWebView(frame: frame, configuration: configuration)
    }
}

@objc(CpiFeedback)
public class CpiFeedback: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "CpiFeedback"
    public let jsName = "CpiFeedback"
    public let pluginMethods: [CAPPluginMethod] = [CAPPluginMethod(name: "impact", returnType: CAPPluginReturnPromise)]

    @objc func impact(_ call: CAPPluginCall) {
        guard let kind = call.getString("kind"),
              ["step", "damage", "end"].contains(kind) else {
            call.reject("Unsupported haptic cue")
            return
        }
        DispatchQueue.main.async {
            guard UIApplication.shared.applicationState == .active else { call.resolve(); return }
            switch kind {
            case "step": UIImpactFeedbackGenerator(style: .light).impactOccurred()
            case "damage": UIImpactFeedbackGenerator(style: .heavy).impactOccurred()
            default: UINotificationFeedbackGenerator().notificationOccurred(.error)
            }
            call.resolve()
        }
    }
}
