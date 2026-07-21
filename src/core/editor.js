const { spawn } = require("child_process");

const {
  ensureGlobalConfigFileExists,
  GLOBAL_CONFIG_PATH,
} = require("./globalStore");

function parseEditorCommand(editorEnv) {
  if (editorEnv == null || typeof editorEnv !== "string") {
    return null;
  }
  const trimmed = editorEnv.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;
  return { command: parts[0], args: parts.slice(1) };
}

function openConfigInEditor() {
  try {
    ensureGlobalConfigFileExists();
  } catch (error) {
    console.error(`\n❌ Error: ${error?.message ?? String(error)}`);
    process.exit(1);
  }
  const parsed = parseEditorCommand(process.env.EDITOR || "nano");
  if (!parsed) {
    console.error("\n❌ No editor configured. Set the EDITOR environment variable.");
    process.exit(1);
  }
  const { command, args } = parsed;
  console.log(`Opening global config ${GLOBAL_CONFIG_PATH} in ${command}...`);
  const child = spawn(command, [...args, GLOBAL_CONFIG_PATH], {
    stdio: "inherit",
    detached: true,
    shell: false,
  });
  child.on("error", (err) => {
    console.error(`\n❌ Failed to start editor '${command}': ${err.message}`);
    console.error(
      `Please ensure '${command}' is installed and in your PATH, or set the EDITOR environment variable.`,
    );
    process.exit(1);
  });
  child.on("exit", (code, signal) => {
    if (code === 0) {
      console.log(`\nEditor closed. Global config file saved (hopefully 😉).`);
    } else {
      console.warn(`\nEditor exited with code ${code} (signal: ${signal}).`);
    }
  });
}

module.exports = {
  openConfigInEditor,
  parseEditorCommand,
};
