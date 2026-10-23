// Local bridge for Paperang printers that accept print data only over Bluetooth
// Classic SPP (such as P1S). macOS's /dev/cu port for these printers never opens
// an RFCOMM link, and Chrome's Web Serial cannot open it either, so this helper
// opens RFCOMM through IOBluetooth and relays raw bytes over a loopback WebSocket.
//
// Run: npm run printer:bridge [-- --address C8-48-8A-57-46-E9] [-- --origin https://example.com]
// Protocol: the page sends {"type":"open"} first; binary messages then carry raw
// printer bytes both ways. The bridge answers the open request with one text
// message, {"type":"ready","name":...} or {"type":"error","message":...}.
import Foundation
import IOBluetooth
import Network

let bridgePort: NWEndpoint.Port = 47615
// Writing immediately after an RFCOMM link opens can make the printer drop it.
let settleSeconds = 2.0
var allowedOrigins: Set<String> = [
  "http://localhost:5173", "http://127.0.0.1:5173",
  "https://oddenova.com", "https://www.oddenova.com",
]
var requestedAddress: String?
var arguments = CommandLine.arguments.dropFirst().makeIterator()
while let argument = arguments.next() {
  switch argument {
  case "--address": requestedAddress = arguments.next()
  case "--origin": if let origin = arguments.next() { allowedOrigins.insert(origin) }
  default: print("Unknown argument: \(argument)"); exit(64)
  }
}

func log(_ message: String) {
  let time = ISO8601DateFormatter().string(from: Date())
  print("[\(time)] \(message)")
  fflush(stdout)
}

func findPrinter() -> IOBluetoothDevice? {
  if let address = requestedAddress { return IOBluetoothDevice(addressString: address) }
  let paired = (IOBluetoothDevice.pairedDevices() as? [IOBluetoothDevice]) ?? []
  return paired.first { device in
    let name = device.name?.lowercased() ?? ""
    return name.hasPrefix("paperang") || name.hasPrefix("miaomiaoji")
  }
}

final class Session: NSObject, IOBluetoothRFCOMMChannelDelegate {
  private let socket: NWConnection
  private var device: IOBluetoothDevice?
  private var channel: IOBluetoothRFCOMMChannel?
  private var opening = false
  private var ready = false
  private var closed = false
  private var channelAttempts = 0
  var onClose: (() -> Void)?

  init(socket: NWConnection) { self.socket = socket }

  func start() {
    socket.stateUpdateHandler = { [weak self] state in
      switch state {
      case .failed, .cancelled: self?.close(reason: "page disconnected")
      default: break
      }
    }
    socket.start(queue: .main)
    receive()
  }

  // Bluetooth is touched only after an accepted page asks for it: a connection whose
  // WebSocket handshake was rejected for its origin can never send this message.
  private func openPrinter() {
    guard !opening else { return }
    opening = true
    guard let device = findPrinter() else {
      return fail("No paired Paperang printer found. Pair the printer in System Settings > Bluetooth first.")
    }
    self.device = device
    log("Connecting to \(device.name ?? "printer") (\(device.addressString ?? "?"))")
    if !device.isConnected() {
      let status = device.openConnection()
      if status != kIOReturnSuccess { return fail("Bluetooth connection failed (\(status)). Make sure the printer is on and not connected to another app.") }
    }
    // Opening RFCOMM right after the baseband link comes up fails; the service
    // query gives the link time to settle and refreshes the channel number.
    let status = device.performSDPQuery(self)
    if status != kIOReturnSuccess { openChannel() }
  }

  @objc func sdpQueryComplete(_ device: IOBluetoothDevice!, status: IOReturn) {
    if !closed && channel == nil { openChannel() }
  }

