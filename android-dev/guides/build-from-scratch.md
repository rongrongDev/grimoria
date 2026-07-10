# Build From Scratch — A Minimal, Architecturally Sound Compose App

> **Applies to:** Kotlin 2.2.x, AGP 8.12, Compose BOM 2026.06, Hilt 2.56+, minSdk 26 / targetSdk 36 · **Last reviewed:** 2026-07-06
> **You need:** Android Studio (current stable), JDK 17+. Exact dependency versions: take the latest stable at build time; the *structure* here is what's durable.
> **Related:** [architecture.md](../principles/architecture.md) · [concurrency.md](../principles/concurrency.md) · [testing.md](../principles/testing.md)

The app: **"Notes"** — a list of notes + add note, backed by Room, one screen. Deliberately minimal, but every structural decision is the production-grade one, and each is annotated with *why* and a pointer to the principle it instantiates. Follow top to bottom; checkpoints tell you what must work before continuing. Single module (`app`) with package discipline — correct for this size ([build-and-release.md](../principles/build-and-release.md): "modularization is a scaling tool, not a virtue").

## 0. Project skeleton

New project → "Empty Activity (Compose)". Then replace the build setup:

**`gradle/libs.versions.toml`** (version catalog from day one — single version source):

```toml
[versions]
agp = "8.12.0"            # take current stable
kotlin = "2.2.0"
ksp = "2.2.0-2.0.2"       # must match kotlin version prefix
composeBom = "2026.06.00"
hilt = "2.56"
room = "2.7.1"
lifecycle = "2.9.0"
coroutines = "1.10.2"
turbine = "1.2.0"
junit = "4.13.2"

[libraries]
compose-bom = { group = "androidx.compose", name = "compose-bom", version.ref = "composeBom" }
compose-material3 = { group = "androidx.compose.material3", name = "material3" }
compose-ui-tooling = { group = "androidx.compose.ui", name = "ui-tooling" }
lifecycle-runtime-compose = { group = "androidx.lifecycle", name = "lifecycle-runtime-compose", version.ref = "lifecycle" }
lifecycle-viewmodel-compose = { group = "androidx.lifecycle", name = "lifecycle-viewmodel-compose", version.ref = "lifecycle" }
activity-compose = { group = "androidx.activity", name = "activity-compose", version = "1.10.1" }
hilt-android = { group = "com.google.dagger", name = "hilt-android", version.ref = "hilt" }
hilt-compiler = { group = "com.google.dagger", name = "hilt-compiler", version.ref = "hilt" }
hilt-navigation-compose = { group = "androidx.hilt", name = "hilt-navigation-compose", version = "1.2.0" }
room-runtime = { group = "androidx.room", name = "room-runtime", version.ref = "room" }
room-ktx = { group = "androidx.room", name = "room-ktx", version.ref = "room" }
room-compiler = { group = "androidx.room", name = "room-compiler", version.ref = "room" }
coroutines-test = { group = "org.jetbrains.kotlinx", name = "kotlinx-coroutines-test", version.ref = "coroutines" }
turbine = { group = "app.cash.turbine", name = "turbine", version.ref = "turbine" }
junit = { group = "junit", name = "junit", version.ref = "junit" }
compose-ui-test-junit4 = { group = "androidx.compose.ui", name = "ui-test-junit4" }
compose-ui-test-manifest = { group = "androidx.compose.ui", name = "ui-test-manifest" }

[plugins]
android-application = { id = "com.android.application", version.ref = "agp" }
kotlin-android = { id = "org.jetbrains.kotlin.android", version.ref = "kotlin" }
kotlin-compose = { id = "org.jetbrains.kotlin.plugin.compose", version.ref = "kotlin" }
ksp = { id = "com.google.devtools.ksp", version.ref = "ksp" }
hilt = { id = "com.google.dagger.hilt.android", version.ref = "hilt" }
```

**`app/build.gradle.kts`** (essentials only):

