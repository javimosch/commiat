Organize frontend and backend code into modular, single-responsibility files (e.g., utils, services, routes, models, composables), keeping each under 300 lines for maintainability.

## Error Handling
- Use try-catch around all I/O operations (file system, network, user input)
- Never let errors propagate uncaught to the CLI — catch all and display user-friendly messages
- Log errors to the global error log via `fsLogError` for debugging
- Use optional chaining (?.) and nullish coalescing (??) for safe property access
- Validate all external inputs (API responses, user args, config files) before use
- Fail gracefully with default values when config/state files are missing or corrupted
- Never expose API keys or secrets in error messages
