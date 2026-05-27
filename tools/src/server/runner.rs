// tools/src/server/runner.rs

use std::convert::Infallible;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

use axum::{
    body::Body,
    extract::State,
    handler::Handler,
    http::{header, Response, StatusCode},
    response::sse::{Event, KeepAlive, Sse},
    routing::get,
    Router,
};
use futures_util::stream::{self, Stream};
use tokio::sync::broadcast;
use tower_http::cors::CorsLayer;
use tower_http::services::ServeDir;

use crate::types::HmrMessage;

pub struct ServerState {
    pub tx: broadcast::Sender<HmrMessage>,
    pub src_dir: PathBuf,
}

pub async fn run(port: u16, src_dir: &Path, tx: broadcast::Sender<HmrMessage>) {
    let state = Arc::new(ServerState {
        tx,
        src_dir: src_dir.to_path_buf(),
    });

    let serve_dir = ServeDir::new(src_dir).fallback(
        handle_html_fallback.with_state(state.clone())
    );

    let app = Router::new()
        .route("/hmr", get(hmr_handler))
        .fallback_service(serve_dir)
        .layer(CorsLayer::permissive())
        .with_state(state);

    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{}", port))
        .await
        .unwrap();
    logs::server!("Dev Server launched at http://localhost:{}", port);

    axum::serve(listener, app).await.unwrap();
}

async fn hmr_handler(
    State(state): State<Arc<ServerState>>,
) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let rx = state.tx.subscribe();
    logs::server!("SSE browser client subscribed to hot reload stream");

    let stream = stream::unfold(rx, |mut rx| async move {
        match rx.recv().await {
            Ok(msg) => {
                logs::hmr!("Dispatched live reload event: {:?} -> {}", msg.kind, msg.path);
                let event = Event::default()
                    .data(serde_json::to_string(&msg).unwrap_or_default());
                Some((Ok(event), rx))
            }
            Err(_) => None,
        }
    });

    Sse::new(stream).keep_alive(KeepAlive::new().interval(Duration::from_secs(15)))
}

/// Automatically serves served HTML files, injecting the HMR live reload client script
async fn handle_html_fallback(
    State(state): State<Arc<ServerState>>,
    req: axum::http::Request<Body>,
) -> Response<Body> {
    let path = req.uri().path();
    let file_path = state.src_dir.join(path.trim_start_matches('/'));

    let html_file = if file_path.is_dir() {
        file_path.join("index.html")
    } else if file_path.extension().map_or(false, |ext| ext == "html") {
        file_path
    } else {
        return Response::builder()
            .status(StatusCode::NOT_FOUND)
            .body(Body::from("404 Not Found"))
            .unwrap();
    };

    match std::fs::read_to_string(&html_file) {
        Ok(html) => {
            logs::server!("Serving HTML with dynamically injected HMR payload: {}", path);
            let injected_html = inject_hmr_script(&html);
            Response::builder()
                .header(header::CONTENT_TYPE, "text/html; charset=utf-8")
                .body(Body::from(injected_html))
                .unwrap()
        }
        Err(_) => Response::builder()
            .status(StatusCode::NOT_FOUND)
            .body(Body::from("404 Not Found"))
            .unwrap(),
    }
}

fn inject_hmr_script(html: &str) -> String {
    let script = r#"
<!-- Native HMR Live-Reload Script -->
<script type="module">
  const sse = new EventSource('/hmr');
  sse.addEventListener('message', async (e) => {
    try {
      const msg = JSON.parse(e.data);
      if (msg.kind === 'css') {
        console.log('[HMR] Hot-swapping stylesheet:', msg.path);
        // 1. Hot-swap normal link tags
        const links = document.querySelectorAll(`link[href*="${msg.path}"]`);
        for (const link of links) {
          const url = new URL(link.href, location.origin);
          url.searchParams.set('hmr', Date.now());
          link.href = url.href;
        }

        // 2. Fetch fresh style and notify active AdoptedStyleSheets in Shadow DOM
        const res = await fetch(`/${msg.path}?hmr=${Date.now()}`);
        if (res.ok) {
          const css = await res.text();
          window.dispatchEvent(new CustomEvent('native:hmr:css', {
            detail: { path: msg.path, css }
          }));
        }
      } else if (msg.kind === 'js' || msg.kind === 'html' || msg.kind === 'reload') {
        console.log('[HMR] Asset changed, performing hot-reload:', msg.path);
        location.reload();
      }
    } catch (err) {
      console.error('[HMR] Error processing message:', err);
    }
  });
</script>
"#;

    if let Some(pos) = html.rfind("</body>") {
        let (first, last) = html.split_at(pos);
        format!("{}{}{}", first, script, last)
    } else {
        format!("{}{}", html, script)
    }
}
