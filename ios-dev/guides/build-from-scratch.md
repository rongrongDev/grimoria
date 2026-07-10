# Build From Scratch: A Minimal, Architecturally Sound SwiftUI App

> **Applies to:** Swift 6.2, Swift 6 language mode · SwiftUI, iOS 17+ deployment · Xcode 26 · Swift Testing · **Last reviewed:** 2026-07-06
> **Capability A.** Follow start-to-finish to produce a small app that is *correct by construction*: single-owner state, structured-concurrency data layer, injected dependencies, deterministic tests. Every choice links to the doc that justifies it. The app: "Reading List" — fetch articles from an API, show them, mark favorites, persist favorites locally. Small enough to finish, real enough to contain every seam that matters.

## 0. Project setup (10 minutes)

1. Xcode → New Project → iOS App. Interface: SwiftUI. Testing System: **Swift Testing**. No Core Data checkbox (we persist trivially; storage frameworks are a later decision, and defaulting into one is how apps marry a store before knowing their data).
2. Target → Build Settings: **Swift Language Version = Swift 6** — from day zero, so concurrency errors arrive one at a time as you write, never as a migration.
3. Deployment target iOS 17 (gives `@Observable`; see [../topics/state-and-architecture.md](../topics/state-and-architecture.md)).
4. Create the app's real structure as **folders now, SPM packages when the app grows** ([../principles/multi-agent-orchestration.md](../principles/multi-agent-orchestration.md) explains why packages also pay for agent workflows):

```
ReadingList/
  App/            ← @main, composition root
  Models/         ← imports Foundation ONLY (the rule from architecture-judgment.md Q3)
  Services/       ← protocols + live implementations (network, persistence)
  Features/
    ArticleList/  ← view + view model
```

## 1. Models — Sendable values, nothing else

```swift
// Models/Article.swift
import Foundation

struct Article: Identifiable, Hashable, Codable, Sendable {
    let id: Int
    let title: String
    let url: URL
    let summary: String
}
```

`Sendable` value types are the cheapest concurrency tool you own ([../principles/concurrency-judgment.md](../principles/concurrency-judgment.md)) — this struct crosses every isolation boundary in the app for free. No `import SwiftUI` here, ever.

## 2. Services — protocol seams + live implementations

The protocol is the *test seam* ([../principles/architecture-judgment.md](../principles/architecture-judgment.md) Q2: "constructible with fakes in one line"). Note both protocols are `Sendable`-constrained so implementations can be used from any isolation.

```swift
// Services/ArticleGateway.swift
import Foundation

protocol ArticleGateway: Sendable {
    func fetchArticles() async throws -> [Article]
}

struct LiveArticleGateway: ArticleGateway {
    var baseURL = URL(string: "https://api.example.com")!
    let session: URLSession = .shared

    func fetchArticles() async throws -> [Article] {
        let (data, response) = try await session.data(from: baseURL.appending(path: "articles"))
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw URLError(.badServerResponse)
        }
        return try JSONDecoder().decode([Article].self, from: data)
    }
}
```

Why this shape: `URLSession.data(from:)` is already async and **honors task cancellation** — the cancel-previous pattern in §4 works end-to-end with zero extra code ([../topics/async-patterns.md](../topics/async-patterns.md) §1). No retry/caching layers yet: add them when a requirement, not a habit, demands ([../principles/architecture-judgment.md](../principles/architecture-judgment.md), "boring wins").

Favorites persistence — an **actor**, because it's shared mutable state with I/O ([../principles/concurrency-judgment.md](../principles/concurrency-judgment.md): actors for *shared mutable services*, and this is the only one the app has):

```swift
// Services/FavoritesStore.swift
import Foundation

protocol FavoritesStoring: Sendable {
    func load() async -> Set<Article.ID>
    func toggle(_ id: Article.ID) async -> Set<Article.ID>
}

actor FileFavoritesStore: FavoritesStoring {
    private let fileURL: URL
    private var cached: Set<Article.ID>?

    init(directory: URL = .documentsDirectory) {
        self.fileURL = directory.appending(path: "favorites.json")
    }

    func load() async -> Set<Article.ID> {
        if let cached { return cached }
        let loaded = (try? Data(contentsOf: fileURL)).flatMap { try? JSONDecoder().decode(Set<Article.ID>.self, from: $0) } ?? []
        cached = loaded
        return loaded
    }

    func toggle(_ id: Article.ID) async -> Set<Article.ID> {
        var favs = await load()
        if !favs.insert(id).inserted { favs.remove(id) }
        cached = favs                                  // write state BEFORE the suspension-free save —
        try? JSONEncoder().encode(favs).write(to: fileURL) // no await between read-modify-write: no reentrancy window
        return favs                                    // (topics/concurrency.md §2 — this ordering is deliberate)
    }
}
```

