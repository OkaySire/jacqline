fn main() {
    // Inject the build's commit SHA into the binary so the in-app updater
    // can compare it against the SHA on the nightly GitHub Release
    // (`target_commitish`). Falls back to `git rev-parse HEAD` for local
    // dev builds; falls back to "unknown" if even that fails (e.g. tarball
    // checkout without `.git`).
    println!("cargo:rerun-if-env-changed=GITHUB_SHA");
    println!("cargo:rerun-if-changed=../.git/HEAD");
    let sha: String = std::env::var("GITHUB_SHA").ok().unwrap_or_else(|| {
        std::process::Command::new("git")
            .args(["rev-parse", "HEAD"])
            .output()
            .ok()
            .and_then(|o| String::from_utf8(o.stdout).ok())
            .map(|s| s.trim().to_owned())
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| "unknown".to_owned())
    });
    println!("cargo:rustc-env=JACQLINE_GIT_SHA={sha}");
    tauri_build::build();
}