  private func openChannel() {
    guard let device, !closed else { return }
    channelAttempts += 1
    var channelID: BluetoothRFCOMMChannelID = 1
    for case let record as IOBluetoothSDPServiceRecord in device.services ?? [] {
      var id: BluetoothRFCOMMChannelID = 0
      if record.getRFCOMMChannelID(&id) == kIOReturnSuccess { channelID = id; break }
    }
    var opened: IOBluetoothRFCOMMChannel?
    let status = device.openRFCOMMChannelSync(&opened, withChannelID: channelID, delegate: self)
    guard status == kIOReturnSuccess, let opened else {
      if channelAttempts < 3 {
        log("RFCOMM channel \(channelID) not ready (\(status)); retrying")
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) { [weak self] in self?.openChannel() }
        return
      }
      return fail("Could not open the printer's serial channel \(channelID) (\(status)). Turn the printer off and on, then try again.")
    }
    channel = opened
    log("RFCOMM channel \(channelID) open")
    DispatchQueue.main.asyncAfter(deadline: .now() + settleSeconds) { [weak self] in
      guard let self, !self.closed else { return }
      self.ready = true
      self.sendText(["type": "ready", "name": device.name ?? "Paperang"])
    }
  }

  private func receive() {
    socket.receiveMessage { [weak self] data, context, _, error in
      guard let self, !self.closed else { return }
      if error != nil { return self.close(reason: "page connection error") }
      let metadata = context?.protocolMetadata(definition: NWProtocolWebSocket.definition) as? NWProtocolWebSocket.Metadata
      if metadata?.opcode == .close { return self.close(reason: "page closed the connection") }
      if let data, !data.isEmpty, metadata?.opcode == .binary { self.writeToPrinter(data) }
      if let data, metadata?.opcode == .text,
         let message = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
         message["type"] as? String == "open" { self.openPrinter() }
      self.receive()
    }
  }

  private func writeToPrinter(_ data: Data) {
    guard ready, let channel else { return }
    let mtu = max(Int(channel.getMTU()), 1)
    var offset = 0
    while offset < data.count {
      var chunk = [UInt8](data[offset..<min(offset + mtu, data.count)])
      let status = channel.writeSync(&chunk, length: UInt16(chunk.count))
      if status != kIOReturnSuccess { return fail("Write to printer failed (\(status)).") }
      offset += chunk.count
    }
  }

  func rfcommChannelData(_ channel: IOBluetoothRFCOMMChannel!, data pointer: UnsafeMutableRawPointer!, length: Int) {
    guard !closed, let pointer else { return }
    let metadata = NWProtocolWebSocket.Metadata(opcode: .binary)
    let context = NWConnection.ContentContext(identifier: "printer", metadata: [metadata])
    socket.send(content: Data(bytes: pointer, count: length), contentContext: context, isComplete: true, completion: .contentProcessed { _ in })
  }

  func rfcommChannelClosed(_ channel: IOBluetoothRFCOMMChannel!) {
    if !closed { fail("The printer closed the Bluetooth connection.") }
  }

  private func sendText(_ message: [String: String]) {
    guard let data = try? JSONSerialization.data(withJSONObject: message) else { return }
    let metadata = NWProtocolWebSocket.Metadata(opcode: .text)
    let context = NWConnection.ContentContext(identifier: "status", metadata: [metadata])
    socket.send(content: data, contentContext: context, isComplete: true, completion: .contentProcessed { _ in })
  }

  private func fail(_ message: String) {
    log("Error: \(message)")
    sendText(["type": "error", "message": message])
    // Let the error message flush before closing the page connection.
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) { [weak self] in self?.close(reason: message) }
  }

  func close(reason: String) {
    guard !closed else { return }
    closed = true
    channel?.setDelegate(nil)
    channel?.close()
    channel = nil
    device?.closeConnection()
    socket.cancel()
    log("Session closed: \(reason)")
    onClose?()
  }
}

let webSocket = NWProtocolWebSocket.Options()
webSocket.autoReplyPing = true
webSocket.setClientRequestHandler(.main) { _, headers in
  let origin = headers.first { $0.name.lowercased() == "origin" }?.value ?? ""
  let accepted = allowedOrigins.contains(origin)
  if !accepted { log("Rejected connection from origin \(origin.isEmpty ? "(none)" : origin)") }
  return NWProtocolWebSocket.Response(status: accepted ? .accept : .reject, subprotocol: nil, additionalHeaders: nil)
}
let parameters = NWParameters.tcp
parameters.acceptLocalOnly = true
parameters.requiredInterfaceType = .loopback
parameters.defaultProtocolStack.applicationProtocols.insert(webSocket, at: 0)

var activeSession: Session?
let listener: NWListener
do { listener = try NWListener(using: parameters, on: bridgePort) } catch {
  log("Cannot listen on 127.0.0.1:\(bridgePort): \(error)"); exit(1)
}
listener.newConnectionHandler = { connection in
  // One printer link at a time; a second page would interleave print jobs.
  if let previous = activeSession { previous.close(reason: "replaced by a new page connection") }
  let session = Session(socket: connection)
  session.onClose = { [weak session] in if activeSession === session { activeSession = nil } }
  activeSession = session
  session.start()
}
listener.stateUpdateHandler = { state in
  switch state {
  case .ready: log("Paperang bridge listening on ws://127.0.0.1:\(bridgePort). Keep this window open while printing.")
  case .failed(let error): log("Bridge stopped: \(error)"); exit(1)
  default: break
  }
}
listener.start(queue: .main)
RunLoop.main.run()
