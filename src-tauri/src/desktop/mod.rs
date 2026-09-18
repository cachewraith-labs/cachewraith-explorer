//! Integration with whatever Linux desktop the app runs on: which environment it is,
//! registering the app as the default file manager, and the system clipboard.

pub mod clipboard;
pub mod default_app;
pub mod entry;
pub mod environment;
pub mod file_manager1;
