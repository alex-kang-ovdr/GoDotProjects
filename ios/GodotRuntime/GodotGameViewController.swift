import SwiftUI
import UIKit

/// Hosts the Godot 4.7.2 rendering surface with a Safe-Area-aware top-left floating [▶ Hub]
/// Universal In-Game Overlay button and iOS system gesture deferral.
public final class GodotGameViewController: UIViewController {
    private let gameTitle: String
    private let onOpenOverlay: () -> Void
    private let overlayButton = UIButton(type: .system)

    public init(gameTitle: String, onOpenOverlay: @escaping () -> Void) {
        self.gameTitle = gameTitle
        self.onOpenOverlay = onOpenOverlay
        super.init(nibName: nil, bundle: nil)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    public override var preferredScreenEdgesDeferringSystemGestures: UIRectEdge {
        .all
    }

    public override var prefersHomeIndicatorAutoHidden: Bool {
        true
    }

    public override var prefersStatusBarHidden: Bool {
        true
    }

    public override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black

        let placeholder = UILabel()
        placeholder.text = "Play Hub · Godot 4.7.2 Runtime\n\(gameTitle)"
        placeholder.textColor = .white
        placeholder.numberOfLines = 0
        placeholder.textAlignment = .center
        placeholder.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(placeholder)

        overlayButton.setTitle("▶ Hub", for: .normal)
        overlayButton.setTitleColor(.white, for: .normal)
        overlayButton.titleLabel?.font = .systemFont(ofSize: 13, weight: .bold)
        overlayButton.backgroundColor = UIColor(white: 0.08, alpha: 0.78)
        overlayButton.layer.cornerRadius = 16
        overlayButton.layer.borderWidth = 1
        overlayButton.layer.borderColor = UIColor(white: 1.0, alpha: 0.25).cgColor
        overlayButton.contentEdgeInsets = UIEdgeInsets(top: 6, left: 12, bottom: 6, right: 12)
        overlayButton.translatesAutoresizingMaskIntoConstraints = false
        overlayButton.addTarget(self, action: #selector(didTapHubOverlay), for: .touchUpInside)
        view.addSubview(overlayButton)

        NSLayoutConstraint.activate([
            placeholder.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            placeholder.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            overlayButton.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 10),
            overlayButton.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 12)
        ])
    }

    @objc private func didTapHubOverlay() {
        onOpenOverlay()
    }
}
