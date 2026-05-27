// tools/src/logs/src/fmt.rs

use chrono::Local;
use std::fmt;
use tracing::{Event, Subscriber};
use tracing_subscriber::{
  fmt::{format::Writer, FmtContext, FormatEvent, FormatFields},
  registry::LookupSpan,
};

pub struct CustomFormatter;

impl<S, N> FormatEvent<S, N> for CustomFormatter
where
  S: Subscriber + for<'a> LookupSpan<'a>,
  N: for<'a> FormatFields<'a> + 'static,
{
  fn format_event(
    &self,
    _ctx: &FmtContext<'_, S, N>,
    mut writer: Writer<'_>,
    event: &Event<'_>,
  ) -> fmt::Result {
    let meta = event.metadata();
    let target = meta.target();

    let color = get_color(target, meta.level());
    let reset = "\x1b[0m";
    let gray = "\x1b[90m";

    let timestamp = Local::now().format("%Y-%m-%d %H:%M:%S");

    // Write timestamp
    write!(writer, "{}[{}]{} ", gray, timestamp, reset)?;

    // Determine label to print
    let label = match target {
      t if t.starts_with("logs::") => t.replace("logs::", "").to_uppercase(),
      t if is_known_category(t) => t.to_uppercase(),
      // fallback
      _ => meta.level().as_str().to_uppercase(),
    };

    write!(writer, "{}{}:{} ", color, label, reset)?;

    // Use a custom visitor to print fields nicely
    let mut visitor = EventVisitor {
      writer: &mut writer,
      has_fields: false,
    };
    event.record(&mut visitor);
    drop(visitor);

    writeln!(writer)
  }
}

fn is_known_category(t: &str) -> bool {
  matches!(
    t,
    "info"
      | "debug"
      | "success"
      | "watcher"
      | "compiler"
      | "server"
      | "hmr"
      | "sync"
  )
}

fn get_color(target: &str, level: &tracing::Level) -> &'static str {
  match target {
    "info" => "\x1b[34m",           // blue
    "debug" => "\x1b[90m",          // gray
    "success" => "\x1b[1m\x1b[32m", // bold green
    "watcher" => "\x1b[93m",        // bright yellow
    "compiler" => "\x1b[36m",       // cyan
    "server" => "\x1b[94m",         // bright blue
    "hmr" => "\x1b[92m",            // bright green
    "sync" => "\x1b[90m",           // gray

    _ => match *level {
      tracing::Level::ERROR => "\x1b[1m\x1b[31m", // bold red
      tracing::Level::WARN => "\x1b[1m\x1b[33m",  // bold yellow
      tracing::Level::INFO => "\x1b[34m",         // blue
      tracing::Level::DEBUG => "\x1b[90m",        // gray
      tracing::Level::TRACE => "\x1b[90m",        // gray
    },
  }
}

struct EventVisitor<'a, 'writer> {
  writer: &'a mut Writer<'writer>,
  has_fields: bool,
}

impl<'a, 'writer> tracing::field::Visit for EventVisitor<'a, 'writer> {
  fn record_debug(&mut self, field: &tracing::field::Field, value: &dyn fmt::Debug) {
    if field.name() == "message" {
      // Write message without quotes if it comes from standard tracing macros
      let format_str = format!("{:?}", value);
      // standard std::fmt::Arguments comes out clean, strings have quotes
      if format_str.starts_with('"') && format_str.ends_with('"') && format_str.len() >= 2 {
        let _ = write!(self.writer, "{}", &format_str[1..format_str.len() - 1]);
      } else {
        let _ = write!(self.writer, "{}", format_str);
      }
    } else {
      if !self.has_fields {
        let _ = write!(self.writer, " \x1b[90m"); // start gray for fields
        self.has_fields = true;
      } else {
        let _ = write!(self.writer, " ");
      }
      let _ = write!(self.writer, "{}={:?}", field.name(), value);
    }
  }
}

impl<'a, 'writer> Drop for EventVisitor<'a, 'writer> {
  fn drop(&mut self) {
    if self.has_fields {
      let _ = write!(self.writer, "\x1b[0m"); // reset
    }
  }
}
