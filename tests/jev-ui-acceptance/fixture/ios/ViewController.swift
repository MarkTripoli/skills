import UIKit

final class ViewController: UIViewController {
  private let name = UITextField(); private let channel = UISegmentedControl(items: ["Email", "Phone"]); private let status = UILabel()
  override func viewDidLoad() { super.viewDidLoad(); view.backgroundColor = .systemBackground
    let title = UILabel(); title.text = "Delivery check-in"; title.font = .preferredFont(forTextStyle: .title1)
    name.placeholder = "Name"; name.accessibilityLabel = "Name"; name.borderStyle = .roundedRect
    if let index = ProcessInfo.processInfo.arguments.firstIndex(of: "--JEV_UI_INITIAL_NAME"), index + 1 < ProcessInfo.processInfo.arguments.count { name.text = ProcessInfo.processInfo.arguments[index + 1] }
    channel.selectedSegmentIndex = 0; channel.accessibilityLabel = "Channel"; channel.accessibilityValue = channel.titleForSegment(at: channel.selectedSegmentIndex); channel.addTarget(self, action: #selector(channelChanged), for: .valueChanged)
    let button = UIButton(type: .system); button.setTitle("Confirm", for: .normal); button.accessibilityLabel = "Confirm"; button.addTarget(self, action: #selector(confirm), for: .touchUpInside)
    status.text = "Ready for confirmation."; status.accessibilityLabel = "Status"; status.accessibilityValue = status.text; status.numberOfLines = 0
    let stack = UIStackView(arrangedSubviews: [title, name, channel, button, status]); stack.axis = .vertical; stack.spacing = 18; stack.translatesAutoresizingMaskIntoConstraints = false; view.addSubview(stack)
    NSLayoutConstraint.activate([stack.leadingAnchor.constraint(equalTo: view.layoutMarginsGuide.leadingAnchor), stack.trailingAnchor.constraint(equalTo: view.layoutMarginsGuide.trailingAnchor), stack.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 32)])
  }
  @objc private func channelChanged() { channel.accessibilityValue = channel.titleForSegment(at: channel.selectedSegmentIndex) }
  @objc private func confirm() { let value = name.text?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""; status.text = value.isEmpty ? "Enter a name before confirming." : "Confirmed \(value) via \(channel.titleForSegment(at: channel.selectedSegmentIndex) ?? "Email")."; status.accessibilityValue = status.text }
}
