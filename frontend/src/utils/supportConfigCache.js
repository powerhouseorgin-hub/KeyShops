// In-memory cache (module scope, platform-wide singleton config, no
// user-scoping needed) - shared by CustomerCareView, SupportContactView and
// FeedbackView, which all read the exact same config for different
// read-only displays. Not used by SupportConfigView's own fetchConfig (the
// Super Admin's editable form) - showing stale cached values there and
// having them silently jump mid-edit would be worse than a brief spinner on
// a screen that's visited rarely to begin with.
//
// Wrapped in an object (`.current`) rather than a plain exported `let`
// because ES module bindings for `let`/`var` exports are read-only from the
// importing side - only the object's property can be reassigned across
// files the way the original single-file module-scope variable was.
export const supportConfigCache = { current: null };
