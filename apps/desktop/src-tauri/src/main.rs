// Prevents a console window on Windows when the Tauri integration is enabled there.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    deepseek_harness_desktop_lib::run()
}
