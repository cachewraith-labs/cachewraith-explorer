//! The `org.freedesktop.FileManager1` D-Bus service.
//!
//! "Reveal in File Explorer" in VS Code, "Show in folder" in browsers, and most other apps
//! do not use the `inode/directory` default: they call this D-Bus service, and whichever
//! file manager provides it (GNOME Files, Dolphin, Thunar…) opens. So being the default
//! takes two parts:
//!
//! - while this app runs, it owns the bus name and opens each request in a new tab;
//! - a per-user activation file makes the bus start this app when it is not running.
//!   It lives in `$XDG_DATA_HOME/dbus-1/services`, which the bus reads before the system
//!   directories, so it wins over the file managers' own files.
//!
//! Both happen only while this app is the default file manager.

use std::fs;
use std::path::PathBuf;
use std::sync::Arc;

use gtk::gio::{self, BusNameOwnerFlags, BusType, DBusCallFlags, DBusNodeInfo, OwnerId};
use gtk::glib;
use parking_lot::Mutex;

use crate::error::{AppError, AppResult};

const NAME: &str = "org.freedesktop.FileManager1";
const OBJECT_PATH: &str = "/org/freedesktop/FileManager1";
/// Passed by the activation file, so a bus-started app knows not to open a location itself.
pub const ACTIVATION_FLAG: &str = "--dbus-activated";

const INTROSPECTION: &str = r#"<node>
  <interface name="org.freedesktop.FileManager1">
    <method name="ShowFolders">
      <arg type="as" name="URIs" direction="in"/>
      <arg type="s" name="StartupId" direction="in"/>
    </method>
    <method name="ShowItems">
      <arg type="as" name="URIs" direction="in"/>
      <arg type="s" name="StartupId" direction="in"/>
    </method>
    <method name="ShowItemProperties">
      <arg type="as" name="URIs" direction="in"/>
      <arg type="s" name="StartupId" direction="in"/>
    </method>
  </interface>
</node>"#;

/// Receives the URIs of one request: folders to show, or items whose folder to show.
pub type OpenHandler = Arc<dyn Fn(Vec<String>) + Send + Sync>;

/// Owns the bus name while claimed. Methods must be called on the GTK main thread, whose
/// main loop delivers the D-Bus callbacks.
pub struct FileManagerService {
    owner: Mutex<Option<OwnerId>>,
    on_open: OpenHandler,
}

impl FileManagerService {
    pub fn new(on_open: OpenHandler) -> Self {
        Self {
            owner: Mutex::new(None),
            on_open,
        }
    }

    /// Takes the name, replacing a file manager that already holds it (if it allows that).
    pub fn claim(&self) {
        let mut owner = self.owner.lock();
        if owner.is_some() {
            return;
        }
        let on_open = Arc::clone(&self.on_open);
        *owner = Some(gio::bus_own_name(
            BusType::Session,
            NAME,
            BusNameOwnerFlags::REPLACE | BusNameOwnerFlags::ALLOW_REPLACEMENT,
            move |connection, _| register(&connection, Arc::clone(&on_open)),
            |_, _| log::debug!("owning {NAME}"),
            |_, _| log::info!("{NAME} is owned by another file manager"),
        ));
    }

    pub fn release(&self) {
        if let Some(id) = self.owner.lock().take() {
            gio::bus_unown_name(id);
        }
    }
}

fn register(connection: &gio::DBusConnection, on_open: OpenHandler) {
    let interface = DBusNodeInfo::for_xml(INTROSPECTION)
        .ok()
        .and_then(|node| node.lookup_interface(NAME));
    let Some(interface) = interface else {
        log::warn!("{NAME}: bad introspection data");
        return;
    };
    let registered = connection.register_object(
        OBJECT_PATH,
        &interface,
        move |_, _, _, _, method, params, invocation| {
            // Every method takes (as, s); the bus has already checked the signature.
            match params.get::<(Vec<String>, String)>() {
                Some((uris, _startup_id)) => {
                    log::debug!("{NAME}.{method}: {} item(s)", uris.len());
                    on_open(uris);
                    invocation.return_value(None);
                }
                None => invocation.return_dbus_error(
                    "org.freedesktop.DBus.Error.InvalidArgs",
                    "Expected (as, s)",
                ),
            }
        },
        |_, _, _, _, _| glib::Variant::from(()),
        |_, _, _, _, _, _| false,
    );
    if let Err(err) = registered {
        log::warn!("{NAME}: could not register the object: {err}");
    }
}

fn activation_file() -> Option<PathBuf> {
    dirs::data_dir().map(|dir| dir.join("dbus-1/services").join(format!("{NAME}.service")))
}

/// Writes the per-user activation file that starts `exe` for this service. A no-op when
/// the file already says exactly that.
pub fn install_activation_file(exe: &std::path::Path) -> AppResult<()> {
    let path = activation_file().ok_or_else(|| AppError::invalid("No data directory"))?;
    let exe = exe.to_str().and_then(quote_exec_arg).ok_or_else(|| {
        AppError::invalid("The app's path cannot be used in a D-Bus service file")
    })?;
    let contents = format!("[D-BUS Service]\nName={NAME}\nExec={exe} {ACTIVATION_FLAG}\n");
    if fs::read_to_string(&path).is_ok_and(|existing| existing == contents) {
        return Ok(());
    }
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|e| AppError::io(dir, e))?;
    }
    let temp = path.with_extension("tmp-cachewraith");
    fs::write(&temp, contents).map_err(|e| AppError::io(&temp, e))?;
    fs::rename(&temp, &path).map_err(|e| AppError::io(&path, e))?;
    reload_bus_config();
    Ok(())
}

pub fn remove_activation_file() -> AppResult<()> {
    let Some(path) = activation_file() else {
        return Ok(());
    };
    match fs::remove_file(&path) {
        Ok(()) => {
            reload_bus_config();
            Ok(())
        }
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(err) => Err(AppError::io(&path, err)),
    }
}

/// Asks the session bus to re-read service files now rather than at the next login.
/// Blocking; call it off the main thread.
fn reload_bus_config() {
    let result = gio::bus_get_sync(BusType::Session, gio::Cancellable::NONE).and_then(|bus| {
        bus.call_sync(
            Some("org.freedesktop.DBus"),
            "/org/freedesktop/DBus",
            "org.freedesktop.DBus",
            "ReloadConfig",
            None,
            None,
            DBusCallFlags::NONE,
            2_000,
            gio::Cancellable::NONE,
        )
    });
    if let Err(err) = result {
        log::debug!("could not reload the D-Bus configuration: {err}");
    }
}

/// Single-quotes a path for a service file's `Exec=` line, which the bus splits like a
/// shell would. Paths with a single quote or a control character are refused.
fn quote_exec_arg(arg: &str) -> Option<String> {
    (!arg.contains('\'') && !arg.chars().any(char::is_control)).then(|| format!("'{arg}'"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn quotes_exec_paths() {
        assert_eq!(
            quote_exec_arg("/usr/bin/x").as_deref(),
            Some("'/usr/bin/x'")
        );
        assert_eq!(
            quote_exec_arg("/opt/My Apps/$x").as_deref(),
            Some("'/opt/My Apps/$x'")
        );
        assert!(quote_exec_arg("/a'b").is_none());
        assert!(quote_exec_arg("/a\nb").is_none());
    }

    #[test]
    fn introspection_parses() {
        let node = DBusNodeInfo::for_xml(INTROSPECTION).unwrap();
        assert!(node.lookup_interface(NAME).is_some());
    }
}
