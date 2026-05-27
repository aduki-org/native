// tools/src/logs/src/lib.rs

pub mod fmt;

#[doc(hidden)]
pub use tracing;

/// Initialize the logger with the custom subscriber
pub fn init() {
  use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

  let env_filter = tracing_subscriber::EnvFilter::try_from_default_env()
    .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info"));

  let fmt_layer = tracing_subscriber::fmt::layer()
    .event_format(fmt::CustomFormatter)
    .with_writer(std::io::stdout);

  tracing_subscriber::registry()
    .with(env_filter)
    .with(fmt_layer)
    .init();
}

#[macro_export]
macro_rules! info {
    ($($arg:tt)+) => { $crate::tracing::info!(target: "info", $($arg)+) };
}

#[macro_export]
macro_rules! debug {
    ($($arg:tt)+) => { $crate::tracing::debug!(target: "debug", $($arg)+) };
}

#[macro_export]
macro_rules! trace {
    ($($arg:tt)+) => { $crate::tracing::trace!(target: "trace", $($arg)+) };
}

#[macro_export]
macro_rules! error {
    ($($arg:tt)+) => { $crate::tracing::error!(target: "error", $($arg)+) };
}

#[macro_export]
macro_rules! warn {
    ($($arg:tt)+) => { $crate::tracing::warn!(target: "warn", $($arg)+) };
}

#[macro_export]
macro_rules! success {
    ($($arg:tt)+) => { $crate::tracing::info!(target: "success", $($arg)+) };
}

// Dev Pipeline specific categories
#[macro_export]
macro_rules! watcher {
    ($($arg:tt)+) => { $crate::tracing::info!(target: "watcher", $($arg)+) };
}

#[macro_export]
macro_rules! compiler {
    ($($arg:tt)+) => { $crate::tracing::info!(target: "compiler", $($arg)+) };
}

#[macro_export]
macro_rules! server {
    ($($arg:tt)+) => { $crate::tracing::info!(target: "server", $($arg)+) };
}

#[macro_export]
macro_rules! hmr {
    ($($arg:tt)+) => { $crate::tracing::info!(target: "hmr", $($arg)+) };
}

#[macro_export]
macro_rules! sync {
    ($($arg:tt)+) => { $crate::tracing::info!(target: "sync", $($arg)+) };
}
