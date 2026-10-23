//! Local MCP server (Streamable HTTP, plain JSON responses). The tools live in the frontend: Rust only carries
//! JSON-RPC over HTTP and relays `tools/call` to the webview through the `mcp-call` event / `mcp_respond` command.

use std::collections::HashMap;
use std::io::Read;
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::Duration;

use serde::Serialize;
use serde_json::{Value, json};
use tauri::{AppHandle, Emitter, State};

pub const DEFAULT_PORT: u16 = 47321;
const MAX_BODY: usize = 25 * 1024 * 1024;
const CALL_TIMEOUT: Duration = Duration::from_secs(120);
const PROTOCOL_VERSIONS: [&str; 2] = ["2025-06-18", "2025-03-26"];

/// State shared by the HTTP threads and the Tauri commands.
#[derive(Default)]
pub struct Shared {
    tools: Mutex<Vec<Value>>,
    pending: Mutex<HashMap<String, mpsc::Sender<Value>>>,
    next_call: AtomicU64,
    clients: AtomicU32,
}

impl Shared {
    fn has_tool(&self, name: &str) -> bool {
        self.tools.lock().unwrap().iter().any(|t| t["name"] == name)
    }

    /// Registers a pending call, hands its id to `emit`, and waits for `respond` with the same id.
    fn await_call(&self, emit: impl FnOnce(&str) -> Result<(), String>, timeout: Duration) -> Value {
        let id = format!("call-{}", self.next_call.fetch_add(1, Ordering::Relaxed));
        let (tx, rx) = mpsc::channel();
        self.pending.lock().unwrap().insert(id.clone(), tx);
        let outcome = emit(&id).and_then(|()| rx.recv_timeout(timeout).map_err(|_| "Timeout: l'app non ha risposto".into()));
        self.pending.lock().unwrap().remove(&id);
        outcome.unwrap_or_else(|msg| json!({ "content": [{ "type": "text", "text": msg }], "isError": true }))
    }

    fn respond(&self, id: &str, result: Value) -> Result<(), String> {
        let tx = self.pending.lock().unwrap().remove(id).ok_or_else(|| format!("Chiamata MCP sconosciuta o scaduta: {id}"))?;
        tx.send(result).map_err(|_| format!("Chiamata MCP scaduta: {id}"))
    }
}

/// How a request reaches the app: the Tauri implementation emits events, tests use a fake.
pub trait Forwarder: Send + Sync {
    /// Runs a registered tool and returns a full MCP CallToolResult.
    fn call_tool(&self, name: &str, arguments: Value) -> Value;
    fn activity(&self, method: &str, tool: Option<&str>);
}

pub struct HttpRequest<'a> {
    pub method: &'a str,
    pub path: &'a str,
    pub authorization: Option<&'a str>,
    pub origin: Option<&'a str>,
    pub body: &'a [u8],
}

#[derive(Debug, PartialEq)]
pub struct HttpResponse {
    pub status: u16,
    pub session_id: Option<String>,
    pub body: Option<Value>,
}

impl HttpResponse {
    fn empty(status: u16) -> Self {
        Self { status, session_id: None, body: None }
    }
    fn json(status: u16, body: Value) -> Self {
        Self { status, session_id: None, body: Some(body) }
    }
}

fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    a.len() == b.len() && a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

/// DNS-rebinding guard: browsers always send Origin, so only loopback origins may talk to us.
fn origin_allowed(origin: &str) -> bool {
    ["http://localhost", "http://127.0.0.1"].iter().any(|base| {
        origin.strip_prefix(base).is_some_and(|rest| {
            rest.is_empty() || rest.strip_prefix(':').is_some_and(|p| !p.is_empty() && p.bytes().all(|b| b.is_ascii_digit()))
        })
    })
}

fn rpc_error(id: Value, code: i64, message: &str) -> Value {
    json!({ "jsonrpc": "2.0", "id": id, "error": { "code": code, "message": message } })
}

