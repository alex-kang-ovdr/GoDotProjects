import UIKit
import WebKit

/// Legacy HTML5/JS game runtime running inside iOS's out-of-process WebKit.WebContent sandbox.
/// Uses WKWebsiteDataStore.nonPersistent() to prevent cross-game cookie/storage leakage
/// and exposes a strict playhub:connect compatible WKScriptMessageHandler bridge.
public final class WebGameViewController: UIViewController, WKScriptMessageHandler {
    private let gameId: String
    private let entryUrl: URL
    private let onOpenOverlay: () -> Void
    private var webView: WKWebView?

    public init(gameId: String, entryUrl: URL, onOpenOverlay: @escaping () -> Void) {
        self.gameId = gameId
        self.entryUrl = entryUrl
        self.onOpenOverlay = onOpenOverlay
        super.init(nibName: nil, bundle: nil)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    public override var preferredScreenEdgesDeferringSystemGestures: UIRectEdge { .all }
    public override var prefersHomeIndicatorAutoHidden: Bool { true }

    public override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black

        let config = WKWebViewConfiguration()
        config.websiteDataStore = .nonPersistent()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        config.userContentController.add(self, name: "playhubBridge")

        let wv = WKWebView(frame: view.bounds, configuration: config)
        wv.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        wv.isOpaque = false
        wv.backgroundColor = .black
        wv.scrollView.contentInsetAdjustmentBehavior = .never
        view.addSubview(wv)
        self.webView = wv

        let overlayButton = UIButton(type: .system)
        overlayButton.setTitle("▶ Hub", for: .normal)
        overlayButton.setTitleColor(.white, for: .normal)
        overlayButton.titleLabel?.font = .systemFont(ofSize: 13, weight: .bold)
        overlayButton.backgroundColor = UIColor(white: 0.08, alpha: 0.78)
        overlayButton.layer.cornerRadius = 16
        overlayButton.contentEdgeInsets = UIEdgeInsets(top: 6, left: 12, bottom: 6, right: 12)
        overlayButton.translatesAutoresizingMaskIntoConstraints = false
        overlayButton.addTarget(self, action: #selector(didTapOverlay), for: .touchUpInside)
        view.addSubview(overlayButton)

        NSLayoutConstraint.activate([
            overlayButton.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 10),
            overlayButton.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 12)
        ])

        wv.load(URLRequest(url: entryUrl))
    }

    deinit {
        webView?.configuration.userContentController.removeScriptMessageHandler(forName: "playhubBridge")
    }

    @objc private func didTapOverlay() {
        onOpenOverlay()
    }

    public func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "playhubBridge" else { return }
        // Forward validated playhub:connect events to PlayHubRuntimeBroker in M1
    }
}
