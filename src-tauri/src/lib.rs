use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Mutex;
use std::sync::atomic::{AtomicU64, Ordering};

use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_fs::FsExt;

mod mcp;

/// Paths opened via Finder / argv that the frontend has not drained yet.
#[derive(Default)]
struct OpenedFiles(Mutex<Vec<String>>);

fn has_pdf_ext(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| ["pdf", "p7m", "lptk"].iter().any(|x| e.eq_ignore_ascii_case(x)))
}

fn check_allowed(path: &Path) -> Result<(), String> {
    if !has_pdf_ext(path) {
        return Err(format!("Tipo di file non supportato: {}", path.display()));
    }
    if !path.is_file() {
        return Err(format!("File non trovato: {}", path.display()));
    }
    Ok(())
}

fn open_paths(app: &AppHandle, paths: impl IntoIterator<Item = PathBuf>) {
    let scope = app.fs_scope();
    let opened: Vec<String> = paths
        .into_iter()
        .filter(|p| check_allowed(p).is_ok() && scope.allow_file(p).is_ok())
        .map(|p| p.to_string_lossy().into_owned())
        .collect();
    if opened.is_empty() {
        return;
    }
    app.state::<OpenedFiles>()
        .0
        .lock()
        .unwrap()
        .extend(opened.iter().cloned());
    let _ = app.emit("open-files", opened);
}

#[tauri::command]
fn take_opened_files(state: tauri::State<OpenedFiles>) -> Vec<String> {
    std::mem::take(&mut *state.0.lock().unwrap())
}

#[tauri::command]
fn allow_file(app: AppHandle, path: String) -> Result<(), String> {
    let path = PathBuf::from(path);
    check_allowed(&path)?;
    app.fs_scope()
        .allow_file(&path)
        .map_err(|e| format!("Impossibile autorizzare il file: {e}"))
}

fn ghostscript_candidates() -> Vec<PathBuf> {
    let exe = if cfg!(windows) { "gswin64c.exe" } else { "gs" };
    // The copy bundled with the app (Tauri sidecar, next to the executable) comes first.
    let mut out: Vec<PathBuf> = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.join(if cfg!(windows) { "gs.exe" } else { "gs" })))
        .into_iter()
        .collect();
    out.extend(std::env::var_os("PATH")
        .map(|p| std::env::split_paths(&p).map(|d| d.join(exe)).collect::<Vec<_>>())
        .into_iter()
        .flatten());
    if cfg!(windows) {
        let mut installs: Vec<PathBuf> = std::fs::read_dir(r"C:\Program Files\gs")
            .map(|rd| rd.flatten().map(|e| e.path().join("bin").join(exe)).collect())
            .unwrap_or_default();
        installs.sort();
        installs.reverse(); // newest version first
        out.extend(installs);
    } else {
        // GUI apps on macOS do not inherit the shell PATH.
        out.extend(["/opt/homebrew/bin/gs", "/usr/local/bin/gs", "/usr/bin/gs"].map(PathBuf::from));
    }
    out
}

fn find_ghostscript() -> Option<PathBuf> {
    ghostscript_candidates().into_iter().find(|p| p.is_file())
}

#[tauri::command]
fn ghostscript_path() -> Option<String> {
    find_ghostscript().map(|p| p.to_string_lossy().into_owned())
}

/// sRGB profile shipped with Ghostscript: `<prefix>/iccprofiles` (Windows) or
/// `<prefix>/share/ghostscript/<ver>/iccprofiles` (Unix, Homebrew via the Cellar symlink target).
fn find_srgb_icc(gs: &Path) -> Option<PathBuf> {
    let real = std::fs::canonicalize(gs).unwrap_or_else(|_| gs.to_path_buf());
    let mut prefixes = vec![];
    for bin in [gs, real.as_path()] {
        if let Some(prefix) = bin.parent().and_then(Path::parent) {
            prefixes.push(prefix.to_path_buf());
        }
    }
    prefixes.into_iter().find_map(|prefix| {
        let direct = prefix.join("iccprofiles").join("srgb.icc");
        if direct.is_file() {
            return Some(direct);
        }
        let mut versions: Vec<PathBuf> = std::fs::read_dir(prefix.join("share").join("ghostscript"))
            .ok()?
            .flatten()
            .map(|e| e.path().join("iccprofiles").join("srgb.icc"))
            .filter(|p| p.is_file())
            .collect();
        versions.sort();
        versions.pop()
    })
}

