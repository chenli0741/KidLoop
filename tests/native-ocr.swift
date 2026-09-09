import AppKit
@main struct Smoke {
 static func main() throws {
  let image = NSImage(size: NSSize(width: 1000, height: 240))
  image.lockFocus()
  NSColor.white.setFill(); NSRect(x: 0,y: 0,width: 1000,height: 240).fill()
  ("KIDLOOP PICKUP 123\n学生接送测试" as NSString).draw(in: NSRect(x: 40,y: 30,width: 900,height: 180), withAttributes: [.font: NSFont.systemFont(ofSize: 48), .foregroundColor: NSColor.black])
  image.unlockFocus()
  let data = NSBitmapImageRep(data: image.tiffRepresentation!)!.representation(using: .png, properties: [:])!
  let result = try DeviceVision.recognize(data, languages: ["zh-Hans","en-US"])
  _ = try JSONSerialization.data(withJSONObject: result)
  let text = result["text"] as! String
  precondition(text.contains("KIDLOOP") && text.contains("123"), "OCR did not recover generated English text")
  precondition(text.contains("学生"), "OCR did not recover generated Chinese text")
  for block in result["blocks"] as! [[String: Any]] {
   let box=block["box"] as! [String: Double]
   precondition(box.values.allSatisfy { $0 >= 0 && $0 <= 1 })
  }
  do { _ = try DeviceVision.recognize(Data([0,1,2]), languages:["en-US"]); fatalError("Invalid data accepted") } catch {}
  print("PASS: generated Chinese/English OCR, normalized boxes, invalid-image rejection")
 }
}