```kotlin
plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.ksp)          // KSP, never kapt — see build-and-release.md
    alias(libs.plugins.hilt)
}

android {
    namespace = "dev.example.notes"
    compileSdk = 36
    defaultConfig {
        applicationId = "dev.example.notes"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "0.1"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }
    buildTypes {
        release {
            isMinifyEnabled = true    // minify from day one; discovering R8 breakage
            isShrinkResources = true  // at launch week is how it always goes otherwise
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }
    buildFeatures { compose = true }
    kotlinOptions { jvmTarget = "17" }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    val composeBom = platform(libs.compose.bom)
    implementation(composeBom)
    implementation(libs.compose.material3)
    implementation(libs.activity.compose)
    implementation(libs.lifecycle.runtime.compose)
    implementation(libs.lifecycle.viewmodel.compose)
    implementation(libs.hilt.android)
    ksp(libs.hilt.compiler)
    implementation(libs.hilt.navigation.compose)
    implementation(libs.room.runtime)
    implementation(libs.room.ktx)
    ksp(libs.room.compiler)
    debugImplementation(libs.compose.ui.tooling)

    testImplementation(libs.junit)
    testImplementation(libs.coroutines.test)
    testImplementation(libs.turbine)
    androidTestImplementation(composeBom)
    androidTestImplementation(libs.compose.ui.test.junit4)
    debugImplementation(libs.compose.ui.test.manifest)
}
```

`gradle.properties`: ensure `org.gradle.caching=true` and `org.gradle.configuration-cache=true`.

**Checkpoint 0:** `./gradlew :app:assembleDebug` succeeds.

## 1. Data layer (bottom-up, because each layer is testable without the one above)

Package layout: `data/` (Room + repository), `ui/notes/` (screen + VM), `di/`.

```kotlin
// data/Note.kt — the app-wide model. In a multi-module app this is the domain type;
// here entity and domain type coincide, acceptable at this size.
@Entity(tableName = "notes")
data class Note(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val text: String,
    val createdAt: Long,
)

// data/NoteDao.kt
@Dao
interface NoteDao {
    // Flow return type: Room makes this a *reactive* query — emits on every table change.
    // This is the single source of truth pattern: UI never asks "did it change", it observes.
    @Query("SELECT * FROM notes ORDER BY createdAt DESC")
    fun observeAll(): Flow<List<Note>>

    @Insert
    suspend fun insert(note: Note)   // suspend: Room moves it off-main. Never allowMainThreadQueries().
}

// data/NotesDatabase.kt
@Database(entities = [Note::class], version = 1, exportSchema = true) // exportSchema: true from v1 —
abstract class NotesDatabase : RoomDatabase() {                        // you need v1's schema file the day
    abstract fun noteDao(): NoteDao                                    // you write migration 1→2
}

// data/NoteRepository.kt — the API the rest of the app sees. Contract (architecture.md):
// main-safe, Flow/suspend, owns the source of truth.
interface NoteRepository {
    fun observeNotes(): Flow<List<Note>>
    suspend fun add(text: String)
}

class RoomNoteRepository @Inject constructor(
    private val dao: NoteDao,
    private val clock: () -> Long,           // injected clock — makes createdAt testable
) : NoteRepository {
    override fun observeNotes(): Flow<List<Note>> = dao.observeAll()
    override suspend fun add(text: String) {
        val trimmed = text.trim()
        require(trimmed.isNotEmpty()) { "blank note" }  // validation lives below the VM: every caller gets it
        dao.insert(Note(text = trimmed, createdAt = clock()))
    }
}
```

```kotlin
// di/AppModule.kt
@Module
@InstallIn(SingletonComponent::class)
object AppModule {
    @Provides @Singleton
    fun database(@ApplicationContext ctx: Context): NotesDatabase =
        Room.databaseBuilder(ctx, NotesDatabase::class.java, "notes.db").build()

    @Provides fun noteDao(db: NotesDatabase): NoteDao = db.noteDao()
    @Provides fun clock(): () -> Long = System::currentTimeMillis
}

@Module
@InstallIn(SingletonComponent::class)
interface BindsModule {
    @Binds fun noteRepository(impl: RoomNoteRepository): NoteRepository
}
```

## 2. ViewModel — single UiState, UDF, process-death aware

