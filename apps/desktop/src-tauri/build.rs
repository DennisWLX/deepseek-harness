fn main() {
    let attributes = tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&["show_log_path", "open_devtools"]),
    );
    tauri_build::try_build(attributes).expect("failed to run Tauri build script")
}