pub fn handle(req: &HttpRequest, token: &str, shared: &Shared, fwd: &dyn Forwarder) -> HttpResponse {
    if req.origin.is_some_and(|o| !origin_allowed(o)) {
        return HttpResponse::empty(403);
    }
    let bearer = req.authorization.and_then(|h| h.strip_prefix("Bearer ")).unwrap_or("");
    if !constant_time_eq(bearer.as_bytes(), token.as_bytes()) {
        return HttpResponse::empty(401);
    }
    if req.path.split('?').next() != Some("/mcp") {
        return HttpResponse::empty(404);
    }
    match req.method {
        "POST" => {}
        "DELETE" => return HttpResponse::empty(200),
        _ => return HttpResponse::empty(405),
    }

    let msg: Value = match serde_json::from_slice(req.body) {
        Ok(v) => v,
        Err(_) => return HttpResponse::json(400, rpc_error(Value::Null, -32700, "Parse error")),
    };
    if msg.is_array() {
        return HttpResponse::json(400, rpc_error(Value::Null, -32600, "Batch requests are not supported"));
    }
    let method = msg["method"].as_str().unwrap_or("");
    let tool = (method == "tools/call").then(|| msg["params"]["name"].as_str()).flatten();
    fwd.activity(method, tool);

    // Notifications and client responses carry no id and expect no answer.
    let Some(id) = msg.get("id").cloned() else {
        return HttpResponse::empty(202);
    };
    let params = &msg["params"];
    let result = match method {
        "initialize" => {
            shared.clients.fetch_add(1, Ordering::Relaxed);
            let asked = params["protocolVersion"].as_str().unwrap_or("");
            let version = PROTOCOL_VERSIONS.iter().find(|v| **v == asked).unwrap_or(&PROTOCOL_VERSIONS[0]);
            let body = json!({ "jsonrpc": "2.0", "id": id, "result": {
                "protocolVersion": version,
                "capabilities": { "tools": { "listChanged": false } },
                "serverInfo": { "name": "pdf-toolkit", "title": "PDF Toolkit", "version": env!("CARGO_PKG_VERSION") },
                "instructions": "Gli strumenti agiscono sul documento aperto nella finestra di PDF Toolkit. / The tools act on the document open in the PDF Toolkit window.",
            }});
            return HttpResponse { status: 200, session_id: Some(uuid::Uuid::new_v4().to_string()), body: Some(body) };
        }
        "ping" => json!({}),
        "tools/list" => json!({ "tools": *shared.tools.lock().unwrap() }),
        "tools/call" => match tool {
            Some(name) if shared.has_tool(name) => {
                fwd.call_tool(name, params.get("arguments").cloned().unwrap_or_else(|| json!({})))
            }
            _ => return HttpResponse::json(200, rpc_error(id, -32602, "Unknown tool")),
        },
        _ => return HttpResponse::json(200, rpc_error(id, -32601, "Method not found")),
    };
    HttpResponse::json(200, json!({ "jsonrpc": "2.0", "id": id, "result": result }))
}

struct TauriForwarder {
    app: AppHandle,
    shared: Arc<Shared>,
}

impl Forwarder for TauriForwarder {
    fn call_tool(&self, name: &str, arguments: Value) -> Value {
        self.shared.await_call(
            |id| {
                self.app
                    .emit_to("main", "mcp-call", json!({ "id": id, "name": name, "arguments": arguments }))
                    .map_err(|e| format!("Impossibile inoltrare la chiamata all'app: {e}"))
            },
            CALL_TIMEOUT,
        )
    }

    fn activity(&self, method: &str, tool: Option<&str>) {
        let _ = self.app.emit_to("main", "mcp-activity", json!({ "method": method, "tool": tool }));
    }
}

/// A listening server; `stop` closes the socket and joins the accept thread.
pub struct Running {
    server: Arc<tiny_http::Server>,
    stopping: Arc<AtomicBool>,
    thread: JoinHandle<()>,
    pub port: u16,
}

impl Running {
    pub fn stop(self) {
        let Running { server, stopping, thread, port } = self;
        stopping.store(true, Ordering::SeqCst);
        server.unblock();
        let _ = thread.join();
        drop(server);
        // tiny_http drops its listener on its own accept thread; wait for it so a restart on the same port can bind.
        for _ in 0..200 {
            if std::net::TcpListener::bind(("127.0.0.1", port)).is_ok() {
                break;
            }
            std::thread::sleep(Duration::from_millis(10));
        }
    }
}

fn header<'a>(rq: &'a tiny_http::Request, name: &'static str) -> Option<&'a str> {
    rq.headers().iter().find(|h| h.field.equiv(name)).map(|h| h.value.as_str())
}