```kotlin
// ui/notes/NotesViewModel.kt
data class NotesUiState(
    val notes: List<Note> = emptyList(),
    val draft: String = "",
    val isLoading: Boolean = true,
    val errorMessage: String? = null,   // "event as state" — see concurrency.md, Flow judgment calls
)

@HiltViewModel
class NotesViewModel @Inject constructor(
    private val repository: NoteRepository,
    private val savedState: SavedStateHandle,   // survives process death; VM alone does NOT
) : ViewModel() {

    // Draft is user-typed work → must survive process death → SavedStateHandle
    // (lifecycle-and-state.md, "where state belongs"). getStateFlow gives us a
    // reactive, restored-on-recreation value in one line.
    private val draft = savedState.getStateFlow(KEY_DRAFT, "")
    private val error = MutableStateFlow<String?>(null)
    private val loading = MutableStateFlow(true)

    // WhileSubscribed(5_000): survives rotation without restarting the DB query,
    // stops when the screen is truly gone (concurrency.md, failure #4).
    val uiState: StateFlow<NotesUiState> =
        combine(repository.observeNotes(), draft, error, loading) { notes, d, e, _ ->
            NotesUiState(notes = notes, draft = d, isLoading = false, errorMessage = e)
        }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), NotesUiState())

    fun onDraftChange(value: String) { savedState[KEY_DRAFT] = value }

    fun onAddClicked() {
        val text = draft.value
        viewModelScope.launch {
            try {
                repository.add(text)
                savedState[KEY_DRAFT] = ""
            } catch (e: CancellationException) {
                throw e                             // ALWAYS rethrow — concurrency.md failure #2
            } catch (e: Exception) {
                error.value = "Couldn't save note"
            }
        }
    }

    fun onErrorShown() { error.value = null }       // consumer acknowledges the "event"

    companion object { const val KEY_DRAFT = "draft" }
}
```

Note what's *absent*: no `init { load() }` fetch (the Room Flow is the loader, started by subscription); no `LiveData`; no second source of truth for the list.

## 3. UI — stateless screen + thin stateful wrapper

```kotlin
// ui/notes/NotesScreen.kt
@Composable
fun NotesRoute(viewModel: NotesViewModel = hiltViewModel()) {
    // collectAsStateWithLifecycle, never collectAsState — stops upstream when backgrounded
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    NotesScreen(
        state = state,
        onDraftChange = viewModel::onDraftChange,
        onAddClicked = viewModel::onAddClicked,
        onErrorShown = viewModel::onErrorShown,
    )
}

// Stateless: testable with createComposeRule and fake state, no VM/DI/emulator (testing.md).
@Composable
fun NotesScreen(
    state: NotesUiState,
    onDraftChange: (String) -> Unit,
    onAddClicked: () -> Unit,
    onErrorShown: () -> Unit,
) {
    val snackbarHostState = remember { SnackbarHostState() }
    state.errorMessage?.let { message ->
        LaunchedEffect(message) {                    // keyed effect: re-shows if a NEW error arrives
            snackbarHostState.showSnackbar(message)
            onErrorShown()
        }
    }
    Scaffold(
        snackbarHost = { SnackbarHost(snackbarHostState) },
        modifier = Modifier.fillMaxSize(),
    ) { padding ->
        Column(Modifier.padding(padding).fillMaxSize()) {   // consume scaffold padding: edge-to-edge
            Row(Modifier.padding(16.dp)) {
                OutlinedTextField(
                    value = state.draft,
                    onValueChange = onDraftChange,
                    label = { Text("New note") },
                    modifier = Modifier.weight(1f),
                )
                Button(
                    onClick = onAddClicked,
                    enabled = state.draft.isNotBlank(),
                    modifier = Modifier.align(Alignment.CenterVertically).padding(start = 8.dp),
                ) { Text("Add") }
            }
            LazyColumn(Modifier.fillMaxSize()) {
                items(state.notes, key = { it.id }) { note ->   // stable keys: correct animations,
                    ListItem(headlineContent = { Text(note.text) }) // no full-list rebind on insert
                }
            }
        }
    }
}
```

```kotlin
// NotesApp.kt + MainActivity.kt
@HiltAndroidApp class NotesApp : Application()

@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()                       // mandatory posture at targetSdk 35+
        setContent { MaterialTheme { NotesRoute() } }
    }
}
```

Manifest: set `android:name=".NotesApp"` on `<application>`. No other components; nothing exported.

**Checkpoint 1:** App runs; add a note; **rotate** (note + draft survive); **process-death test**: background the app, `adb shell am kill dev.example.notes`, relaunch from Recents → list restores (Room) *and draft text restores* (SavedStateHandle). If the draft is gone, you wired `remember` somewhere it shouldn't be.

## 4. Tests — one per layer, the patterns that scale

