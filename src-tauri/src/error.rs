//! The one error type every command returns.
//!
//! It serializes to `{ kind, message }` so the frontend can branch on `kind` and show
//! `message` as-is. Messages name the path and the OS reason, never internal state or a
//! backtrace.

use std::io;
use std::path::Path;

use serde::ser::SerializeStruct;
use serde::{Serialize, Serializer};

pub type AppResult<T> = Result<T, AppError>;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("{path} does not exist")]
    NotFound { path: String },

    #[error("Permission denied: {path}")]
    PermissionDenied { path: String },

    #[error("{path} already exists")]
    AlreadyExists { path: String },

    #[error("{0}")]
    InvalidInput(String),

    #[error("{context}: {source}")]
    Io {
        context: String,
        #[source]
        source: io::Error,
    },

    #[error("Trash: {0}")]
    Trash(String),

    #[error("Cancelled")]
    Cancelled,
}

impl AppError {
    /// Maps an I/O error on `path` to the most specific variant.
    pub fn io(path: impl AsRef<Path>, source: io::Error) -> Self {
        let path = path.as_ref().display().to_string();
        match source.kind() {
            io::ErrorKind::NotFound => Self::NotFound { path },
            io::ErrorKind::PermissionDenied => Self::PermissionDenied { path },
            io::ErrorKind::AlreadyExists => Self::AlreadyExists { path },
            _ => Self::Io {
                context: path,
                source,
            },
        }
    }

    pub fn invalid(message: impl Into<String>) -> Self {
        Self::InvalidInput(message.into())
    }

    fn kind(&self) -> &'static str {
        match self {
            Self::NotFound { .. } => "notFound",
            Self::PermissionDenied { .. } => "permissionDenied",
            Self::AlreadyExists { .. } => "alreadyExists",
            Self::InvalidInput(_) => "invalidInput",
            Self::Io { .. } => "io",
            Self::Trash(_) => "trash",
            Self::Cancelled => "cancelled",
        }
    }
}

impl From<trash::Error> for AppError {
    fn from(err: trash::Error) -> Self {
        Self::Trash(err.to_string())
    }
}

impl Serialize for AppError {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut out = serializer.serialize_struct("AppError", 2)?;
        out.serialize_field("kind", self.kind())?;
        out.serialize_field("message", &self.to_string())?;
        out.end()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn io_errors_map_to_specific_kinds() {
        let err = AppError::io("/x", io::Error::from(io::ErrorKind::PermissionDenied));
        assert_eq!(err.kind(), "permissionDenied");
        assert_eq!(err.to_string(), "Permission denied: /x");
    }

    #[test]
    fn serializes_kind_and_message_only() {
        let json = serde_json::to_value(AppError::invalid("bad name")).unwrap();
        assert_eq!(
            json,
            serde_json::json!({ "kind": "invalidInput", "message": "bad name" })
        );
    }
}