`Data(contentsOf:)` on a local file inside an *actor* is fine (off main); the same call on main or for a remote URL is the classic hang ([../topics/performance.md](../topics/performance.md) §1).

## 3. Feature — `@Observable` view model, `@MainActor`, no owned Tasks

```swift
// Features/ArticleList/ArticleListModel.swift
import Foundation
import Observation

@MainActor @Observable
final class ArticleListModel {
    enum Phase: Equatable { case idle, loading, loaded, failed(String) }

    private(set) var phase: Phase = .idle
    private(set) var articles: [Article] = []
    private(set) var favorites: Set<Article.ID> = []

    private let gateway: any ArticleGateway
    private let favoritesStore: any FavoritesStoring

    init(gateway: any ArticleGateway, favoritesStore: any FavoritesStoring) {
        self.gateway = gateway
        self.favoritesStore = favoritesStore
    }

    func load() async {
        phase = .loading
        do {
            async let articles = gateway.fetchArticles()     // structured: both run concurrently,
            async let favorites = favoritesStore.load()      // cancellation propagates to both
            self.articles = try await articles
            self.favorites = await favorites
            phase = .loaded
        } catch is CancellationError {
            // navigated away mid-load: not an error, show nothing (topics/concurrency.md §5c)
        } catch {
            phase = .failed(error.localizedDescription)
        }
    }

    func toggleFavorite(_ id: Article.ID) async {
        favorites = await favoritesStore.toggle(id)
    }
}
```

Deliberate choices, each carrying a doc's weight:
- **`@MainActor`** on the whole model: it's UI-facing state; isolate correctly first, optimize when the profiler says so ([../principles/concurrency-judgment.md](../principles/concurrency-judgment.md)).
- **`func load() async` instead of `Task { }` in `init`**: the *view* owns async lifetime via `.task`, so cancellation rides view identity by construction, and tests just `await vm.load()` ([../topics/state-and-architecture.md](../topics/state-and-architecture.md) §5, [../topics/testing.md](../topics/testing.md) §1). The model owns **no** unstructured tasks → nothing to leak ([../topics/memory-management.md](../topics/memory-management.md) §5).
- **`async let` pair**: structured concurrency for the parallel fetch — abandon `load()` and both children cancel ([../topics/concurrency.md](../topics/concurrency.md) §5).
- `phase` as one enum, not three booleans: impossible states unrepresentable.

## 4. View — ownership syntax exactly as declared

```swift
// Features/ArticleList/ArticleListView.swift
import SwiftUI

struct ArticleListView: View {
    @State private var model: ArticleListModel          // THIS view owns the model
    init(model: ArticleListModel) { _model = State(initialValue: model) }

    var body: some View {
        List(model.articles) { article in
            ArticleRow(article: article,
                       isFavorite: model.favorites.contains(article.id)) {
                Task { await model.toggleFavorite(article.id) }   // fire-once, short-lived: fine unstructured
            }
        }
        .overlay {                                        // overlay, NOT if/else around List:
            switch model.phase {                          // one identity, varying content
            case .loading where model.articles.isEmpty: ProgressView()
            case .failed(let message): ContentUnavailableView(message, systemImage: "wifi.slash")
            default: EmptyView()
            }
        }
        .refreshable { await model.load() }
        .task { await model.load() }                      // cancelled automatically on disappear
    }
}

struct ArticleRow: View {
    let article: Article           // leaf views take VALUES, not the model —
    let isFavorite: Bool           // row re-renders only when ITS data changes
    let onToggleFavorite: () -> Void

    var body: some View {
        HStack {
            VStack(alignment: .leading) {
                Text(article.title).font(.headline)
                Text(article.summary).font(.subheadline).lineLimit(2)
            }
            Spacer()
            Button(action: onToggleFavorite) {
                Image(systemName: isFavorite ? "star.fill" : "star")
            }
        }
    }
}
```

The three view rules in play: `@State` ownership of the VM ([../topics/state-and-architecture.md](../topics/state-and-architecture.md) §1), one-identity-varying-content instead of branchy `if/else` (§2), plain values into leaf rows (§3 / [../topics/performance.md](../topics/performance.md) §2).

## 5. Composition root — the only place that knows the wiring

```swift
// App/ReadingListApp.swift
import SwiftUI

@main
struct ReadingListApp: App {
    var body: some Scene {
        WindowGroup {
            ArticleListView(model: ArticleListModel(
                gateway: LiveArticleGateway(),
                favoritesStore: FileFavoritesStore()
            ))
        }
    }
}
```

