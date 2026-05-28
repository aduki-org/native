// tools/src/watcher/runner.rs

use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};
use notify::{Config, RecommendedWatcher, RecursiveMode, Watcher};
use tokio::sync::broadcast;

use crate::types::{ChangeKind, HmrMessage};

/// Starts the file system directory watcher and starts polling changes concurrently
pub fn start(src_path: PathBuf, types_path: PathBuf, tx: broadcast::Sender<HmrMessage>) {
    let (event_tx, mut event_rx) = tokio::sync::mpsc::unbounded_channel();

    let watcher = match SystemWatcher::new(&src_path, event_tx) {
        Ok(w) => w,
        Err(err) => {
            logs::error!("Failed to initialize file watcher: {:?}", err);
            return;
        }
    };

    logs::watcher!("Watching for changes in '{}' folder...", src_path.display());

    tokio::spawn(async move {
        let debounce_duration = Duration::from_millis(150);
        
        loop {
            // T-03: Await first filesystem event asynchronously without blocking tokio thread
            let first_event = match event_rx.recv().await {
                Some(Ok(evt)) => evt,
                _ => continue,
            };

            let mut events = vec![first_event];
            let mut last_activity = Instant::now();

            // Non-blocking peek/receive for quick successive saves within the debounce window
            while last_activity.elapsed() < debounce_duration {
                tokio::select! {
                    res = event_rx.recv() => {
                        if let Some(Ok(evt)) = res {
                            events.push(evt);
                            last_activity = Instant::now();
                        }
                    }
                    _ = tokio::time::sleep(Duration::from_millis(20)) => {}
                }
            }

            let mut messages = Vec::new();
            for event in events {
                for path in event.paths {
                    if let Some(msg) = watcher.classify_path(&path) {
                        // Prevent duplicate messages in the same batch
                        if !messages.iter().any(|m: &HmrMessage| m.path == msg.path && m.kind == msg.kind) {
                            messages.push(msg);
                        }
                    }
                }
            }

            for msg in messages {
                logs::watcher!("Event: {:?} -> {}", msg.kind, msg.path);
                
                // If a JS element changed, trigger a re-extraction pass
                if msg.kind == ChangeKind::Js {
                    crate::extract::run(&src_path, &types_path);
                } else if msg.kind == ChangeKind::Html {
                    let html_path = src_path.join(&msg.path);
                    if html_path.exists() {
                        if let Err(err) = crate::extract::html::parse_and_emit(&html_path) {
                            logs::error!("Failed to regenerate tags descriptor for {:?}: {}", html_path, err);
                        }
                    } else {
                        let mut descriptor_path = html_path.clone();
                        descriptor_path.set_extension("tags.json");
                        if let Err(err) = std::fs::remove_file(&descriptor_path) {
                            if err.kind() != std::io::ErrorKind::NotFound {
                                logs::error!("Failed to remove stale tags descriptor {:?}: {}", descriptor_path, err);
                            }
                        }
                    }
                }

                // Broadcast Event to Axum Connections
                let _ = tx.send(msg);
            }
        }
    });
}

pub struct SystemWatcher {
    _watcher: RecommendedWatcher,
    src_path: PathBuf,
}

impl SystemWatcher {
    pub fn new(
        src_path: &Path,
        tx: tokio::sync::mpsc::UnboundedSender<notify::Result<notify::Event>>,
    ) -> Result<Self, notify::Error> {
        let mut watcher = RecommendedWatcher::new(
            move |res| {
                let _ = tx.send(res);
            },
            Config::default().with_poll_interval(Duration::from_millis(100)),
        )?;

        watcher.watch(src_path, RecursiveMode::Recursive)?;

        Ok(Self {
            _watcher: watcher,
            src_path: src_path.to_path_buf(),
        })
    }

    fn classify_path(&self, path: &Path) -> Option<HmrMessage> {
        let extension = path.extension()?.to_str()?;
        let relative_path = path.strip_prefix(&self.src_path).ok()?.to_string_lossy().into_owned();

        match extension {
            "css" => Some(HmrMessage {
                kind: ChangeKind::Css,
                path: relative_path,
            }),
            "js" => Some(HmrMessage {
                kind: ChangeKind::Js,
                path: relative_path,
            }),
            "html" => Some(HmrMessage {
                kind: ChangeKind::Html,
                path: relative_path,
            }),
            _ => None,
        }
    }
}
