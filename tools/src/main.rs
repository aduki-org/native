// tools/src/main.rs

use std::path::PathBuf;
use clap::Parser;
use tokio::sync::broadcast;

mod extract;
mod server;
mod types;
mod watcher;

use types::HmrMessage;

#[derive(Parser, Debug)]
#[command(name = "native-tools", version = "0.1.0", about = "Native-First ESM Dev Pipeline")]
struct Args {
    #[arg(short, long, default_value = "src")]
    src: String,

    #[arg(short, long, default_value = "3000")]
    port: u16,

    #[arg(long, default_value = "dist")]
    dist: String,

    #[arg(short, long)]
    build: bool,
}

#[tokio::main]
async fn main() {
    // Bootstrap colored logger
    logs::init();

    let args = Args::parse();
    let src = PathBuf::from(&args.src);
    let dist = PathBuf::from(&args.dist);
    let types = dist.join("types");

    if args.build {
        extract::build(&src, &dist);
        return;
    }

    logs::info!("Bootstrapping native dev pipeline...");

    // 1. Initial type extraction pass
    extract::run(&src, &types);

    // 2. Setup communication channels for HMR events
    let (tx, _rx) = broadcast::channel::<HmrMessage>(100);

    // 3. Spawn Axum static + SSE Server
    let server_src = src.clone();
    let server_tx = tx.clone();
    tokio::spawn(async move {
        server::run(args.port, &server_src, server_tx).await;
    });

    // 4. Start concurrent watcher thread
    watcher::start(src, types, tx);

    // 5. Run until terminate signal
    tokio::signal::ctrl_c().await.unwrap();
    logs::info!("Shutting down native pipeline safely.");
}
