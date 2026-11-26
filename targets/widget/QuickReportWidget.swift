import SwiftUI
import WidgetKit

// Widget bez danych: same skróty do tras appki (expo-router, adresy jak w src/lib/routes.ts).
// Stuknięcie otwiera appkę pod udpro:///app/new itd.; bez sesji appka pokaże logowanie (Stack.Protected).

enum UDLink {
  // Wariant dev ma własny scheme (app.config.js: udpro-dev) i bundle id …pro.dev.widget.
  static var scheme: String {
    (Bundle.main.bundleIdentifier ?? "").contains(".pro.dev") ? "udpro-dev" : "udpro"
  }
  static func url(_ path: String) -> URL { URL(string: "\(scheme)://\(path)")! }

  static var newReport: URL { url("/app/new") }      // zakładka „Nowe” (zdjęcia z galerii)
  static var camera: URL { url("/app/camera") }      // aparat poczekalni
  static var waitingRoom: URL { url("/app/waiting") } // poczekalnia
}

struct QuickEntry: TimelineEntry {
  let date: Date
}

struct QuickProvider: TimelineProvider {
  func placeholder(in context: Context) -> QuickEntry { QuickEntry(date: .now) }
  func getSnapshot(in context: Context, completion: @escaping (QuickEntry) -> Void) {
    completion(QuickEntry(date: .now))
  }
  // Treść się nie zmienia – jeden wpis, bez odświeżania.
  func getTimeline(in context: Context, completion: @escaping (Timeline<QuickEntry>) -> Void) {
    completion(Timeline(entries: [QuickEntry(date: .now)], policy: .never))
  }
}

extension View {
  // iOS 17+ wymaga containerBackground; na 16.x zwykłe tło.
  @ViewBuilder func udWidgetBackground(_ color: Color) -> some View {
    if #available(iOS 17.0, *) {
      containerBackground(color, for: .widget)
    } else {
      background(color)
    }
  }
}

// MARK: - Ekran główny

struct ActionTile: View {
  let title: String
  let symbol: String
  let url: URL
  var prominent = false

  var body: some View {
    Link(destination: url) {
      VStack(spacing: 6) {
        Image(systemName: symbol)
          .font(.system(size: 22, weight: .semibold))
        Text(title)
          .font(.system(size: 12, weight: .semibold))
          .multilineTextAlignment(.center)
          .lineLimit(2)
          .minimumScaleFactor(0.8)
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      .foregroundStyle(prominent ? Color("udPrimary") : .white)
      .background(
        RoundedRectangle(cornerRadius: 14, style: .continuous)
          .fill(prominent ? Color.white : Color.white.opacity(0.16))
      )
    }
  }
}

struct QuickReportView: View {
  @Environment(\.widgetFamily) private var family

  var body: some View {
    switch family {
    case .systemMedium:
      VStack(alignment: .leading, spacing: 8) {
        Text("Uprzejmie Donoszę")
          .font(.system(size: 13, weight: .bold))
          .foregroundStyle(.white.opacity(0.85))
        HStack(spacing: 8) {
          ActionTile(title: "Nowe zgłoszenie", symbol: "plus.circle.fill", url: UDLink.newReport, prominent: true)
          ActionTile(title: "Aparat", symbol: "camera.fill", url: UDLink.camera)
          ActionTile(title: "Poczekalnia", symbol: "photo.stack", url: UDLink.waitingRoom)
        }
      }
      .udWidgetBackground(Color("udPrimary"))

    default: // systemSmall: cały widget = nowe zgłoszenie
      VStack(alignment: .leading, spacing: 0) {
        Image(systemName: "plus.circle.fill")
          .font(.system(size: 40, weight: .semibold))
          .foregroundStyle(.white)
        Spacer(minLength: 0)
        Text("Nowe\nzgłoszenie")
          .font(.system(size: 18, weight: .bold))
          .foregroundStyle(.white)
          .lineLimit(2)
          .minimumScaleFactor(0.8)
        Text("Uprzejmie Donoszę")
          .font(.system(size: 11, weight: .semibold))
          .foregroundStyle(.white.opacity(0.75))
          .padding(.top, 2)
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
      .widgetURL(UDLink.newReport)
      .udWidgetBackground(Color("udPrimary"))
    }
  }
}

struct QuickReportWidget: Widget {
  let kind = "QuickReportWidget"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: QuickProvider()) { _ in
      QuickReportView()
    }
    .configurationDisplayName("Szybkie zgłoszenie")
    .description("Nowe zgłoszenie, aparat i poczekalnia jednym stuknięciem.")
    .supportedFamilies([.systemSmall, .systemMedium])
  }
}

// MARK: - Ekran blokady (aparat: zdjęcie od razu, zgłoszenie później z poczekalni)

struct LockCameraView: View {
  @Environment(\.widgetFamily) private var family

  var body: some View {
    Group {
      switch family {
      case .accessoryRectangular:
        HStack(spacing: 6) {
          Image(systemName: "camera.fill")
          VStack(alignment: .leading, spacing: 0) {
            Text("Zrób zdjęcie").font(.headline)
            Text("Uprzejmie Donoszę").font(.caption2)
          }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
      case .accessoryInline:
        Label("Zgłoś wykroczenie", systemImage: "camera.fill")
      default: // accessoryCircular
        ZStack {
          AccessoryWidgetBackground()
          Image(systemName: "camera.fill").font(.system(size: 20, weight: .semibold))
        }
      }
    }
    .widgetURL(UDLink.camera)
    .udWidgetBackground(.clear)
  }
}

struct LockCameraWidget: Widget {
  let kind = "LockCameraWidget"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: QuickProvider()) { _ in
      LockCameraView()
    }
    .configurationDisplayName("Aparat zgłoszeń")
    .description("Otwiera aparat – zdjęcia trafiają do poczekalni.")
    .supportedFamilies([.accessoryCircular, .accessoryRectangular, .accessoryInline])
  }
}

@main
struct UDWidgetBundle: WidgetBundle {
  var body: some Widget {
    QuickReportWidget()
    LockCameraWidget()
  }
}