fn serve(mut rq: tiny_http::Request, token: &str, shared: &Shared, fwd: &dyn Forwarder) {
    let mut body = Vec::new();
    let too_large = rq.body_length().is_some_and(|n| n > MAX_BODY)
        || rq.as_reader().take(MAX_BODY as u64 + 1).read_to_end(&mut body).is_err()
        || body.len() > MAX_BODY;
    let resp = if too_large {
        HttpResponse::empty(413)
    } else {
        let method = rq.method().as_str().to_owned();
        let req = HttpRequest {
            method: &method,
            path: rq.url(),
            authorization: header(&rq, "Authorization"),
            origin: header(&rq, "Origin"),
            body: &body,
        };
        handle(&req, token, shared, fwd)
    };
    let has_body = resp.body.is_some();
    let mut out = tiny_http::Response::from_data(resp.body.map(|b| b.to_string().into_bytes()).unwrap_or_default())
        .with_status_code(resp.status);
    if has_body {
        out.add_header(tiny_http::Header::from_bytes("Content-Type", "application/json").unwrap());
    }
    if let Some(sid) = resp.session_id {
        out.add_header(tiny_http::Header::from_bytes("Mcp-Session-Id", sid).unwrap());
    }
    if resp.status == 405 {
        out.add_header(tiny_http::Header::from_bytes("Allow", "POST, DELETE").unwrap());
    }
    let _ = rq.respond(out);
}

/// tiny_http on its own thread: synchronous, tiny dependency tree, and `unblock` + drop releases the port cleanly.
/// Each request gets a thread because `tools/call` may wait up to two minutes for the webview.
pub fn start(port: u16, token: String, shared: Arc<Shared>, fwd: Arc<dyn Forwarder>) -> Result<Running, String> {
    let server = Arc::new(
        tiny_http::Server::http(("127.0.0.1", port)).map_err(|e| format!("Impossibile avviare il server MCP sulla porta {port}: {e}"))?,
    );
    let port = server.server_addr().to_ip().map_or(port, |a| a.port());
    let stopping = Arc::new(AtomicBool::new(false));
    let thread = {
        let (server, stopping, token) = (server.clone(), stopping.clone(), Arc::<str>::from(token));
        std::thread::spawn(move || {
            while !stopping.load(Ordering::SeqCst) {
                let Ok(rq) = server.recv() else { continue };
                let (token, shared, fwd) = (token.clone(), shared.clone(), fwd.clone());
                std::thread::spawn(move || serve(rq, &token, &shared, &*fwd));
            }
        })
    };
    Ok(Running { server, stopping, thread, port })
}

#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct McpStatus {
    running: bool,
    port: u16,
    error: Option<String>,
    clients: u32,
}

pub struct Mcp {
    shared: Arc<Shared>,
    server: Mutex<(Option<Running>, u16, Option<String>)>,
}

impl Default for Mcp {
    fn default() -> Self {
        Self { shared: Arc::default(), server: Mutex::new((None, DEFAULT_PORT, None)) }
    }
}

impl Mcp {
    fn status(&self, guard: &(Option<Running>, u16, Option<String>)) -> McpStatus {
        McpStatus {
            running: guard.0.is_some(),
            port: guard.0.as_ref().map_or(guard.1, |r| r.port),
            error: guard.2.clone(),
            clients: self.shared.clients.load(Ordering::Relaxed),
        }
    }
}

#[tauri::command]
pub fn mcp_set_tools(state: State<Mcp>, tools: Value) -> Result<(), String> {
    let Value::Array(tools) = tools else { return Err("tools deve essere un array".into()) };
    *state.shared.tools.lock().unwrap() = tools;
    Ok(())
}

#[tauri::command]
pub fn mcp_respond(state: State<Mcp>, id: String, result: Value) -> Result<(), String> {
    state.shared.respond(&id, result)
}

#[tauri::command]
pub fn mcp_status(state: State<Mcp>) -> McpStatus {
    state.status(&state.server.lock().unwrap())
}

