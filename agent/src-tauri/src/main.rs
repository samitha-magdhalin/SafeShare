#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    safeshare_agent_lib::run();
}