fn ps_string(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 2);
    out.push('(');
    for c in s.chars() {
        if matches!(c, '\\' | '(' | ')') {
            out.push('\\');
        }
        out.push(c);
    }
    out.push(')');
    out
}

/// The sRGB profile as Ghostscript should open it: a file when one ships beside the binary, otherwise the copy
/// compiled into the self-contained build's ROM file system.
fn icc_location(gs: &Path) -> (String, bool) {
    match find_srgb_icc(gs) {
        Some(p) => (p.to_string_lossy().into_owned(), true),
        None => ("%rom%iccprofiles/srgb.icc".into(), false),
    }
}

fn pdfa_def_ps(icc: &str) -> String {
    format!(
        "%!\n\
/ICCProfile {} def\n\
[/_objdef {{icc_PDFA}} /type /stream /OBJ pdfmark\n\
[{{icc_PDFA}} << /N 3 >> /PUT pdfmark\n\
[{{icc_PDFA}} ICCProfile (r) file /PUT pdfmark\n\
[/_objdef {{OutputIntent_PDFA}} /type /dict /OBJ pdfmark\n\
[{{OutputIntent_PDFA}} << /Type /OutputIntent /S /GTS_PDFA1 /DestOutputProfile {{icc_PDFA}} /OutputConditionIdentifier (sRGB) >> /PUT pdfmark\n\
[{{Catalog}} << /OutputIntents [ {{OutputIntent_PDFA}} ] >> /PUT pdfmark\n",
        ps_string(icc)
    )
}

fn pdfa_args(icc: &str, icc_is_file: bool, def_ps: &Path, input: &Path, output: &Path) -> Vec<String> {
    let mut args: Vec<String> = vec![
        "-dPDFA=2".into(),
        "-dBATCH".into(),
        "-dNOPAUSE".into(),
        "-dSAFER".into(),
        "-sDEVICE=pdfwrite".into(),
        "-dPDFACompatibilityPolicy=1".into(),
        "-sColorConversionStrategy=RGB".into(),
    ];
    if icc_is_file {
        args.push(format!("--permit-file-read={icc}"));
    }
    args.extend([format!("-sOutputFile={}", output.display()), def_ps.display().to_string(), input.display().to_string()]);
    args
}

fn run_pdfa(bytes: Vec<u8>) -> Result<Vec<u8>, String> {
    let gs = find_ghostscript().ok_or("Ghostscript non è installato.")?;
    let (icc, icc_is_file) = icc_location(&gs);

    static COUNTER: AtomicU64 = AtomicU64::new(0);
    let dir = std::env::temp_dir().join(format!(
        "pdf-toolkit-pdfa-{}-{}",
        std::process::id(),
        COUNTER.fetch_add(1, Ordering::Relaxed)
    ));
    std::fs::create_dir_all(&dir).map_err(|e| format!("Impossibile creare la cartella temporanea: {e}"))?;

    let result = (|| {
        let (input, output, def_ps) = (dir.join("input.pdf"), dir.join("output.pdf"), dir.join("PDFA_def.ps"));
        std::fs::write(&input, &bytes).map_err(|e| format!("Impossibile scrivere il file temporaneo: {e}"))?;
        std::fs::write(&def_ps, pdfa_def_ps(&icc)).map_err(|e| format!("Impossibile scrivere il file temporaneo: {e}"))?;
        let out = Command::new(&gs)
            .args(pdfa_args(&icc, icc_is_file, &def_ps, &input, &output))
            .output()
            .map_err(|e| format!("Impossibile avviare Ghostscript: {e}"))?;
        if !out.status.success() {
            let detail = String::from_utf8_lossy(&out.stderr);
            return Err(format!("Conversione PDF/A non riuscita: {}", detail.trim()));
        }
        std::fs::read(&output).map_err(|e| format!("Impossibile leggere il PDF/A generato: {e}"))
    })();

    let _ = std::fs::remove_dir_all(&dir);
    result
}

#[tauri::command]
async fn convert_pdfa(bytes: Vec<u8>) -> Result<Vec<u8>, String> {
    tauri::async_runtime::spawn_blocking(move || run_pdfa(bytes))
        .await
        .map_err(|e| format!("Conversione PDF/A interrotta: {e}"))?
}