```kotlin
// test/.../NotesViewModelTest.kt  (JVM, milliseconds)
class MainDispatcherRule(
    private val dispatcher: TestDispatcher = StandardTestDispatcher(),
) : TestWatcher() {
    override fun starting(description: Description) = Dispatchers.setMain(dispatcher)
    override fun finished(description: Description) = Dispatchers.resetMain()
}

class FakeNoteRepository : NoteRepository {           // fake, not mock — we own it (testing.md)
    val notes = MutableStateFlow<List<Note>>(emptyList())
    var failNextAdd = false
    override fun observeNotes(): Flow<List<Note>> = notes
    override suspend fun add(text: String) {
        if (failNextAdd) throw IOException("boom")
        notes.update { it + Note(id = it.size + 1L, text = text.trim(), createdAt = 0) }
    }
}

class NotesViewModelTest {
    @get:Rule val mainDispatcherRule = MainDispatcherRule()
    private val repo = FakeNoteRepository()
    private fun vm(handle: SavedStateHandle = SavedStateHandle()) = NotesViewModel(repo, handle)

    // runTest shares the virtual clock with Dispatchers.Main because the rule installed
    // a TestDispatcher — so advanceUntilIdle() below drives viewModelScope coroutines too.
    @Test fun `add appends note and clears draft`() = runTest {
        val vm = vm()
        vm.uiState.test {                              // Turbine collects → stateIn upstream starts
            skipItems(1)                               // initial value
            vm.onDraftChange("  hello  ")
            vm.onAddClicked()
            advanceUntilIdle()
            val state = expectMostRecentItem()         // settled state, not fragile intermediate
            assertEquals(listOf("hello"), state.notes.map { it.text })   // trimmed by the repo
            assertEquals("", state.draft)
        }
    }

    @Test fun `failed add surfaces error as state`() = runTest {
        val vm = vm()
        repo.failNextAdd = true
        vm.uiState.test {
            skipItems(1)
            vm.onDraftChange("x"); vm.onAddClicked()
            advanceUntilIdle()
            assertEquals("Couldn't save note", expectMostRecentItem().errorMessage)
        }
    }

    @Test fun `draft restores after process death`() = runTest {
        // SavedStateHandle IS the process-death seam: construct the VM as the OS would
        // after restoration, with the previously saved values.
        val vm = vm(SavedStateHandle(mapOf(NotesViewModel.KEY_DRAFT to "restored")))
        vm.uiState.test {
            advanceUntilIdle()
            assertEquals("restored", expectMostRecentItem().draft)
        }
    }
}
```

Note the pattern: **assert on the settled state** (`advanceUntilIdle()` + `expectMostRecentItem()`), not on exact emission sequences — StateFlow conflates, so intermediate states may legally never be observed ([testing.md](../principles/testing.md)).

```kotlin
// androidTest/.../NotesScreenTest.kt — stateless composable, fake state, captured callbacks
class NotesScreenTest {
    @get:Rule val compose = createComposeRule()

    @Test fun addButton_disabledWhenDraftBlank_firesCallbackWhenClicked() {
        var clicked = false
        compose.setContent {
            NotesScreen(
                state = NotesUiState(draft = "hi", isLoading = false),
                onDraftChange = {}, onAddClicked = { clicked = true }, onErrorShown = {},
            )
        }
        compose.onNodeWithText("Add").assertIsEnabled().performClick()
        assertTrue(clicked)
    }

    @Test fun notes_areDisplayed() {
        compose.setContent {
            NotesScreen(
                state = NotesUiState(notes = listOf(Note(1, "first", 0), Note(2, "second", 0))),
                onDraftChange = {}, onAddClicked = {}, onErrorShown = {},
            )
        }
        compose.onNodeWithText("first").assertIsDisplayed()
        compose.onNodeWithText("second").assertIsDisplayed()
    }
}
```

**Checkpoint 2:** `./gradlew :app:testDebugUnitTest` green; `./gradlew :app:connectedDebugAndroidTest` green on an emulator (or run the screen tests on Robolectric if you add it).

**Checkpoint 3 (the one everyone skips):** `./gradlew :app:assembleRelease`, install the release build, add a note. You enabled R8 in step 0; verify it now, while the app is 400 lines, not at launch week ([build-and-release.md](../principles/build-and-release.md) failure #1).

## 5. Where to grow from here

| Next need | Reach for | Doc |
|---|---|---|
| Second screen | Navigation-Compose, type-safe routes, pass IDs not objects | [architecture.md](../principles/architecture.md) |
| Network sync | Retrofit/Ktor behind the same repository; Room stays SSOT; kotlinx-serialization (R8-safe) | [build-and-release.md](../principles/build-and-release.md) |
| Background sync | WorkManager, idempotent worker, KEEP policy | [background-work.md](../principles/background-work.md) |
| Auth/tokens | DataStore + Keystore-backed crypto via Tink | [security.md](../principles/security.md) |
| 3+ modules | convention plugins in `build-logic/` | [build-and-release.md](../principles/build-and-release.md) |