#[tauri::command]
pub fn mcp_configure(app: AppHandle, state: State<Mcp>, enabled: bool, port: u16, token: String) -> Result<McpStatus, String> {
    if enabled && token.chars().count() < 24 {
        return Err("Il token deve contenere almeno 24 caratteri".into());
    }
    let mut guard = state.server.lock().unwrap();
    if let Some(running) = guard.0.take() {
        running.stop();
    }
    guard.1 = port;
    guard.2 = None;
    if enabled {
        let fwd = Arc::new(TauriForwarder { app, shared: state.shared.clone() });
        match start(port, token, state.shared.clone(), fwd) {
            Ok(running) => guard.0 = Some(running),
            Err(e) => guard.2 = Some(e),
        }
    }
    let status = state.status(&guard);
    status.error.clone().map_or(Ok(status), Err)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use std::net::{TcpListener, TcpStream};

    const TOKEN: &str = "test-token-0123456789abcdef";

    #[derive(Default)]
    struct Fake {
        calls: Mutex<Vec<(String, Value)>>,
        activity: Mutex<Vec<String>>,
    }

    impl Forwarder for Fake {
        fn call_tool(&self, name: &str, arguments: Value) -> Value {
            self.calls.lock().unwrap().push((name.into(), arguments.clone()));
            json!({ "content": [{ "type": "text", "text": format!("ran {name}") }], "structuredContent": arguments })
        }
        fn activity(&self, method: &str, _tool: Option<&str>) {
            self.activity.lock().unwrap().push(method.into());
        }
    }

    fn shared_with_tools() -> Shared {
        let s = Shared::default();
        *s.tools.lock().unwrap() = vec![json!({ "name": "get_page_count", "description": "d", "inputSchema": { "type": "object" } })];
        s
    }

    fn post(body: &str, auth: Option<&str>, origin: Option<&str>, shared: &Shared, fwd: &Fake) -> HttpResponse {
        let req = HttpRequest { method: "POST", path: "/mcp", authorization: auth, origin, body: body.as_bytes() };
        handle(&req, TOKEN, shared, fwd)
    }

    fn ok(body: &str, shared: &Shared, fwd: &Fake) -> HttpResponse {
        post(body, Some(&format!("Bearer {TOKEN}")), None, shared, fwd)
    }

    #[test]
    fn auth_is_required_and_checked() {
        let (s, f) = (shared_with_tools(), Fake::default());
        let ping = r#"{"jsonrpc":"2.0","id":1,"method":"ping"}"#;
        assert_eq!(post(ping, None, None, &s, &f).status, 401);
        assert_eq!(post(ping, Some("Bearer wrong-token-0123456789abcde"), None, &s, &f).status, 401);
        assert_eq!(post(ping, Some(TOKEN), None, &s, &f).status, 401);
        let r = ok(ping, &s, &f);
        assert_eq!(r.status, 200);
        assert_eq!(r.body.unwrap(), json!({ "jsonrpc": "2.0", "id": 1, "result": {} }));
    }

    #[test]
    fn foreign_origins_are_rejected() {
        let (s, f) = (shared_with_tools(), Fake::default());
        let ping = r#"{"jsonrpc":"2.0","id":1,"method":"ping"}"#;
        let auth = format!("Bearer {TOKEN}");
        for bad in ["https://evil.com", "http://localhost.evil.com", "http://127.0.0.1:80x", "http://localhost:", "null"] {
            assert_eq!(post(ping, Some(&auth), Some(bad), &s, &f).status, 403, "{bad}");
        }
        for good in ["http://localhost", "http://localhost:1420", "http://127.0.0.1:47321"] {
            assert_eq!(post(ping, Some(&auth), Some(good), &s, &f).status, 200, "{good}");
        }
    }

    #[test]
    fn initialize_negotiates_version_and_sets_session() {
        let (s, f) = (shared_with_tools(), Fake::default());
        let init = |v: &str| ok(&format!(r#"{{"jsonrpc":"2.0","id":0,"method":"initialize","params":{{"protocolVersion":"{v}"}}}}"#), &s, &f);
        let r = init("2025-03-26");
        assert_eq!(r.session_id.as_ref().map(String::len), Some(36));
        let body = r.body.unwrap();
        assert_eq!(body["result"]["protocolVersion"], "2025-03-26");
        assert_eq!(body["result"]["capabilities"], json!({ "tools": { "listChanged": false } }));
        assert_eq!(body["result"]["serverInfo"]["name"], "pdf-toolkit");
        assert_eq!(init("2024-11-05").body.unwrap()["result"]["protocolVersion"], "2025-06-18");
        assert_eq!(s.clients.load(Ordering::Relaxed), 2);
    }

    #[test]
    fn tools_list_returns_registered_tools() {
        let (s, f) = (shared_with_tools(), Fake::default());
        let body = ok(r#"{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{"cursor":"x"}}"#, &s, &f).body.unwrap();
        assert_eq!(body["result"]["tools"], json!(*s.tools.lock().unwrap()));
    }

    #[test]
    fn tools_call_forwards_and_returns_frontend_result() {
        let (s, f) = (shared_with_tools(), Fake::default());
        let body = ok(r#"{"jsonrpc":"2.0","id":"a","method":"tools/call","params":{"name":"get_page_count","arguments":{"x":1}}}"#, &s, &f)
            .body
            .unwrap();
        assert_eq!(body["id"], "a");
        assert_eq!(body["result"]["content"][0]["text"], "ran get_page_count");
        assert_eq!(*f.calls.lock().unwrap(), [("get_page_count".to_string(), json!({ "x": 1 }))]);
    }

    #[test]
    fn unknown_tool_and_method_are_errors() {
        let (s, f) = (shared_with_tools(), Fake::default());
        let r = ok(r#"{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"rm_rf"}}"#, &s, &f);
        assert_eq!((r.status, r.body.unwrap()["error"]["code"].clone()), (200, json!(-32602)));
        assert!(f.calls.lock().unwrap().is_empty());
        let r = ok(r#"{"jsonrpc":"2.0","id":4,"method":"resources/list"}"#, &s, &f);
        assert_eq!(r.body.unwrap()["error"]["code"], -32601);
    }

    #[test]
    fn notification_gets_202_and_activity() {
        let (s, f) = (shared_with_tools(), Fake::default());
        assert_eq!(ok(r#"{"jsonrpc":"2.0","method":"notifications/initialized"}"#, &s, &f), HttpResponse::empty(202));
        assert_eq!(*f.activity.lock().unwrap(), ["notifications/initialized"]);
    }

    #[test]
    fn batch_and_garbage_are_rejected() {
        let (s, f) = (shared_with_tools(), Fake::default());
        let r = ok(r#"[{"jsonrpc":"2.0","id":1,"method":"ping"}]"#, &s, &f);
        assert_eq!((r.status, r.body.unwrap()["error"]["code"].clone()), (400, json!(-32600)));
        let r = ok("{not json", &s, &f);
        assert_eq!((r.status, r.body.unwrap()["error"]["code"].clone()), (400, json!(-32700)));
    }

    #[test]
    fn http_methods_and_paths() {
        let (s, f) = (shared_with_tools(), Fake::default());
        let auth = format!("Bearer {TOKEN}");
        let req = |method, path| handle(&HttpRequest { method, path, authorization: Some(&auth), origin: None, body: b"" }, TOKEN, &s, &f).status;
        assert_eq!(req("GET", "/mcp"), 405);
        assert_eq!(req("DELETE", "/mcp"), 200);
        assert_eq!(req("POST", "/other"), 404);
    }

    #[test]
    fn await_call_resolves_and_times_out() {
        let s = Arc::new(Shared::default());
        let s2 = s.clone();
        let got = s.await_call(
            move |id| {
                let id = id.to_string();
                std::thread::spawn(move || s2.respond(&id, json!({ "content": [] })).unwrap());
                Ok(())
            },
            Duration::from_secs(5),
        );
        assert_eq!(got, json!({ "content": [] }));
        let got = s.await_call(|_| Ok(()), Duration::from_millis(20));
        assert_eq!(got["isError"], true);
        assert!(s.pending.lock().unwrap().is_empty());
        assert!(s.respond("call-1", json!({})).is_err());
    }

    fn raw_http(port: u16, request: &str) -> String {
        let mut stream = TcpStream::connect(("127.0.0.1", port)).unwrap();
        stream.write_all(request.as_bytes()).unwrap();
        let mut out = String::new();
        stream.read_to_string(&mut out).unwrap();
        out
    }

    #[test]
    fn real_socket_round_trip_and_stop_releases_port() {
        let running = start(0, TOKEN.into(), Arc::new(shared_with_tools()), Arc::new(Fake::default())).unwrap();
        let port = running.port;
        let body = r#"{"jsonrpc":"2.0","id":1,"method":"tools/list"}"#;
        let resp = raw_http(
            port,
            &format!(
                "POST /mcp HTTP/1.1\r\nHost: x\r\nAuthorization: Bearer {TOKEN}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                body.len()
            ),
        );
        assert!(resp.starts_with("HTTP/1.1 200"), "{resp}");
        assert!(resp.contains("\"get_page_count\""), "{resp}");
        let resp = raw_http(port, "GET /mcp HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n");
        assert!(resp.starts_with("HTTP/1.1 401"), "{resp}");
        running.stop();
        TcpListener::bind(("127.0.0.1", port)).expect("port released after stop");
    }
}