// Prints the webview through the native print panel; the page shows only the print sheet while printing.
#[tauri::command]
fn print_page(webview: tauri::Webview) -> Result<(), String> {
    webview.print().map_err(|e| format!("Stampa non riuscita: {e}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
        .manage(OpenedFiles::default())
        .manage(mcp::Mcp::default())
        .invoke_handler(tauri::generate_handler![
            take_opened_files,
            allow_file,
            ghostscript_path,
            convert_pdfa,
            print_page,
            mcp::mcp_set_tools,
            mcp::mcp_respond,
            mcp::mcp_status,
            mcp::mcp_configure
        ])
        .setup(|app| {
            #[cfg(desktop)]
            app.handle().plugin(tauri_plugin_updater::Builder::new().build())?;
            // macOS delivers files through RunEvent::Opened instead of argv.
            #[cfg(not(target_os = "macos"))]
            open_paths(app.handle(), std::env::args_os().skip(1).map(PathBuf::from));
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|_handle, _event| {
        #[cfg(target_os = "macos")]
        if let tauri::RunEvent::Opened { urls } = _event {
            open_paths(_handle, urls.into_iter().filter_map(|u| u.to_file_path().ok()));
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pdf_extension_check() {
        assert!(has_pdf_ext(Path::new("/a/b.pdf")));
        assert!(has_pdf_ext(Path::new("/a/B.PDF")));
        assert!(has_pdf_ext(Path::new("firmato.pdf.P7M")));
        assert!(has_pdf_ext(Path::new("/a/progetto.lptk")));
        assert!(has_pdf_ext(Path::new("/a/progetto.LPTK")));
        assert!(!has_pdf_ext(Path::new("/a/progetto.lptk.zip")));
        assert!(!has_pdf_ext(Path::new("/a/b.txt")));
        assert!(!has_pdf_ext(Path::new("/a/pdf")));
        assert!(!has_pdf_ext(Path::new("/a/b.pdf.exe")));
    }

    #[test]
    fn check_allowed_rejects_missing_and_wrong_type() {
        assert!(check_allowed(Path::new("/definitely/missing.pdf")).unwrap_err().starts_with("File non trovato"));
        let txt = std::env::temp_dir().join("pdf-toolkit-test.txt");
        std::fs::write(&txt, b"x").unwrap();
        assert!(check_allowed(&txt).unwrap_err().starts_with("Tipo di file non supportato"));
        let pdf = std::env::temp_dir().join("pdf-toolkit-test.pdf");
        std::fs::write(&pdf, b"x").unwrap();
        assert_eq!(check_allowed(&pdf), Ok(()));
        let _ = (std::fs::remove_file(txt), std::fs::remove_file(pdf));
    }

    #[test]
    fn builds_ghostscript_command_line() {
        let dir = Path::new("/tmp/job");
        let args = pdfa_args(
            "/opt/homebrew/share/ghostscript/10.04.0/iccprofiles/srgb.icc",
            true,
            &dir.join("PDFA_def.ps"),
            &dir.join("input.pdf"),
            &dir.join("output.pdf"),
        );
        assert_eq!(
            args,
            [
                "-dPDFA=2",
                "-dBATCH",
                "-dNOPAUSE",
                "-dSAFER",
                "-sDEVICE=pdfwrite",
                "-dPDFACompatibilityPolicy=1",
                "-sColorConversionStrategy=RGB",
                "--permit-file-read=/opt/homebrew/share/ghostscript/10.04.0/iccprofiles/srgb.icc",
                "-sOutputFile=/tmp/job/output.pdf",
                "/tmp/job/PDFA_def.ps",
                "/tmp/job/input.pdf",
            ]
        );
    }

    #[test]
    fn pdfa_def_escapes_icc_path() {
        let ps = pdfa_def_ps(r"C:\Program Files\gs\gs10.04.0\iccprofiles\srgb (1).icc");
        assert!(ps.contains(r"/ICCProfile (C:\\Program Files\\gs\\gs10.04.0\\iccprofiles\\srgb \(1\).icc) def"));
        assert!(ps.contains("/OutputIntents [ {OutputIntent_PDFA} ]"));
    }

    #[test]
    fn rom_profile_needs_no_file_permission() {
        let dir = Path::new("/tmp/job");
        let args = pdfa_args("%rom%iccprofiles/srgb.icc", false, &dir.join("d.ps"), &dir.join("i.pdf"), &dir.join("o.pdf"));
        assert!(!args.iter().any(|a| a.starts_with("--permit-file-read")));
    }
}
