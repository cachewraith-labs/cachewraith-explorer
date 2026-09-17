//! Direct, synchronous filesystem access: listing, metadata, and the small operations that
//! finish instantly (new folder, rename). Anything that can take long is a job — see
//! `crate::jobs`.

pub mod change;
pub mod entry;
pub mod ops;
pub mod paths;
pub mod places;
pub mod properties;
pub mod usage;

pub use change::{PathChange, PathChangeSink};
pub use entry::{Entry, EntryKind};