One file constructs the object graph; nothing anywhere reaches for `.shared` ([../principles/architecture-judgment.md](../principles/architecture-judgment.md) Q2). When UI-test mock-mode arrives ([../topics/testing.md](../topics/testing.md) §4), it's an `if ProcessInfo.processInfo.arguments.contains("-uiTesting")` branch *here* and nowhere else.

## 6. Tests — deterministic, fast, asserting behavior

```swift
// Tests/ArticleListModelTests.swift
import Testing
import Foundation
@testable import ReadingList

struct GatewayStub: ArticleGateway {
    var result: Result<[Article], Error>
    func fetchArticles() async throws -> [Article] { try result.get() }
}

actor FavoritesStoreSpy: FavoritesStoring {
    private var favs: Set<Article.ID> = []
    private(set) var toggleCount = 0
    func load() async -> Set<Article.ID> { favs }
    func toggle(_ id: Article.ID) async -> Set<Article.ID> {
        toggleCount += 1
        if !favs.insert(id).inserted { favs.remove(id) }
        return favs
    }
}

@MainActor                                   // suite isolation matches the subject (topics/testing.md §2)
struct ArticleListModelTests {
    let sample = Article(id: 1, title: "T", url: URL(string: "https://x.y")!, summary: "S")

    @Test func loadSuccessPublishesArticles() async {
        let model = ArticleListModel(gateway: GatewayStub(result: .success([sample])),
                                     favoritesStore: FavoritesStoreSpy())
        await model.load()
        #expect(model.phase == .loaded)
        #expect(model.articles == [sample])
    }

    @Test func loadFailurePublishesError() async {
        let model = ArticleListModel(gateway: GatewayStub(result: .failure(URLError(.notConnectedToInternet))),
                                     favoritesStore: FavoritesStoreSpy())
        await model.load()
        #expect(model.phase != .loaded)
        #expect(model.articles.isEmpty)
    }

    @Test func toggleFavoriteRoundTrips() async {
        let spy = FavoritesStoreSpy()
        let model = ArticleListModel(gateway: GatewayStub(result: .success([sample])), favoritesStore: spy)
        await model.load()
        await model.toggleFavorite(sample.id)
        #expect(model.favorites == [sample.id])
        await model.toggleFavorite(sample.id)
        #expect(model.favorites.isEmpty)
        #expect(await spy.toggleCount == 2)
    }
}

// The lifetime gate from topics/memory-management.md — cheap forever-insurance:
@MainActor
struct LifetimeTests {
    @Test func modelDeallocates() async {
        weak var weakModel: ArticleListModel?
        do {
            let model = ArticleListModel(gateway: GatewayStub(result: .success([])),
                                         favoritesStore: FavoritesStoreSpy())
            await model.load()
            weakModel = model
        }
        #expect(weakModel == nil, "ArticleListModel leaked — check retainer chain in the memory graph")
    }
}
```

No sleeps, no real network, no clocks — everything awaited directly because the API surface is async ([../topics/testing.md](../topics/testing.md) §1). The `FileFavoritesStore` actor gets its own integration test writing to a temp directory (constructor already takes `directory:` — that parameter *is* the testability).

## 7. Ship-readiness increments (in the order that pays)

1. **Lint gates**: SwiftLint with `weak_delegate`, `unowned_variable_capture`, custom rules from [../topics/memory-management.md](../topics/memory-management.md) prevention table.
2. **CI**: build + test on every PR, oldest-supported-OS simulator row ([../topics/release-and-platform.md](../topics/release-and-platform.md) §4).
3. **MetricKit subscriber + phased-release habit** before the first App Store build, not after the first incident ([../topics/performance.md](../topics/performance.md), [../topics/release-and-platform.md](../topics/release-and-platform.md) §3).
4. **When screens multiply**: folders → SPM packages along the same boundaries; navigation via `NavigationStack(path:)` with the path owned at the root — reassess MVVM-vs-TCA only against the criteria in [../principles/architecture-judgment.md](../principles/architecture-judgment.md).

## What was deliberately left out (so you don't add it reflexively)

Core Data/SwiftData (a JSON file met the requirement), a networking abstraction layer (one protocol + URLSession did), Combine (no hot multi-subscriber streams exist here — [../topics/async-patterns.md](../topics/async-patterns.md) positioning), a DI framework (one composition-root file), and any singleton. Each has a doc-linked trigger for when it *earns* entry. That restraint is the architecture.
