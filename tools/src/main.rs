// tools/src/main.rs

use std::path::PathBuf;
use clap::{Parser, Subcommand};
use tokio::sync::broadcast;

mod extract;
mod server;
mod types;
mod watcher;

use types::HmrMessage;

#[derive(Parser, Debug)]
#[command(name = "native-tools", version = "0.1.0", about = "Native-First ESM Dev Pipeline")]
struct Args {
    #[command(subcommand)]
    command: Option<Command>,

    #[arg(short, long, default_value = "src")]
    src: String,

    #[arg(short, long, default_value = "3000")]
    port: u16,

    #[arg(long, default_value = "dist")]
    dist: String,

    #[arg(short, long)]
    build: bool,
}

#[derive(Subcommand, Debug)]
enum Command {
    Scan {
        #[arg(short, long, default_value = "src")]
        src: String,

        #[arg(long)]
        watch: bool,

        #[arg(long, default_value = "dist/types")]
        types: String,
    },
    Build {
        #[arg(short, long, default_value = "src")]
        src: String,

        #[arg(long, default_value = "dist")]
        dist: String,
    },
    Dev {
        #[arg(short, long, default_value = "src")]
        src: String,

        #[arg(short, long, default_value = "3000")]
        port: u16,

        #[arg(long, default_value = "dist")]
        dist: String,
    },
}

#[tokio::main]
async fn main() {
    // Bootstrap colored logger
    logs::init();

    let args = Args::parse();

    if let Some(command) = args.command {
        match command {
            Command::Scan { src, watch, types } => {
                let src = PathBuf::from(src);
                let types = PathBuf::from(types);
                extract::run(&src, &types);

                if watch {
                    let (tx, _rx) = broadcast::channel::<HmrMessage>(16);
                    watcher::start(src, types, tx);
                    tokio::signal::ctrl_c().await.unwrap();
                }
            }
            Command::Build { src, dist } => {
                extract::build(&PathBuf::from(src), &PathBuf::from(dist));
            }
            Command::Dev { src, port, dist } => {
                run_dev(PathBuf::from(src), PathBuf::from(dist), port).await;
            }
        }
        return;
    }

    let src = PathBuf::from(&args.src);
    let dist = PathBuf::from(&args.dist);

    if args.build {
        extract::build(&src, &dist);
        return;
    }

    run_dev(src, dist, args.port).await;
}

async fn run_dev(src: PathBuf, dist: PathBuf, port: u16) {
    let types = dist.join("types");

    logs::info!("Bootstrapping native dev pipeline...");

    // 1. Initial type extraction pass
    extract::run(&src, &types);

    // 2. Setup communication channels for HMR events
    let (tx, _rx) = broadcast::channel::<HmrMessage>(16);

    // 3. Spawn Axum static + SSE Server
    let server_src = src.clone();
    let server_tx = tx.clone();
    tokio::spawn(async move {
        server::run(port, &server_src, server_tx).await;
    });

    // 4. Start concurrent watcher thread
    watcher::start(src, types, tx);

    // 5. Run until terminate signal
    tokio::signal::ctrl_c().await.unwrap();
    logs::info!("Shutting down native pipeline safely.");
}
