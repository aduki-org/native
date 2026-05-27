// tools/src/watcher/runner.rs

use std::path::{Path, PathBuf};
use std::sync::mpsc::{channel, Receiver};
use std::time::{Duration, Instant};
use notify::{Config, RecommendedWatcher, RecursiveMode, Watcher};
use tokio::sync::broadcast;

use crate::types::{ChangeKind, HmrMessage};

/// Starts the file system directory watcher and starts polling changes concurrently
pub fn start(src_path: PathBuf, types_path: PathBuf, tx: broadcast::Sender<HmrMessage>) {
    let watcher = match SystemWatcher::new(&src_path) {
        Ok(w) => w,
        Err(err) => {
            logs::error!("Failed to initialize file watcher: {:?}", err);
            return;
        }
    };

    logs::watcher!("Watching for changes in '{}' folder...", src_path.display());

    tokio::spawn(async move {
        loop {
            let messages = watcher.poll_events();
            for msg in messages {
                logs::watcher!("Event: {:?} -> {}", msg.kind, msg.path);
                
                // If a JS element changed, trigger a re-extraction pass
                if msg.kind == ChangeKind::Js {
                    crate::extract::run(&src_path, &types_path);
                }

                // Broadcast Event to Axum Connections
                let _ = tx.send(msg);
            }
            tokio::time::sleep(Duration::from_millis(50)).await;
        }
    });
}

pub struct SystemWatcher {
    _watcher: RecommendedWatcher,
    rx: Receiver<notify::Result<notify::Event>>,
    src_path: PathBuf,
}

impl SystemWatcher {
    pub fn new(src_path: &Path) -> Result<Self, notify::Error> {
        let (tx, rx) = channel();
        
        let mut watcher = RecommendedWatcher::new(
            move |res| {
                let _ = tx.send(res);
            },
            Config::default().with_poll_interval(Duration::from_millis(100)),
        )?;

        watcher.watch(src_path, RecursiveMode::Recursive)?;

        Ok(Self {
            _watcher: watcher,
            rx,
            src_path: src_path.to_path_buf(),
        })
    }

    /// Read incoming events, debouncing multiple quick changes
    pub fn poll_events(&self) -> Vec<HmrMessage> {
        let mut events = Vec::new();
        let mut last_activity = Instant::now();
        let debounce_duration = Duration::from_millis(150);

        // Block and read the first event (if any), then non-block read remaining debounced events
        if let Ok(Ok(event)) = self.rx.recv_timeout(Duration::from_millis(50)) {
            events.push(event);
            last_activity = Instant::now();

            while last_activity.elapsed() < debounce_duration {
                if let Ok(Ok(evt)) = self.rx.recv_timeout(Duration::from_millis(20)) {
                    events.push(evt);
                    last_activity = Instant::now();
                }
            }
        }

        let mut messages = Vec::new();
        for event in events {
            for path in event.paths {
                if let Some(msg) = self.classify_path(&path) {
                    // Prevent duplicate messages in the same batch
                    if !messages.iter().any(|m: &HmrMessage| m.path == msg.path && m.kind == msg.kind) {
                        messages.push(msg);
                    }
                }
            }
        }

        messages
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
